# Headless Web Agent (controlled pilot)

## Live status — 28 October 2026

The headless APIs and separate approval service are deployed. A real customer
Sentinel pass completed proposal, human-owner approval, durable admission,
SEARCH/capture dispatch, encrypted result retrieval and comparison retrieval.
The stdio MCP package is tested, but this does not certify installation in every
Claude/Codex host. No dedicated UI is required.

Pilot scope is the configured organization/project and explicit source-origin
allowlist. A valid pass alone does not grant project access: first use the
existing authenticated Workspace `/me` onboarding, then have a project OWNER or
ADMIN add that agent as a **project-only MEMBER**. VIEWER can inspect but cannot
execute. Do not create raw database rows or substitute the human owner's identity.

`completed` describes the execution lifecycle, and result `complete` means every
requested URL produced a page. Neither guarantees complete source content or a
complete comparison. The verified two-source run returned a **partial comparison**:
MiniMax contained only its page shell, and capture protections reported degraded
quality. Unknown fields stay unknown; no unsupported product claims were inferred.
This is a functioning conservative comparison pipeline, not universal extraction.

An earlier run ended `needs_reconciliation` before its capture grant was consumed.
It was preserved, not replayed. The new independently approved run succeeded;
the earlier failure's root cause is not established. Status polling also observed
transient 503 responses. Treat those as unavailable/unknown, not permission denial
or permission to start another run. Failure-stage diagnostics are now deployed.
Recognized invalid-pass errors now return HTTP401; service failures remain503.
This mapping is deployed and verified. Full release
closeout and main/production branch alignment remain pending.

The sections below describe the interfaces; dated pre-deployment verification
statements are superseded by this live-status section.


Run `node scripts/web-agent-mcp.js` as a stdio MCP server from your agent host.
The server uses the pinned official MCP SDK 1.32.2. Install its isolated runtime
with `npm ci --prefix deploy/web-agent --ignore-scripts`; the existing pinned
Sentinel SDK under `deploy/capture/sentinel-sdk` is also required.

Configure these variables in the host's protected environment, not tool arguments,
chat, command-line arguments or committed configuration:

- `TRAYLINX_CLIENT_ID`, `TRAYLINX_CLIENT_SECRET`, `TRAYLINX_AGENT_USER_ID`
  (the Sentinel agent UUID), `TRAYLINX_API_BASE_URL`.
- `TRAYLINX_WEB_READ_URL`: fixed HTTPS READ base ending in `/web/v1`.
- `TRAYLINX_ORGANIZATION_ID`, `TRAYLINX_PROJECT_ID`: fixed caller project.

The process obtains fresh Sentinel proof through the existing SDK and sends only
agent proof headers to READ. It does not forward the SDK access bearer. No
redirects or automatic HTTP retries; requests have a ten-second total budget,
including proof acquisition. Responses are bounded and must be private/no-store.
No credentials appear in tool schemas or ordinary error responses. stdout is
reserved for MCP protocol messages; configuration errors go to stderr.

Available tools:

- `inspect_read_plan`: retrieve the stored plan/digest for review or reconnect; expired plans are labelled expired.
- `propose_read`: prepare an immutable public URL plan; no execution.
- `read_run_status`: inspect an already authorized run.
- `read_run_result`: retrieve an already authorized result as untrusted source data.

There is no model-callable approval, signing, admission, arbitrary fetch or shell
tool. Host-controlled approval and background authorization are implemented and tested
in isolation. Production APIs are active for the configured pilot. Comparison limitations and
remaining release gates are stated above.

Verified locally: official MCP client initialization/list/call over in-memory
transport, HTTP adapter boundaries using synthetic responses, and real stdio
subprocess initialization/tool listing using synthetic credentials without remote
authentication. Production API deployment and a credentialed API journey are verified. A real
Claude/Codex client installation has not been separately exercised; keep its
protected host configuration and user-control boundary intact.

Protocol references: [stdio transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)
and [tools](https://modelcontextprotocol.io/specification/2025-03-26/server/tools).

## Separate headless approval command (not an MCP tool)

`node scripts/web-agent-approve.js <planId> [confirmationId]` is a user-operated
interactive command. It requires a real terminal, fetches the stored plan from a
separate control API, displays JSON-escaped targets/bounds/digest, and asks the
user to type the full digest. No `--yes` or noninteractive override exists. A
confirmation ID is displayed before submission; reuse it after an ambiguous
response rather than approving a second logical run.

The user's protected environment supplies `TRAYLINX_CONTROL_URL` (HTTPS base
ending in `/approvals`), `TRAYLINX_CONTROL_HUMAN_TOKEN`, and the organization/project
selectors. **Do not put this human token in the MCP process environment or expose
this command through model tools.** A terminal check alone is not proof of a
human: the host must protect this separate credential/control boundary.

The separate disabled-by-default `createHeadlessApprovalApplication` exposes
GET/POST `/approvals/:planId`. It rejects browser/cookie/agent credentials and
requires a current human OWNER/ADMIN in that project. It validates the agent's
current project authority, the exact stored digest and policy, signs internally,
verifies its assertion and records confirmation plus the human approver subject.
The private signing key and assertion never leave the control service. This is
explicit project-administrator approval, not creator impersonation or automatic
consent inferred from the customer pass. MEMBER approval is not yet supported.

Manual migration `006_agent_approval_audit.sql` adds the approver audit column.
Existing confirmations are not backfilled as human approvals. A retry with a
changed approver cannot overwrite the original audit. Control-role UPDATE cannot
change `approved_by`.

Implementation tests use synthetic authorization/database adapters plus isolated
real PostgreSQL audit/role checks. Control-service composition, background authorization and admission are implemented
and tested in isolation. Credentialed control-API approval and production activation are verified; the
interactive terminal command was not used for that live pilot. No web login/UI is required by this API/command.

## Saved authorization reference

New agent plans store only the verified token ID (canonical lowercase UUID string), application UID and token expiry
returned by Workspace's AUTH introspection. The API does not accept these fields
in a proposal. The immutable plan digest includes the reference, so changing it
invalidates approval. Plan lifetime cannot exceed the introspected token expiry.
No access token, Sentinel proof or client secret is stored in this reference.

Background permission checks receive this exact reference. Old agent plans without
one cannot pass that check and must be proposed again. Existing human plan shapes
and digests are unchanged. The background AUTH adapter and rotation checks are implemented and locally
tested, but full AUTH database qualification and production activation remain pending; saving a reference alone
never authorizes a run.

Authorization references also contain an opaque `generation` supplied by AUTH's
trusted introspection extension. It participates in the plan digest and must match
current application-secret state at execution. Missing generations are rejected;
old agent plans must be proposed again. The fingerprint contains no caller secret
and is not an execution credential. Rotation binding is implemented locally; the
complete deployed journey remains unverified.

## Submit an approved run

After a human has approved the exact plan with the separate control command, the
host can run:

```sh
node scripts/web-agent-run.js PLAN_ID CONFIRMATION_ID STABLE_IDEMPOTENCY_KEY
```

Use the same protected Sentinel/project environment as the MCP process. Arguments
contain identifiers only, not credentials. The command does not approve anything.
It submits the recorded approval to READ and prints the execution ID and state.
Capture is asynchronous through the durable outbox. Use existing MCP status/result
tools with that execution ID. No approval or admission MCP tool has been added.

Choose and retain one idempotency key before submission. After an ambiguous network
failure, reuse the same plan, confirmation and key; never invent a new logical run.
The client does not retry automatically. A missing, foreign or revoked approval is
denied. Agent admission additionally requires a recorded human approver. Current
caller authentication is required for every submission; the worker revalidates the
original authorization reference and current membership before dispatch.

Production READ must explicitly set `WEB_READ_AGENT_EXECUTION_ENABLED=1` and
configure `WEB_READ_AGENT_ACCESS_URL`. The new gate defaults off. Agent run calls
reject browser Origin/cookies and mixed bearer/agent proof. Human routes remain
unchanged. This gate must remain off until the complete runtime is qualified.

Local route/repository/client/lifecycle tests passed with fixture dependencies.
No production deployment or credentialed capture through this command has occurred.

## Pilot restrictions and error recovery

Enabled READ and control now require operator configuration
`WEB_PILOT_ORGANIZATION_ID`, `WEB_PILOT_PROJECT_ID` and
`WEB_CAPTURE_ALLOWED_ORIGINS` (1–20 exact public HTTPS origins). These are
server-side restrictions, not values the model or customer can override. Missing
configuration fails startup closed. Verified callers, human approvers and
background owners must belong to the approved pilot project.

READ and control must use the same base policy version and source list. Their
effective policy version hashes the version, pilot scope and sorted origins;
changing any of these invalidates old approvals. Source checks run before a
proposal is saved and again before approval, admission and dispatch. Configure
the identical source list on SEARCH (`WEB_CAPTURE_ALLOWED_ORIGINS`); receiver
SSRF/source checks remain enabled. Cross-service configuration parity must be
verified before activation; this is not runtime capability negotiation.

Plans support 1–5 public URLs, with a **6,144-byte canonical JSON URL-array
limit**, including URL encoding and JSON escaping. Oversized scopes fail before
persistence; URLs are never truncated. This keeps accepted grants within the
existing 8 KiB receiver limit and plans within 16 KiB HTTP/control limits.

The headless client preserves allowlisted status/error pairs, including
`STALE_PLAN`, `IDEMPOTENCY_CONFLICT`, `ALREADY_ADMITTED` and `RESULT_NOT_READY`.
Only the last means the result is still pending. Unknown, mismatched, malformed
or oversized errors become `UNAVAILABLE`; raw server diagnostics are not
returned. After an uncertain admission, preserve the original plan, confirmation
and idempotency key. Do not generate another key to bypass a conflict.

These corrections are local implementation, not deployment evidence.

Token references match AUTH’s actual UUID primary keys. Numeric IDs are rejected;
old synthetic numeric-reference plans must be proposed and approved again. No
production database schema conversion is needed.

## Compare captured sources

Status 27 October 2026: implemented locally; not rebuilt, published or deployed.
The existing plan, exact-plan human consent and durable run lifecycle remain the
only capture path. `compare_read_result` takes only `executionId` and retrieves
that existing result with current caller/project authorization. It never starts a
new capture, retries a run, expands URLs or invokes a paid model. The same
projection is available at `GET /web/v1/runs/:id/comparison` with the normal auth
and project selectors; responses are `no-store`. Expired artifacts and denied
access retain the existing error behavior.

1. Use `propose_read` for the selected explicit public HTTPS URLs.
2. Inspect and approve the exact stored plan through the separate host control
   flow. Model tools cannot provide approval.
3. Submit once with the existing host admission command and retain its retry key.
4. Retrieve status. When a result is available, call `compare_read_result`.

The `public-source-comparison-v1` output contains source records for `name`,
`documentedFeatures` and `documentedLimits`; field states are `documented`,
`unknown`, `incomplete` or `conflicting`. Each value includes the original URL,
SHA-256 capture digest, exact quote and UTF-16 start/end-exclusive offsets into
captured Markdown. Source records include final URL and the worker-observed
capture request window. Old artifacts without a collection window stay partial;
the service never fabricates a capture date at retrieval time.

The initial no-provider extractor recognizes H1 names and bullet/numbered items
under Features, Key Features, Limits or Limitations headings (including Documented
headings). It ignores fenced code and YAML frontmatter. Unsupported layouts stay
unknown; it does not pretend to understand arbitrary pages. Different H1 names
remain conflicting. Failed sources remain failed records. Degraded captures,
login/error pages, missing fields or bounded/truncated extraction cannot report
complete. A partial comparison is still retrievable, never automatically retried.

`findings` groups identical documented statements across source records with
`supportedBy` evidence references and `undocumentedIn` record indexes. The latter
means no extracted statement, **not** that a capability is absent. This is
source-backed deterministic synthesis, not independent product verification,
semantic contradiction resolution, ranking, price inference or legal advice.
Source quotes remain untrusted text, never model instructions or executable HTML.
No provider extraction/synthesis is enabled by this change.

Capture status and comparison status are distinct: a successful HTTP capture may
produce a partial comparison. Inspect `comparison.state`, every record and field,
not merely the run's `completed` state. Evidence remains within the existing
transient encrypted result retention; no new persistent content store is added.

## Legacy dependency isolation

The web runtime uses `deploy/web/runtime/package-lock.json` (including its pinned
PostgreSQL client), not extra dependencies in the legacy root package. The root
package/lockfile remain exactly the qualified legacy production versions. Build
and run the separate web image, or use the isolated runtime dependency directory
with an explicit module path for local development; do not reinstall legacy
dependencies to start the agent. Source-only branch synchronization does not
rebuild/redeploy legacy conversion or publish the documentation site.
