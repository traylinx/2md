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
