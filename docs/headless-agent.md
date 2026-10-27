# Headless Web Agent (development preview)

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
tool. Host-controlled approval and background agent revocation are still pending;
agent execution remains denied. This is not yet the complete comparison agent.

Verified locally: official MCP client initialization/list/call over in-memory
transport, HTTP adapter boundaries using synthetic responses, and real stdio
subprocess initialization/tool listing using synthetic credentials without remote
authentication. A real Claude/Codex credentialed run and production deployment
have **not** been performed. READ and Workspace agent-access routes must be
qualified/configured before remote proposal/result calls can work.

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
real PostgreSQL audit/role checks. Control-service composition is implemented and fixture-tested. Background agent
revocation, actual interactive credentialed approval and agent admission remain
pending. No web login/UI is required by this API/command.

## Saved authorization reference

New agent plans store only the verified token ID, application UID and token expiry
returned by Workspace's AUTH introspection. The API does not accept these fields
in a proposal. The immutable plan digest includes the reference, so changing it
invalidates approval. Plan lifetime cannot exceed the introspected token expiry.
No access token, Sentinel proof or client secret is stored in this reference.

Background permission checks receive this exact reference. Old agent plans without
one cannot pass that check and must be proposed again. Existing human plan shapes
and digests are unchanged. The production background AUTH adapter, rotation
coverage and execution enablement are still pending; saving a reference alone
never authorizes a run.
