# S00A H01/H02: local baseline and compatibility harness

22 October 2026. User authorized implementation after sprint planning. Workspace
rules limit the first slice to H01/H02. No feature port or deployment performed.

## Delivered

- `BASELINE.json`: local HEAD, all tracked-source digests, original dirty state,
  installed dependency versions, 24 explicit routes and existing-test inventory.
- `REUSE_MANIFEST.json`: exact selected HoCa helper digests and static dependency
  closures. No HoCa source copied. Rights and notices remain unresolved.
- `LAB_PROFILE.json`: actual isolation, synthetic fixtures, resource limits and
  explicit prerequisites for future browser tests.
- `npm run test:compat`: 75 passing checks across six files. Raw machine-readable
  report: `TEST_RESULTS.json`. Golden bytes and unchanged consumer snapshots:
  `tests/fixtures/compat/MANIFEST.json`.
- Deliberate nested JSON, uppercase cache and changed stream delimiter detected by
  the unchanged Search adapter, original billing expression and frontend hook.

Production source, dependency versions, lockfile and consumers remain unchanged.
The sole modified pre-existing tracked file is `package.json`, adding `test:compat`.
New Vitest configuration excludes this isolated suite from the ordinary test run.
No broad `npm test`, package installation, paid call, commit, push or deployment.

## What actually ran

Real Express server on ephemeral loopback, real native/static fetching against
owned HTTP fixtures, Readability/GFM extraction, serializers, cache/registry in
temporary directories, job download signing and ZIP generation. Real route
handling exercised convert, batch, crawl, Agentify, File2MD, Video2MD, history,
logs, uploads, downloads, shortcuts, CORS and memory-pressure branches.

Browser/media/model subprocesses were event-emitting doubles; Redis and remote
storage were doubles. Video DNS was synthetic. Frontend hook executed unchanged
with injected hooks/fetch; Search TypeScript was transpiled without logic edits.
Only the exact original billing expression ran, not the whole billing service.
CLI coverage executes real `--help` and no-input exits, not a browser conversion.
No real Chromium, provider, Redis, S3 or deployed consumer was exercised.

## Isolation and reproducibility

```bash
cd /Users/sebastian/Projects/web-intelligence-automation/html2md
npm run test:compat
```

The launcher fails closed without macOS `sandbox-exec`. It uses an allowlisted
environment and temporary HOME/APP_DIR/JOBS_DIR/UPLOADS_DIR, intercepts dotenv,
denies external network at OS level and restricts Node sockets to this test
process's fixture listeners. It blocks host DNS resolution, provider imports,
checkout writes and `.env` reads. Tests verify those refusals. It caps one Vitest
worker, 768 MiB V8 heap and 120 seconds per run, then kills its own process group
and removes temporary state. This is a local characterization lab, not a
production-grade hostile-browser isolation design or a hard aggregate RSS limit.

Set `COMPAT_REPORT` to an explicit output path to retain the raw report. No golden
update switch exists. Goldens were frozen against unchanged local production
source before testing; their hashes fail on drift. Only fixture origin differs
in the live static-Markdown comparison. No output/token/error normalization.

## Remaining gates, not waived

**H01 remains in progress:** deployed image/config/runtime provenance is unknown;
README MIT versus LICENSE Apache-2.0 notices conflict; HoCa reuse/distribution
rights still need resolution. Browser executable digest and enforceable browser
CPU/RSS/subresource limits are not qualified. No browser starts in this slice.

**H02 remains in progress:** passing local characterization is not exhaustive
compatibility qualification. Remaining coverage includes full CLI conversion/
batch/crawl execution, actual browser extraction, complete rate-limit and
timeout/concurrency matrices, full archive-storage branches, and comparison
against the deployed baseline. Enhanced enabled/busy parity belongs to H07.
Case-by-case limits appear in the workspace execution record.

Independent code review remains pending. No approval inferred for H03–H08, S05,
new routes, credentials, production tests, publication or release.

## Findings and rollback

- Search's maxAge comment says seconds; API uses hours. Tests preserve actual
  behavior. Fixing documentation or semantics requires a separate change.
- Browser/static/native failures use different stream/error shapes. Tests retain
  those differences rather than redesigning the API.
- Video2MD worker output uses `files['full_document.md']`, not File2MD's
  top-level Markdown fixture. The test double was corrected, not application code.
- Legacy host/path cache is not private-session safe. No private capture enabled.
- The synthetic owner-labelled job's log endpoint remains readable without that
  label, unlike its detail/result endpoints. This is a pre-existing behavior
  requiring separate security review, not a claimed production leak or a safety
  property to copy into the new private path.

Rollback affects only new tests/config/evidence and the added package script.
Review the exact diff; remove only this slice's additions if requested. Preserve
`PRODUCT_PLAN_TRAYLINX_WEB.md` and all pre-existing work. No application storage,
schema or deployment migration requires reversal.
