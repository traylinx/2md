## Local human-viewer interaction correction — 29 October 2026

The local MCP viewer now disables stale input, clears failed/expired images,
recovers only the original action receipt, bounds a slow transport to ten seconds,
refreshes frames before their worker expiry, and displays an active countdown.
Remote authority, request consent and session lifetime limits are unchanged.

Validation: **19 focused checks passed**. Actual delivered viewer DOM handlers
also passed against the existing exact runtime image in the owned nested-frame
fixture, including click, pending request decision, text, return, private result
redaction and cleanup. Only local-host UI sources were mounted into that test;
this is not a new runtime image qualification. Native Chrome additionally verified
click/text/scroll/key, lost-response recovery with one submission, and return using
an owned synthetic fixture. No real CAPTCHA was automated.

Release scope is local-host source; reconnect the installed MCP process to load
the update. No Kubernetes/AUTH/Workspace deployment is required. Expired sessions
cannot be revived. Real password login and organization extraction remain **open**.
Detailed evidence lives in the workspace at
`docs/evidence/gb01-viewer-interaction-2026-10-29/`.

## Internal authority outage and human-lease correction — deployed

Runtime source `93f71de` / `083ffca`, main and production published. Private image
`sha256:f2c24047596354dd6dee793c9243ef01a34d648a565e24504e1b8f24cab22a34`
is1/1ready, healthok,0restarts. Runtime image only changed; AUTH/Workspace code,
rate-limit budgets, credentials, grants, schema, egress and resource limits unchanged.
Production workflow40876025028 succeeded.

The reported UNAVAILABLE was traced to internal authorization429 responses,
not rejection of the website credentials. Duplicate reference checks now coalesce
within one request phase, while post-action authority remains fresh. Completed
receipts survive bounded temporary authority failure without replay or releasing
private results before authorization recovers.

84 focused checks and exact-image passive/native/SPA/human/frame fixtures pass.
Actual installed MCP invitation submission succeeded, then the site explicitly
requested reCAPTCHA. Password login and organization extraction are **not verified**.
Follow-up correction recognizes that instruction without provider CSS and prevents
the ordinary idle timer from shortening an active human lease. Final installed MCP
kept human_control after133 seconds, beyond the previous120-second cutoff, and
closed cleanly. Healthok, zero profiles. No real CAPTCHA was automated.

Reconnect MCP before retesting. Run the ordinary authorized login/read request;
complete any actual interactive challenge in the same-session viewer, select
Return to agent, then continue from fresh observations. Full private-account
acceptance remains open. [User manual](../../generic-browser-setup.md).

---

## Passive verification correction — deployed, ready for retest

Runtime source `67fec32` / `04149b9`, published main and production. Private image
`sha256:5d4be6c631e9a5680f9db034b8d91249f0c5a8d0b5323d26d3f4b51645e4b16e`
is1/1ready, healthok,0restarts. Browser image only changed. Egress, flags, schema,
secrets, grants and resources unchanged. Production workflow40865633126 succeeded.

74 focused checks and exact-image passive/recovery, legacy login and human/frame
fixtures pass. Actual installed MCP public login-page smoke passed on runtime
`9301e1bf-e3ab-40f0-bc48-7263ef301ba9`; normal invitation inputs are observable,
with no false immediate human challenge. No invitation/password was submitted;
full organization login remains user acceptance, not a claimed passed test.

Automatic verification waits and remains resumable. The calling agent chooses the
workflow; no fixed site recipe. Fresh fields work after confirmed no-input failure.
Restart MCP to load updated instructions. [User manual](../../generic-browser-setup.md).

---

## Passive verification correction — qualified, release pending

Runtime source `67fec32` / `04149b9`: passive checks receive a bounded read-only
wait, interactive instructions remain distinct, and fresh protected fields can
replace an obsolete binding after a confirmed no-input rejection. The calling
agent still chooses the workflow; a polling interval is not a task stop.

74 focused checks pass. Exact local image
`sha256:74ac66696d9f9790366cac80f52a42167bb4e8c6d0f4b718d34355d95b95f172`
passes owned delayed verification/native/SPA/recovery, legacy private login, and
same-session human/nested-frame fixtures. No real website CAPTCHA was automated.
Publication, controlled rollout and installed-MCP verification follow separately.

---

## Human continuation — deployed and ready for user retest

Source `b565190` published on main and production. Dedicated browser runtime
`sha256:765cbc31c143cda06bd0182fd9c11997dbf224ee56a3b727889e7ccc39a1bc4e`
is1/1 ready, healthok,0restarts and0profiles after smoke. Embedded-frame and human
flags enabled; egress, schema, secrets, grants and resources unchanged. Production
workflow40855899178 succeeded. Previous image29f3909... retained for rollback.

113 focused checks and exact-image human/nested-frame/legacy-private fixtures pass.
Actual installed stdio MCP advertises both new capabilities. Real Chrome displayed
the same remote login session in the protected1280x800 viewer; Return to agent,
fresh observation/extraction and close succeeded. No password or CAPTCHA submitted
in smoke. Real account/organization acceptance remains open, not certified.

Restart the MCP connection before retesting. If challenged, the user completes it
in the returned viewer, selects Return to agent, then resumes the agent. No different
browser/session substitution, no automated challenge solver, no invitation recipe.
[User instructions](../../generic-browser-setup.md).

---

## Human continuation — qualified source; release pending

Guarded nested HTTPS/OOPIF support and same-session human takeover implemented.
The client-neutral `browser_handoff` tool exposes start/status only; protected local
viewer carries pixels and manual input. Agent actions pause until Return to agent.
Fresh authority, SSRF/recipient limits, stable action IDs and cleanup remain intact.

65 focused checks,44 compatibility checks and20 final affected checks passed
(overlapping suites, not additive). Real forked worker + signed HTTP + protected
viewer flow passed against an owned nested cross-site fixture: early POST blocked,
manual click held for explicit destination approval, no replay, text redaction,
private evidence after handback, profile cleanup. This is not real CAPTCHA solving.
Source publication, exact final-image qualification and live rollout follow;
production is still the prior image until a newer release entry says otherwise.

---

## Browser runtime recovery — deployed, 29 October 2026

Source `d5805ad` / `a2d3825` published on main and production. Dedicated browser
runtime is 1/1 ready on immutable private image
`sha256:29f3909a95a6de70f71027af33660e2991a793a22c0dcd9febeb38994a859ed7`.
Egress, credentials, grants, resources and schema are unchanged; rollback is
previous image `sha256:2f90f7c221199a1ff06eb956471a762c026bc84d5c1c9ac89b2c96e7f1104814`.

Allowlisted error reasons survive worker transport; secret-free stage diagnostics
replace opaque failure reporting. Page settling is bounded and reports busy
background traffic without repeating submissions. Receipt recovery retries one
transient read only. Pre-input human challenges retain the session for inspection.
47 focused and27 compatibility checks passed;8 final recovery checks overlap.
Exact final-image generic and old paired-owner Chromium journeys passed.

**Not general private-login readiness:** full real-account acceptance remains open.
Cross-origin embedded frames and same-session human takeover are not implemented.
The user's historical UNAVAILABLE incident lost its internal cause; these fixes
must not be called proof that every intermittent failure is eliminated.
Existing production workflow40847937689 succeeded. Actual installed-MCP public
open/observe/wait/extract/close passed; NETWORK_NOT_IDLE was reported explicitly.
No credentials were submitted in this release smoke.
See [current setup and limitations](../../generic-browser-setup.md).

---

## Agent-supplied input — released, 29 October 2026

- Commits42feef9 andf1eec7f published on main/production. Dedicated browser runtime
  uses private immutable image `sha256:2f90f7c221199a1ff06eb956471a762c026bc84d5c1c9ac89b2c96e7f1104814`,
  1/1 ready. Existing production workflow40843056085 succeeded. Egress unchanged.
- Explicit enrolled-host delegation lets an agent reuse values already supplied
  by the user, with no repeated owner pairing/form. Generic observed fields and
  digest-bound held-operation decisions; no website recipe. Protected-owner input
  remains default for other hosts. See [setup](../../generic-browser-setup.md).
- 49 focused checks passed;24 auth-boundary checks after the duplicate-lookup fix
  also passed (overlapping suites). Exact-image real Chromium generic native/SPA,
  cross-origin continuation, private redaction/cleanup and legacy private flow pass.
- Normal installed MCP live check accepted supplied values without re-entry and
  clicked Verify Access. The website then required reCAPTCHA. Password not sent,
  organization not read, session closed. Full real-account login is NOT verified.
  Existing clients must restart to load the new input schema/instructions.
- Rollback: prior browser imagea19633c..., remove delegated-host setting, restore
  local protected_owner mode. No database migration or legacy-consumer change.

---

## Generic agent-directed protected input — 29 October 2026

- Runtime source8030412 deployed in dedicated browser service, immutable private
  image `sha256:a19633c57bc7f93dfa86b0c7051f542c979435be08dd9959d1893aeec19cadc7`,
  1/1 updated and ready. Existing egress image and infra/security bindings unchanged.
- Generic protected values bind to agent-selected observed controls, not a fixed
  username/password/invitation workflow. Optional submission, native and SPA forms,
  text inputs, textarea, select and editable text supported. Host capabilities
  negotiate `observed_fields`; old strict capability response shape retained.
- Candidate real worker/Chromium native→SPA code-entry→private extraction and cleanup
  passed; legacy private flow and label-independent interactions also passed. The
  normal installed Codex config discovers generic mode and passed public smoke.
- Host initialize instructions now route interactive tasks to browser tools first;
  legacy connection lists do not restrict generic browsing. Restart old MCP sessions.
- Actual Traylinx invitation→login→organization journey not rerun yet. No universal
  site support or successful real-account acceptance claimed. Rollback: previous
  browser runtime digestd389f7c…; no schema rollback or legacy consumer change.

---

## GB01 source promotion and existing-service coexistence — 29 October 2026

Source main/productione2a9ce49b2ef6c811fee429110f6aea5665ae95e promoted.
Workflow40794062333 SUCCESS; live health reports exact legacy and capture revisions,
statusok/deploymentverified. Dedicated browser image remains unchanged.
One bounded simultaneous live browser extraction and unchanged legacy conversion
passed: legacy HTTP200/cachemiss/14285Markdownbytes in8843ms, browser154evidence
records, explicit degraded warnings and close. This is coexistence smoke evidence,
not latency/throughput certification. Actual released Codex public journey also
passed with eight references verified against extracted evidence.

Private live acceptance still needs valid invitation/access; no login bypass.

---

## GB01 controlled browser release — 29 October 2026

Dedicated runtime/egress are live on immutable image
`ghcr.io/traylinx/web-intelligence-agent@sha256:d389f7c00ea79e5b460e3a64101dd0b5a12a8d25d7480086dac319b71bcf92df`.
Owner frontend productiond2d45b2 and Workspace productiond53e557 deployed.
Actual owner enrollment, scoped host connection, anonymous401 and neutral stdio MCP
public extraction/action recovery/close passed. Browser routes are OPEN; existing
legacy services/routes were not replaced. Release pause plugin remains available.

Full GB01 completion is NOT claimed. Released agentic-client/private acceptance,
final rollback/compatibility evidence and acceptance reconciliation remain open.
See workspace `docs/sprints/CURRENT_STATUS.md` and [host setup](../../generic-browser-setup.md).

---

## Capture fidelity and authenticated MCP — deployed, 28 October 2026

Runtime `4e907b8e83c5e8fdb44180e6136b242490f2447b` is deployed on capture/egress:
`ghcr.io/traylinx/2md-capture@sha256:3d014ddfc1b43ad3cd16e64694ae7219c369cbb72772e3fb689c4dac372a203a`.
Public MCP extraction now retains price-card names and comparison checkmarks.
The configured host exposes twelve tools including credential-free login inspection
and one-attempt private reads; reconnect existing MCP sessions.

Native/XHR login passes owned isolated tests. The actual Traylinx organization
read is **not verified**: fresh sessions require beta access before a password form.
Inspection reports that prerequisite; no bypass or second password attempt occurred.
See [current release evidence](../../evidence/private-read/RELEASE.md).
Legacy, AUTH/USERS, READ/control and database deployments remain unchanged.

---

## Web Agent standing permission — deployed and live verified, 28 October 2026

READ/control runtime `1601587` and additive migration007 deployed. Registered MCP
now discovers scoped standing permission and executes public reads without a
per-plan owner command or confirmation ID. The two-source live run completed;
repeated admission recovered exactly one execution. Both page-quality warnings
remain explicit. Legacy/capture and AUTH/USERS deployments were unchanged.

Current [release evidence](../../evidence/public-read-grants/RELEASE.md) records
exact digests, tests, grant expiry, rollback and final user-test instructions.

---

## CDN hydration release — live verified, 28 October 2026

Runtime `75cdc964c88343e0a7ec58e29a11e223aa8935b7` is deployed through the
[production workflow](https://github.com/traylinx/2md/actions/runs/40664859704).
The scoped controllers promoted both the legacy and private capture images;
all release verification jobs passed. Capture/egress image:
`ghcr.io/traylinx/2md-capture@sha256:06f33275049b547e3a3f3e9e62552a319be2932d641f4dce4bf69efa08fa7a38`.

The existing SEARCH service grant now includes only the required CDN origin as
`resourceOrigins`, separate from its unchanged navigation origins. Other callers'
grants and authenticated-recipe boundaries are unchanged. A guarded capture
restart loaded the updated grant; rollback snapshots remain on the cluster node.

One authenticated production capture returned HTTP200 with 11,609 Markdown
characters, plan names and pricing in 11.668 seconds. Direct navigation to the
resource-only CDN returned HTTP403 without content. The result remains degraded:
blocked resources, sensitive-text redaction and malformed-table text fallback
are reported rather than hidden. This is not universal website compatibility or
a throughput certification. Existing status/dispatch availability findings in
the headless agent remain separate, unresolved work.

Evidence: workspace `docs/evidence/capture-resource-scope-2026-10-28/`.

---

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
