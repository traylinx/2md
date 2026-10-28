# Private-read and extraction release — 28 October 2026

**Deployed. Public extraction verified; real Traylinx private read blocked by its
beta-invitation prerequisite. Do not describe the organization-read test as passed.**

## Published and deployed

- Capture runtime source: `4e907b8e83c5e8fdb44180e6136b242490f2447b`.
- Private image: `ghcr.io/traylinx/2md-capture@sha256:3d014ddfc1b43ad3cd16e64694ae7219c369cbb72772e3fb689c4dac372a203a`.
- Capture/egress rolled out ready with guarded before-state checks and protected
  rollback snapshots. Added one exact login-inspection ingress path. Legacy,
  AUTH/USERS, READ/control and databases were not changed.
- Runtime commits pushed to `main` and `production`. This was a scoped manual
  capture rollout, not evidence of a new automatic GitHub deployment run.
- Existing caller grant preserved and extended only to the requested site/API
  origins and two exact authentication POST endpoints. Other callers unchanged.
- Local registered MCP now exposes twelve tools with the configured caller
  connection. Reconnect existing host sessions to refresh discovery. Credentials
  remain in a caller-owned mode0600 file outside repositories, not tool arguments.

## Implemented

- Capture-only preservation of card headings, explicit accessible icon labels
  and full-width comparison-table section rows; legacy static extraction unchanged.
- Credential-free login inspection and generic native/XHR request-scoped recipes.
- Private proposals contain no credentials. One-attempt execution and bounded
  host-memory results never enter public durable queues; uncertain login is not retried.
- Exact authentication POST grants, bounded read URLs and account identity proof.
  Cookies/tokens stay inside isolated browser operations; extracted secrets are redacted.
- Denied CSS imports are replaced locally with empty stylesheets and explicit
  warnings, without fetching the denied resource. This repairs lazy-SPA bootstrap
  failure caused by CSS load rejection without expanding network permission.
- Invitation/MFA prerequisites are detected without password submission. The
  adapter does not automate or bypass those prerequisites.

## Evidence

- Initial focused suite: 26 node tests; existing capture regression suite:138 passed.
- Native isolated Chromium:13 scenarios passed. Inspection route/lifecycle/Sentinel
  follow-up:82 passed. Final changed-module node tests:14 passed. These overlap;
  do not add the counts into a supposed unique total.
- Final owned Chromium fixture:7 assertions passed, covering CSS-import startup,
  credential-free inspection, ordered cross-origin login, organization extraction,
  blocked business writes/refresh, wrong-account rejection and invitation-gate
  refusal without password submission. CSS regression failed before the fix.
- Staged secret scans passed. No independent peer-review approval claimed.
- Final registered-MCP public read returned12,057 Markdown characters, all three
  pricing-card headings,55 explicit checkmarks and23 table rows. Quality remains
  degraded for other blocked resources; this is not universal completeness.
- Initial real Traylinx private attempt timed out. Credential-free diagnosis found
  the CSS startup failure. After its repair, live inspection exposed the site's
  **Beta Access Required** screen and reports `interactive_access_required`.
  The guarded re-test stopped before another password submission. No organization
  information was retrieved or verified.

## Exact next step

Resolve the website's legitimate beta-access prerequisite with its owner, then
validate the requested account login and organization read. Do not fabricate
cookies/storage flags, replay the failed plan, or claim password-only access works.
No further performance cycle, wallet work or unrelated service deployment is needed.

Detailed raw evidence and checkpoints remain in the local workspace
`docs/evidence/web-private-read-2026-10-28/` and `docs/sprints/CURRENT_STATUS.md`.
See [client instructions](../../headless-agent.md#authenticated-website-reads-optional-client-connection).
