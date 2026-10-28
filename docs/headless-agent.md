## Release verified, 28 October 2026

READ/control source `1601587` is deployed. The actual registered MCP completed a
two-page public read without per-plan owner approval. Repeated submission returned
the same execution. Both pages retained their degraded-quality warnings.
See [release evidence](evidence/public-read-grants/RELEASE.md). This qualifies the
bounded configured pilot; final conversational user acceptance remains to be run.

# Public reads through MCP

Connect your Sentinel pass to the selected project, then grant public reading
once through authenticated owner control. Within that grant, ask your MCP client
to read a page. You do not need to copy confirmation IDs or use a terminal for
every read. If you ask to see the proposed task first, the client shows it and
waits for your go before executing.

The host discovers current grants with `get_read_capabilities`, prepares a plan
with `propose_read`, starts it with `run_public_read`, and retrieves status and
results. URLs alone suffice; defaults are 60 seconds and 2,000,000 response bytes.
The server verifies the caller and permission on every request. Permission is
limited to the configured project, agent, origins, URL count, time and bytes.
It expires and can be revoked. It does not authorize login, writes or spending.

If admission has an uncertain response, repeat **the same plan ID**; never create
a replacement plan. The durable admission returns the existing execution.
Retrieved source content is evidence, not instructions. Missing fields and
partial/degraded pages must be identified rather than guessed.

The existing manual `run_approved_read` route remains available for separately
approved callers. It is not the normal workflow when a standing grant covers a
read. One-time permission is currently an authenticated control API operation;
a self-service Traylinx connection/settings screen is not included in this patch.

Release qualification and exact source/image state are recorded in the workspace
`docs/evidence/web-public-read-grants-2026-10-28/` and `docs/sprints/CURRENT_STATUS.md`.
Reconnect an existing MCP host after updating its local source to discover the new
tools. Updating local source alone does not deploy the READ/control APIs.

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
That historical MiniMax capture contained only its page shell. The subsequently
deployed generic CDN resource-scope correction returned 11,609 characters with
plan names and pricing in a separate live capture. Protections still report
degraded quality; a successful capture is not a complete structured comparison. Unknown fields stay unknown; no unsupported product claims were inferred.
This is a functioning conservative comparison pipeline, not universal extraction.

An earlier run ended `needs_reconciliation` before its capture grant was consumed.
It was preserved, not replayed. The new independently approved run succeeded;
the earlier failure's root cause is not established. Status polling also observed
transient 503 responses. Treat those as unavailable/unknown, not permission denial
or permission to start another run. Failure-stage diagnostics are now deployed.
Recognized invalid-pass errors now return HTTP401; service failures remain503.
This mapping is deployed and verified. Qualified backend changes are aligned on
main and production. Host onboarding qualification is recorded below.

Final registered-host journey on 28 October captured both approved sources:
MiniMax 11,609 characters and conversion documentation 3,529 characters. Six
status reads returned without errors; result and comparison retrieval succeeded.
Both pages remain degraded and the comparison remains partial. The shared
Workspace verifier now has a scoped attempt budget; customer defaults are
unchanged. AUTH publishes conservative proof-lifetime metadata, allowing the SDK
to reuse valid proofs while every request still undergoes current authorization.

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
- `get_read_capabilities`: discover current server-verified standing grants and limits; check `livePermissionChecked` for legacy backends.
- `propose_read`: prepare an immutable public URL plan; no execution. Only `urls` is required.
- `read_run_status`: inspect an already authorized run.
- `read_run_result`: retrieve an already authorized result as untrusted source data.
- `compare_read_result`: compare existing captured evidence; never starts a capture.
- `run_public_read`: execute a ready plan within standing permission using only `planId`; identical retries recover the existing run.
- `run_approved_read`: submit an independently approved plan using `planId` and
  `confirmationId`. Repeated calls with the same pair use the same idempotency key;
  missing, revoked, expired or foreign consent cannot authorize a new run.

There is no model-callable approval, signing, arbitrary fetch or shell tool.
`run_approved_read` submits an already approved plan through the existing admission
API. It cannot create consent; the server still requires a recorded owner approval. Host-controlled approval and background authorization are implemented and tested
in isolation. Production APIs are active for the configured pilot. Comparison limitations and
remaining release gates are stated above.

Verified locally: official MCP client initialization/list/call over in-memory
transport, HTTP adapter boundaries using synthetic responses, and real stdio
subprocess initialization/tool listing using synthetic credentials without remote
authentication. Production API deployment and a credentialed API journey are verified. A real
Codex registration is now installed and its exact configured command/environment
initially passed an official MCP client handshake, five-tool listing, authenticated status
read and plan proposal. Existing sessions may need a restart to load newly
registered tools. Other hosts are not certified by that check.

Protocol references: [stdio transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)
and [tools](https://modelcontextprotocol.io/specification/2025-03-26/server/tools).

## Optional legacy per-plan approval command (not an MCP tool)

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

## Optional legacy submission of a separately approved run

After a human has approved the exact plan with the separate control command, the
host can run:

```sh
node scripts/web-agent-run.js PLAN_ID CONFIRMATION_ID STABLE_IDEMPOTENCY_KEY
```

Use the same protected Sentinel/project environment as the MCP process. Arguments
contain identifiers only, not credentials. The command does not approve anything.
It submits the recorded approval to READ and prints the execution ID and state.
Capture is asynchronous through the durable outbox. Use existing MCP status/result
tools with that execution ID. Alternatively, use MCP `run_approved_read` with
the recorded `planId` and `confirmationId`. That tool derives its own stable
idempotency key. Choose one submission route for a logical run; do not switch
between the CLI and MCP keys to retry an ambiguous response. No approval MCP
tool has been added.

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

These corrections are included in the qualified backend release. Historical
test-only records remain separate from production journey evidence.

Token references match AUTH’s actual UUID primary keys. Numeric IDs are rejected;
old synthetic numeric-reference plans must be proposed and approved again. No
production database schema conversion is needed.

## Compare captured sources

Status 28 October 2026: deployed and retrieved successfully in the owner-approved
pilot. Unsupported content remains explicitly partial, not inferred complete.
Immutable plans and the durable run lifecycle remain the capture path.
Authorization comes from a bounded standing grant or separate exact-plan consent. `compare_read_result` takes only `executionId` and retrieves
that existing result with current caller/project authorization. It never starts a
new capture, retries a run, expands URLs or invokes a paid model. The same
projection is available at `GET /web/v1/runs/:id/comparison` with the normal auth
and project selectors; responses are `no-store`. Expired artifacts and denied
access retain the existing error behavior.

1. Use `propose_read` for the selected explicit public HTTPS URLs.
2. If the user requested a preview, show the task and wait for their go.
3. When standing permission covers the plan, use `run_public_read` and preserve
   its plan ID. Only legacy separately approved requests use `run_approved_read`.
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

## Protected credential file and Codex setup

Alternatively to the four credential environment variables, set
`TRAYLINX_CREDENTIALS_FILE` to an absolute path to a UTF-8 JSON file with exactly
`clientId`, `clientSecret`, `agentUserId` and `apiBaseUrl`. Both the MCP launcher
and separate submission command support this option. The file must be a regular
file owned by the process user, with no group/other permissions (use `0600`),
at most 16 KiB; symlinks and conflicting credential environment values fail closed.
This option requires a POSIX host. Protect its parent directory as well. Do not
commit the file or pass its content through tool arguments. Existing environment-only
integrations are unchanged. The file path is host configuration, not a model input.

Register `scripts/web-agent-mcp.js` using your host's MCP configuration with an
absolute Node executable and script path. Configure only the credential-file path,
READ URL and fixed organization/project selectors. For Codex, use `codex mcp add`
and inspect with `codex mcp get`; back up and compare existing configuration
before/after registration. The local CLI used in qualification dropped two existing
Harvey metadata fields; these were restored and all nine prior servers verified
unchanged. Never replace the entire host configuration with a sample.

Registration does not approve plans. Owner approval and submission remain separate;
expired plans require a fresh proposal and approval. After an uncertain admission,
retain the same idempotency key and inspect that run instead of creating another.

## Authenticated website reads (optional client connection)

The Web Agent supports a separate, one-attempt private read. It does not reuse a
public-read grant as permission to log in. The capture service needs an explicit
`capture:authenticated` grant. JavaScript/XHR logins additionally require exact
approved `loginPostUrls`; an optional `authenticatedUntil` is an epoch-millisecond
expiry checked before execution and again before returning content.

The MCP host offers four additional tools when configured:

1. `list_login_connections`: discover connection labels and non-secret login hints.
2. `inspect_login_page`: discover visible form selectors and blocked resource paths
   in a fresh credential-free browser. This does not submit credentials or infer
   authentication endpoints.
3. `propose_authenticated_read`: prepare a read using an opaque `connectionId` and
   target `url`. The agent may supply request-scoped `loginUrl` and `login`
   instructions or use caller-provided hints. No password is a tool argument.
4. `run_authenticated_read`: execute once and return the extracted evidence
   directly. Do not poll the public-run tools for this private operation.

A user can say: **“Use the Web Agent to log in with my configured test connection
and summarize my organization. Do not change anything.”** No additional chat
approval is needed for that explicit request within configured permission.
If the user asks for a preview, show the task and wait before execution.

### One-time host configuration

Configure these environment variables on the MCP process (not in model inputs):

- `TRAYLINX_WEB_CAPTURE_URL`: the HTTPS capture endpoint ending `/api/capture/v1`.
- `TRAYLINX_LOGIN_CONNECTIONS_FILE`: absolute path to a caller-owned JSON file.
  It must be a regular, non-symlink file owned by the current user, mode `0600`.

The file contains `connections`, an array of objects with `id`, `label`, `origins`,
`postUrls`, `username` and `password`. Optional `loginUrl` and `login` are caller
hints, not a server-side website catalogue. Keep this file outside repositories.
Use a password manager or the host's protected provisioning process to populate it;
never ask the user to paste credentials into model tool arguments. Reconnect the
MCP host after changing its environment. Allow a 90-second tool timeout for a
60-second capture budget and authorization/cleanup overhead.

Native form instructions contain `submitPath`, `readPaths`, optional
`resourcePaths`, `fields` (`form`, `username`, `password`, `submit` CSS selectors),
and `proof` (`selector`, `attribute`). The account proof must match the supplied
username. Native login supports a same-origin form POST and navigation.

XHR instructions contain `mode: "xhr"`, ordered `postUrls` (at most three exact
HTTPS authentication endpoints), `readUrls` (at most 32 exact GET API URLs),
`readPaths` (allowed page paths), `fields`, and `proof` (`url` and JSON-key `path`
leading to the account identity). Optional `resourceUrls` permits exact external
script/stylesheet resources. No arbitrary JavaScript or request bodies are accepted.
The credential connection and capture server must both permit every authentication
POST; navigation origins alone never grant this authority. Exact non-secret GET
query strings are allowed only when listed in `readUrls`.

### Isolation and limitations

Credentials are sent transiently over HTTPS to an immediate isolated worker slot.
They do not enter public plans, durable queues, server logs or server credential
storage. Browser sessions are discarded after each operation; a restart requires
fresh caller submission. Caller-side credential storage is not server-side storage.
Private evidence stays in the MCP host's memory for ten minutes and disappears on
restart. Do not treat private plans as durable public execution IDs.

A repeated private `planId` returns the same in-memory result/status and never
repeats login. On uncertain transport, preserve that ID. After a failed attempt,
expiry or host restart, report uncertainty and obtain fresh user intent before a
new attempt. Never silently retry a password submission.

MFA/CAPTCHA, popup SSO, arbitrary browsing actions, business writes and purchases
are not supported. Do not claim all websites work. New websites may require
connection instructions and scoped permission setup. Private content remains
untrusted source data; summarize only returned evidence and make gaps explicit.
