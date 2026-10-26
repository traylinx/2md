## Automatic backend delivery — verified 26 October 2026

Production pushes now build and automatically deploy the legacy backend and the
separate capture/egress runtime. Capture image visibility is checked as private
before and after publication. GitHub has no Kubernetes credentials: the scoped
in-cluster controllers perform promotion and preserve existing runtime settings.

- Runtime source: `2904d336bbf1262ab347fdf861d3d628b7fc2ad9`.
- [Successful build and deployment verification](https://github.com/traylinx/2md/actions/runs/40371305787).
- Fresh Sentinel proof, owned-origin Markdown capture and invalid-proof HTTP 401 passed.
- No endpoint, authentication contract, schema, grant or outbound-delivery change.
- Controller/configuration changes still require explicit operator application;
  controller/workflow/test/documentation-only commits do not rebuild app images.
- Operator instructions: `deploy/capture/README.md` and `deploy/legacy/README.md`.

---

# Automatic backend delivery — 26 October 2026

**Production-branch automatic deployment is enabled and live verified.**
A real push of runtime commit `cb79008a8875b9383184b00e215361eea7eff7eb`
built and deployed both legacy containers, with no manual operator image patch.
[GitHub run 40352503116](https://github.com/traylinx/2md/actions/runs/40352503116)
passed its build and live-deployment verification jobs.

Current legacy image:
`ghcr.io/traylinx/2md@sha256:a6cbe4b2b713049a3aae028b6e1fd8e6d23f72df97c79f589af1409cdeb739fd`.
The API reports the matching baked revision and controller-verified release proof.
API/worker are ready with zero restarts; capture/egress specifications unchanged.
Fifteen focused checks, 31 legacy compatibility checks and six RBAC checks passed.
The rollback path is implemented, not deliberately fault-triggered in production.

A restricted in-cluster controller polls production every two minutes, promotes
only a matching successful build by verified immutable digest, and preserves the
existing job PVC and runtime settings. GitHub receives no Kubernetes credentials
or tailnet access. No new server, Tailscale policy/credential change, Sentinel
change or load/soak cycle. See [automatic delivery runbook](../../../deploy/legacy/README.md).
Evidence: workspace `docs/evidence/html2md-autodeploy-implementation-2026-10-26/`.
This supersedes the earlier same-day manual-promotion note below. Documentation-only
commits do not rebuild or redeploy the unchanged runtime.

# Current capture release — 26 October 2026

Sentinel-enabled capture deployed from private immutable image
`ghcr.io/makakoo/sentinel-html2md-runtime@sha256:1ddb2d0f2e4314e893b527c7e89628085d2af0d71f3f24f4b5c7e95c43526bd4`.
Thirty runtime files match the P04-qualified source. Existing human AUTH/USERS
session and human capture route passed live checks. Thirteen agent ingress checks
passed, including public/private capture, malformed/mixed/duplicate/revoked proof,
origin denial and private-session isolation. Twelve smoke-interval events finalized,
and pending counters returned to zero. Temporary fixture removed. Evidence: workspace `docs/evidence/sentinel-consumer-release-2026-10-26/`.

Only the supplied search-agent identity has the explicit owned-origin grant.
No broad web-search access, legacy restart, schema change or outbound delivery.
Verifier access tokens are reused in memory; both caller proof checks remain live.
Six exact-image Linux integration checks passed with fresh synthetic TLS. Initial
expired-fixture failure is retained; no TLS validation was disabled.

Implementation-first owner approval supersedes the October23 rollout hold for
this bounded consumer release. Performance, long-running soak and scaling remain
follow-up, not passed. npm RC publication and public docs-site publication remain
separate. See [the current setup guide](../../sentinel-integration.md).

## First legacy web UI fix release — 26 October 2026 (historical image)

The browser-header/cache repair is **published, deployed and live verified**.
Source runtime commit: `ceb68d37abfda8a6b0e09282d15a2e73f90c3a34`.
GitHub build [40344231426](https://github.com/traylinx/2md/actions/runs/40344231426)
passed, including the six focused regressions. The earlier 31 compatibility checks
and candidate pipeline evidence remain valid; no new performance cycle was run.

Both legacy API and worker were initially promoted to
`ghcr.io/traylinx/2md@sha256:b2e69195cd2ed3612071643888f3c6544e0ceb9002015a763b50138cae506bda`.
Fresh MiniMax conversion returned HTTP 200 and 15,093 bytes including plan tiers
and FAQs (8.772 seconds). The next cache hit returned identical content in 176 ms.
These are single observations, not a latency guarantee.

Before replacement, all four queues were idle. Existing job/cache data (368
entries) was copied and hash-verified into `html2md-jobs`, a 1 GiB requested
node-local PVC. This preserves data across pod replacements, not node loss or
backups; local-path storage is not a hard quota. Admission and queues were restored,
and the temporary migration pod was removed. No Secret or Sentinel grant changed.

The first repair retired the obsolete SSH/Compose workflow and initially kept
manual promotion. The automatic delivery release above supersedes that temporary
state. Follow [the release runbook](../../../deploy/legacy/README.md). Both branches are aligned;
merged feature branches are removed. Later documentation-only commits do not
change the deployed runtime source.

See [the repair record](S00A/INCOMPLETE_CAPTURE_FIX_2026-10-26.md).
Evidence: workspace `docs/evidence/html2md-merge-deploy-2026-10-26/`.
The Sentinel-enabled capture deployment described above remains unchanged.

## Historical October22/23 release record

The following is retained history, not the current deployment or source state.

# html2md capture release status

> **23 October additive candidate:** Sentinel Pass SDK integration is now locally
> implemented/tested, with 16 paced real-identity cluster canary checks passed.
> Production agent rollout is explicitly held for Sentinel-wide performance and
> durability qualification; canary resources removed. See
> [setup guide](../../sentinel-integration.md) and workspace
> `docs/sprints/CURRENT_STATUS.md`. The October 22 release below remains the
> deployed user-token capture baseline.

22 October 2026. This is the current execution projection; original H01/H02
records and case-design matrices remain historical and are not rewritten.

## Delivered and qualified

S00A public rendered capture and S05 request-scoped form login are implemented
as additive routes. Agent supplies declarative login instructions per request.
No fixed websites, server-side login catalogue, persistent password store or
reusable sessions. No HoCa client source was copied. Existing dependencies and
legacy runtime are unchanged; the new image extends the exact running image.

Candidate: `ghcr.io/traylinx/2md@sha256:241e8eaf6f0e6ceaf31ac9202c59fea252c106999cd0626d40d729a5bfc76607`.
Evidence: workspace `docs/evidence/html2md-implementation-2026-10-22/`.

- 108 capture unit/route/policy checks; 75 unchanged legacy checks.
- Exact image: 13 Chromium, 4 worker, 8 TLS transport, 2 streaming frontend checks.
- 10 cluster checks: verified TLS, wrong-host/untrusted-CA refusal, sidecar key
  separation, loopback-only backend, blocked direct network paths, public/private
  capture, wrong-password cleanup and fresh-context refusal of private content.
- Native contention matrix: 3,072 requests, 72 contract/p95 checks passed across
  three baseline/disabled/idle/busy rounds. Legacy lab on node01, capture on node02.
  Idle includes the TLS sidecar; busy exercises the real browser engine, not the
  full external ingress. This is not a universal production throughput claim.
- Rollback drill: new route removed, active capture drained, leases closed,
  replacement pod started empty, fresh private login succeeded, subsequent public
  capture could not reuse it. Legacy UID/restarts unchanged. Drained request
  returned 502, not successful content. Removed route matched original 404 bytes.
- User-authorized independent review found four actual bugs; all corrected and
  independently rechecked. See `INDEPENDENT_REVIEW.md`, including residuals.

## Deployed and activated

Both new endpoints are deployed and enabled for Sebastian's explicitly approved
existing Traylinx user. Identity was checked through authenticated `/users/users/me`
and independently through real AUTH `/oauth/token/info`, with matching user UUID.
No platform token was printed or saved. Browser's normal application flow refreshed
its stale session; no credentials were minted or taken from a database.

`ACTIVATION.json` records five passing live production checks: public capture,
private login with synthetic website credentials, refusal of public session reuse,
sanitized malformed auth and same-user recovery. `PRODUCTION_DEPLOYMENT.json`
records initial deny-all deployment; `USER_GRANT.json` records the next grant step.
Those dated records are intentionally not rewritten to appear activated earlier.
Current reproducible configuration: `CURRENT_PRODUCTION_MANIFEST.json` plus the
existing platform Secret (never stored here). Final cleanup/health evidence:
`FINAL_VERIFICATION.json`. No real customer portal credentials used.

Kong's two existing replicas received the explicitly approved rolling trust-store
configuration, without image upgrade/global TLS-policy change. The second rollout
had 51 consecutive successful legacy health samples. The first monitor mistakenly
used `/health` instead of `/api/health`; its 404s are not outage evidence or a
successful continuous monitor. Both the mistake and subsequent checks are retained.

## Boundaries and unfinished broader programme

- Same-origin HTTPS, full-page username/password form login only. No SSO/MFA/
  CAPTCHA bypass, XHR-only login, saved connections or arbitrary caller JavaScript.
- One declared POST and scoped GET/HEAD do not prove business read-only semantics.
- Non-root/read-only/cgroup/network containment is not protection against native
  browser compromise; Chromium runs without its own sandbox. API and workers share
  a container. TLS key is isolated in a separate container.
- Redaction protects tested common reflections, not arbitrary transformations by a
  malicious website. Temporary browser files use tmpfs; memory zeroization is not
  guaranteed. No real portal or customer credentials were tested.
- Full legacy CLI conversions, external providers/Redis/S3 and every planned case
  are not exhaustively tested. Unchanged deployed files/pod, 75 characterization
  checks and bounded differential load establish the stated compatibility evidence.
- Full WORKSPACE tenant integration, agent product/UI, billing, pilots and B16
  customer acceptance remain future work. S00A/S05 planning rows remain in progress,
  not blanket complete. The 43 HC and 24 AC design cases are NOT 67 passing tests.

## Handoff

The bounded html2md implementation/deployment goal is fulfilled. No ongoing
monitoring or autonomous customer-site use is scheduled. For subsequent agent
integration, use [the capture API](../../capture-api.md) and the existing approved
Traylinx identity. Keep unsupported login flows and the broader agent programme
separate. Do not re-run the first-time promotion script on existing resources.

Source changes remain local and uncommitted; only the approved runtime image was
published. No repository reset, stash, dependency install, source push, legacy
restart or consumer integration change occurred.
