# Sprint spec — `/api/video2md`: video URL → transcript markdown (yt-dlp captions)

**Status:** IMPLEMENTED 2026-06-13 (caption path: W0–W2). Route + worker + SSRF
guard + concurrency cap shipped and locally proven (real YouTube transcript via
the live route). Hardened per two lope reviews (plan + diff, codex + antigravity).
NOT YET implemented: translation (`translateTo` is accepted but ignored) and the
transcription fallback (W3, `needsTranscription` → File Engine), both gated/deferred.
**Repo:** `github.com/traylinx/2md` (html2md backend).
**Driver:** Tytus Chat video-comprehension. The bridge calls this route; full
consumer plan in `tytus-chat/sprints/2026-06-13-video-comprehension/SPRINT.md`.
**Pairs with:** the file2md `url` path (already live) for direct media files, and
the queue sprint (`docs/file2md-async-queue-sprint.md`) for the transcription
fallback under load.

---

## 1. Problem

A video URL is not a file. `POST /api/file2md` with a `youtu.be/<id>` URL
resolves to `text/html` — the YouTube **player shell**, not the video — so the
engine converts the wrapper page and returns metadata, never the spoken content.
(This is exactly why the Tytus pod agent honestly refused: it could only see the
shell.)

The cheap, correct path for YouTube and most platforms is **not** transcription —
it is downloading the **existing caption track** with `yt-dlp --write-auto-subs`,
then de-duplicating the overlapping auto-sub lines into clean text. Free, fast,
no audio processing, no File Engine bill. Transcription (audio → text) is only
needed when a video genuinely has no captions, and that reuses the file2md media
path.

**Goal:** a new `POST /api/video2md` that takes a URL and returns transcript
markdown, honoring the **same job/streaming contract** the bridge already speaks
(`format=json`, `X-Job-Id`, padding + heartbeat, `GET /api/jobs/{id}/result`), so
the bridge's existing `extract2md.ts` poll code works against it unchanged.

## 2. What already exists (reuse, don't rebuild)

- `lib/jobRegistry.js` — file-backed job store (72 h TTL), `createJob`,
  `updateJob`, `getJobResult` → `{ type, result, log }`. **Reuse verbatim.**
- `routes/file2md.js` — the **exact** response machinery to mirror: `format`
  resolution, `X-Job-Id` set **before** the 1024 B padding write, 5 s heartbeat
  (the proxy-idle-cut fix from 2026-06-13 — keep it identical), the
  `res.on('close')` "let json finish for job-poll recovery" rule, child spawn,
  `__JSON__` marker parse, temp cleanup. Copy this shape; do not invent a new one.
- `lib/formatCapabilities.js` — `family` lookup; media set already defined.
- `lib/http/errorResponse.js` — `sendError` + `ERROR_CODES`.
- The bridge already polls `X-Job-Id` → `/result`. **The async contract is live
  on the consumer side** — this route just has to honor it.

## 3. Design

### 3.1 Route (`routes/video2md.js`)
```
POST /api/video2md   (Content-Type: application/json — no file bytes, so NO multipart)
body: { url, apiKey, lang?, translateTo?, format? }
```
- Validate `url` present.
- **SSRF — egress-level, not app-layer alone (lope HIGH, both validators).** An
  app-layer host allowlist + a Node-side DNS pre-check is necessary but NOT
  sufficient: `yt-dlp` does its OWN DNS resolution, so a pre-check that passes a
  public IP can be rebound to a private IP at fetch time (TOCTOU). The real
  control is **OS-level egress restriction** — the yt-dlp subprocess (or the whole
  container) may reach only allowlisted CDN ranges; private/loopback/link-local/
  metadata ranges (`10/8`, `127/8`, `169.254/16`, `172.16/12`, `192.168/16`,
  `::1`, `fc00::/7`) blocked at iptables / an egress proxy. Keep the app-layer
  allowlist (host parsed via `URL`, **exact match, never substring**) as
  defense-in-depth. Reject → `400 VALIDATION_ERROR` (or `403`). Acceptance tests:
  redirects, punycode/IDN, IPv6 literals, CNAME-to-private, DNS rebinding.
- **Require the `apiKey` + concurrency cap from day one (lope HIGH, both
  validators).** Captions are NOT resource-free: each request forks `yt-dlp` and
  burns CPU/disk/bandwidth, and a burst can OOM the 1 GB `api` container and get
  the droplet IP blocked. So: **require the bridge key** (no keyless caption
  path), keep `tieredApiLimiter`, AND a **process semaphore**
  `VIDEO2MD_MAX_CONCURRENCY` (default ~2–4). Do not let "free" captions skip the
  same concurrency discipline the queue sprint enforces.
- Create a job (`jobRegistry.createJob('video2md', url, url, x-client-id)`),
  mirror file2md's `format=json` header/padding/heartbeat block **byte-for-byte**.
- Spawn `scripts/video2md.js` (below) with env: `VIDEO2MD_URL`, `VIDEO2MD_LANG`,
  `VIDEO2MD_TRANSLATE_TO`, `VIDEO2MD_API_KEY`.
- Same `res.on('close')` recovery rule (json → let it finish), same `__JSON__`
  parse + `jobRegistry.updateJob` on `child.close`.
- Register: `app.post('/api/video2md', video2mdHandler)`.

### 3.2 Worker script (`scripts/video2md.js`)
Mirrors `scripts/file2md.js`'s emit contract (`__JSON__` + `{ success, files }`
so the bridge's `parsePayload` reads it with **zero changes**):

1. **Fetch captions** (no download of the video itself):
   ```bash
   yt-dlp --write-auto-subs --write-subs --sub-lang <lang|en> \
     --convert-subs srt --skip-download -o /tmp/v2md_<jobid> <url>
   ```
   Also `yt-dlp --print "%(title)s|%(duration)s"` for metadata.
2. **Parse + dedup SRT** (the local manual's Step 2, verbatim logic): strip SRT
   indices / `HH:MM:SS` timestamps / blanks; drop a line if it is a substring of
   the previous (auto-sub overlap); join to one clean text block.
3. **Language fallback chain:** requested `lang` → any available auto-sub lang →
   if `translateTo` set and only another language exists, translate (yt-dlp sub
   conversion, or note the `youtube-transcript-api` translate path from the manual
   as a documented secondary — flag its IP-block risk).
4. **No captions at all** → emit `{ success:false, error:'no-captions',
   needsTranscription:true }` so the bridge can escalate to file2md audio (§3.4).
   Do NOT silently fake content. **`yt-dlp` exits non-zero when a video has no
   subs under `--skip-download`** — handle that exit code as THIS outcome, not a
   server/execution error (lope MEDIUM). `needsTranscription` is a typed terminal
   state, not an error: the bridge's shared poll helper models it explicitly.
5. **Emit VFS** exactly like file2md:
   ```
   __JSON__{"success":true,"files":{
     "full_document.md": "<clean transcript>",
     "metadata.json": "{\"source_url\":...,\"title\":...,\"lang\":...,\"duration_sec\":...,\"captions\":true}"
   }}
   ```
   `full_document.md` IS the transcript (parity with file2md `enhance=false` —
   the bridge reads `full_document_raw.md` → `full_document.md` → `pages/*.md`).

### 3.3 yt-dlp + ffmpeg on the droplet
- Install `yt-dlp` (binary) + `ffmpeg` (subtitle/audio conversion). **Bake into
  the image** (Dockerfile), do not install at runtime.
- **Pin a version + document the update cadence** — YouTube changes break yt-dlp
  often (manual Gotcha #1). A stale yt-dlp is the #1 expected failure mode; make
  updating it a one-line, logged operation.
- **Bot-detection:** YouTube may rate-limit / block the droplet IP. Document the
  cookies-file and proxy options as the escalation; never let a block fake a
  transcript — surface `error:'blocked'`.

### 3.4 Transcription fallback (no captions) — defer to the queue sprint
When captions are absent, the honest escalation is: yt-dlp downloads the **audio
only** (`-x --audio-format mp3`), then hand that file to the **existing File
Engine media path** (the same transcription the engine already does for uploaded
mp3/mp4). This is **metered** and heavy → it MUST ride the bounded
`FILE2MD_WORKER_CONCURRENCY` queue from `docs/file2md-async-queue-sprint.md`.
Keep it behind a flag (`VIDEO2MD_TRANSCRIBE_ENABLED`, default off); captions-only
is the cheap default. (Bridge side: `TYTUS_CHAT_VIDEO_TRANSCRIBE_FALLBACK_ENABLED`.)

## 4. Milestones

- **W0 — spike:** confirm `yt-dlp --write-auto-subs` against 3–4 real YouTube
  URLs on the droplet; confirm the dedup yields clean text; measure latency.
- **W1 — route + script:** `routes/video2md.js` + `scripts/video2md.js`, caption
  path only, mirroring file2md's json/job contract. SSRF guard. yt-dlp+ffmpeg in
  the image.
- **W2 — language fallback:** requested → auto → translate; `no-captions` →
  `needsTranscription`.
- **W3 — transcription fallback (gated):** audio-extract → File Engine via the
  queue. Flag default-off.
- **W4 — proof:** the bridge calls it end-to-end; the Matthew-Berman URL returns
  a real transcript; an internal-IP URL is rejected; a caption-less video returns
  `needsTranscription`.

## 5. Rollback / safety
- New route, additive — file2md and all existing routes untouched. Removing the
  route = full revert.
- SSRF allowlist is the security gate — ship it in W1, never after.
- Captions path = zero File Engine cost; transcription path is flagged off until
  the queue lands and Sebastian clears the metering question.

## 6. Contract the bridge depends on (freeze this)
- `POST /api/video2md`, `format=json`, `apiKey` as a **body field** (when
  required), `X-Job-Id` set **before** the padding write, 5 s heartbeat,
  `GET /api/jobs/{id}` → `/result` with the `{ type, result, log }` wrapper.
- Success payload: `{ success:true, files:{ "full_document.md", "metadata.json" } }`.
- No-captions: `{ success:false, error:"no-captions", needsTranscription:true }`.
- This is intentionally the **same shape as file2md** so `extract2md.ts`'s
  `parsePayload` + `pollJobResult` are reused, not forked.

---

*Author: Claude (analysis 2026-06-13). Implement under the freeze: feature branch
→ PR → codex review → merge → canary → default-on.*
