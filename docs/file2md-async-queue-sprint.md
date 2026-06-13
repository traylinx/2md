# Sprint spec — Move `file2md` onto the BullMQ queue (bounded concurrency)

**Status:** SPEC ONLY — not implemented. Drafted 2026-06-13.
**Repo:** `github.com/traylinx/2md` (html2md backend).
**Driver:** Tytus Chat file-comprehension scaling. Pairs with the `TYTUS_CHAT_FILE2MD_BASE_URL` Netlify-bypass (already shipped) and the proxy-idle-cut fix (PR #2).

---

## 1. Problem

`POST /api/file2md` is the **only** conversion path that does *not* use the BullMQ
queue. `routes/file2md.js` spawns a Node child **synchronously, per request, inside
the `api` container** (`spawn('node', ['scripts/file2md.js'])`) and holds the HTTP
connection open for the full OCR duration (5–30 s).

Measured capacity (2026-06-13):

- Droplet `167.71.141.141`: **2 vCPU, 3.8 GB RAM**. Single `api` + single `worker`,
  no replicas/cluster/HPA.
- `api` and `worker` containers are each capped at **1 GB** (compose).
- Each `file2md` child ≈ 50–80 MB. The `api` container therefore tops out at
  **~12–18 concurrent extractions** before it OOM-kills — which drops **every**
  in-flight job, not just the excess.
- `express-rate-limit` caps request *rate*, not in-flight *concurrency*. Long-held
  connections accumulate, so a burst (e.g. 30 users dropping files at once) tips it.

The other queues are already bounded — `worker.js` runs each with an explicit
`concurrency`: convert=5, batch=2, crawl=2, agentify=1. `file2md` is the outlier.

**Goal:** route `file2md` through the same BullMQ pattern with a worker concurrency
cap, so a request burst queues instead of fork-bombing the `api` container — while
keeping the response contract that current clients (the bridge, the CLI, public
2md users) depend on.

## 2. What already exists (reuse, don't rebuild)

- `lib/queue.js` — `convertQueue/batchQueue/crawlQueue/agentifyQueue` over Redis
  (ioredis, TLS for `rediss://`), `DEFAULT_JOB_OPTS` (2 attempts, exp backoff,
  `removeOnComplete age 3600`, `removeOnFail age 86400`), `addXJob(jobId, data)`
  helpers, and `publishLog`/`appendLogBuffer` for SSE streaming.
- `worker.js` — `new Worker('2md-convert', handler, { connection, concurrency: 5 })`
  with a `runProcess(cmd, args, env, jobId)` helper that spawns the child, streams
  output to Redis pub/sub + the log buffer, and resolves on close. Writes results to
  `jobRegistry` (`status: running → done/failed`, `inlineResult`, `inlineLog`).
  Graceful shutdown closes all workers.
- `lib/jobRegistry.js` — file-backed job store (72 h TTL). `getJobResult(id)` returns
  `{ type, result: inlineResult, log }`.
- **The bridge already polls** `GET /api/jobs/{id}` → `/result` via the `X-Job-Id`
  header (the recovery path in `extract2md.ts`). The async contract is already live
  on the consumer side — this sprint makes the producer honor it under load.

## 3. Design

### 3.1 Queue wiring (`lib/queue.js`)
Add a fifth queue mirroring the others exactly:
```js
file2mdQueue = new Queue('2md-file2md', { connection });
async function addFile2mdJob(jobId, data) {
  if (!file2mdQueue) return null;
  return file2mdQueue.add(jobId, data, { ...DEFAULT_JOB_OPTS, jobId, timeout: 1_260_000 }); // ~21 min (child self-caps at ~20)
}
```
Export `file2mdQueue` + `addFile2mdJob`.

### 3.2 Worker processor (`worker.js`)
Add a `file2mdWorker` that runs the **same** `scripts/file2md.js`, moving the child
out of the `api` container into the bounded `worker`:
```js
const file2mdWorker = new Worker('2md-file2md', async (job) => {
  const { jobId, envVars } = job.data;          // FILE2MD_FILE_PATH, _API_KEY, _ENHANCE, ...
  jobRegistry.updateJob(jobId, { status: 'running' });
  const env = Object.assign({}, process.env, envVars);
  const { output } = await runProcess('node', [path.join(SCRIPTS_DIR, 'file2md.js')], env, jobId);
  const result = parseJsonMarker(output);       // the existing __JSON__ parse, lifted from routes/file2md.js
  if (result && result.success) {
    jobRegistry.updateJob(jobId, { status: 'done', completedAt: ..., inlineResult: result, inlineLog: output.slice(0,50000) });
  } else {
    jobRegistry.updateJob(jobId, { status: 'failed', error: result?.error || 'No result returned' });
  }
  if (envVars.FILE2MD_FILE_PATH) { try { fs.unlinkSync(envVars.FILE2MD_FILE_PATH); } catch {} } // temp upload cleanup
}, { connection, concurrency: Number(process.env.FILE2MD_WORKER_CONCURRENCY || 8) });
```
- **Concurrency cap** = `FILE2MD_WORKER_CONCURRENCY` (default **8**). This is the whole
  point: ≤8 children + ≤8 concurrent File Engine calls at a time, regardless of
  request burst. Tune against the worker's 1 GB cap (8 × ~80 MB ≈ 640 MB, safe).
- The **temp upload must be reachable by the worker.** Today multer writes it into the
  `api` container's filesystem. The `api` and `worker` are separate containers, so the
  upload path must be on a **shared volume** (add a `file2md_uploads` volume mounted in
  both, point multer's `dest` at it) OR the file is uploaded to the File Engine by the
  `api` before enqueue (changes the script contract — heavier). **Shared volume is the
  smaller change.** Add it to compose + set multer `dest`.

### 3.3 Route (`routes/file2md.js`) — preserve the contract
Behind a flag `FILE2MD_QUEUE_ENABLED` (default off → today's synchronous spawn):

When **on**, the route stops spawning a child and instead:
1. `await addFile2mdJob(job.id, { jobId: job.id, envVars })`.
2. Set the `X-Job-Id` header (already done for json).
3. Then EITHER:
   - **(a) Hold-and-stream (default, backward-compatible):** keep the 5 s heartbeat,
     poll `jobRegistry.getJob(id)` every ~1 s, and when `status: done|failed` write the
     result inline exactly as today. The connection is held, but the *work* is bounded
     by the worker — the `api` container only holds a cheap socket + a poll loop, so
     its memory stays flat under burst. Public/CLI clients see no behavior change.
   - **(b) Return-202 (opt-in, best under load):** if the request carries
     `?async=1` (the bridge can send it), return `202 { job_id }` immediately and let
     the client poll. Zero held connections. The bridge already polls `X-Job-Id`, so
     this is a one-line bridge change later — not required for this sprint.

Recommendation: ship **(a)** as the default (no client changes, OOM risk gone), expose
**(b)** for the bridge to adopt in a follow-up once proven.

### 3.4 Backpressure
- If the queue's waiting count exceeds `FILE2MD_MAX_QUEUE_DEPTH` (default e.g. 100),
  reject new requests with **429 + `Retry-After`** instead of growing the queue
  unboundedly. Cheap check via `await file2mdQueue.getWaitingCount()`.
- Keep the existing `tieredApiLimiter` rate limit as the first line.

## 4. Milestones

- **M0 — spike (½ day):** confirm the shared-upload-volume approach end to end (api
  writes upload → worker reads it → File Engine OCR → result in jobRegistry → api
  returns inline). One file, flag on, locally.
- **M1 — queue + worker:** `2md-file2md` queue + `file2mdWorker` (concurrency env),
  temp-upload shared volume in compose. Lift the `__JSON__` parse + cleanup out of the
  route into a shared helper.
- **M2 — route flag:** `FILE2MD_QUEUE_ENABLED` hold-and-stream path (3.3a). Inline
  contract byte-for-byte unchanged when on. X-Job-Id recovery still works.
- **M3 — backpressure:** `FILE2MD_MAX_QUEUE_DEPTH` → 429. Metrics: queue depth, worker
  busy count, p50/p95 conversion latency.
- **M4 — load test (gate):** see §6. Flag on in a staging/canary, hammer it, prove the
  `api` container memory stays flat and nothing OOMs.
- **M5 — rollout:** flag on in prod, watch a week, then make it the default and delete
  the synchronous path. Optional: bridge adopts `?async=1` (3.3b).

## 5. Rollback / safety
- Everything behind `FILE2MD_QUEUE_ENABLED` (default off). Off = today's exact code
  path. Flip the env + restart to revert instantly.
- No `jobRegistry` schema change → the bridge's poll contract is untouched.
- If `REDIS_URL` is unset (local mode), the flag is ignored and the route stays
  synchronous (queue is `null`) — fail safe, not fail closed.

## 6. Load-test plan (M4 gate — the whole justification)
- Fire **50 concurrent** `POST /api/file2md` of a 1.6 MB dense image (the worst real
  case) against the flagged path, sustained for several minutes.
- **Assert:** `api` container RSS stays flat (~60–120 MB, no child processes in it);
  `worker` holds ≤ `concurrency` children; **zero OOM-kills**; every job completes
  (queued, not dropped); p95 end-to-end within budget; 429s appear only past
  `FILE2MD_MAX_QUEUE_DEPTH`.
- Compare against the **same burst on the current synchronous path** to document the
  OOM cliff this removes.

## 7. Known ceiling above this (out of scope, flag for platform)
Even bounded, the real OCR ceiling is the **shared File Engine**
(`api.makakoo.com/agentic-upload-engines`) and the **single shared key** all Tytus
Chat users funnel through. Bounding the droplet stops it self-destructing; it does
**not** raise the File Engine's throughput. Per-org keys + File Engine capacity is a
separate platform decision (Sebastian).

---

*Author: Claude (diagnostic + capacity findings 2026-06-13). Implement under the
freeze: feature branch → PR → codex review → merge → canary → default-on.*
