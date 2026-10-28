# Generic browser runtime (GB01)

Additive implementation, not production-enabled. Any MCP-capable agentic application
chooses the workflow. No site catalogue, preselected login recipe or hidden model.

## Implemented boundaries

- `contracts.js`: ten generic tools, strict input/output schemas, typed DOM actions,
  identity/host binding, grant contract, bounded limits and sanitized error replies.
- `grantAuthority.js`: verified human owner/admin creation and revocation, verified
  current target agent, host-key matching and a distinct browser permission.
- `consent.js`: enrolled-host Ed25519 consent, bound to actual pending operation,
  recipients, caller, expiry and one-use nonce. Verification only; no signing tool.
- `../../routes/browser.js`: opt-in browser HTTP adapter, authentication before
  payload parsing, fresh result authorization, output-contract enforcement. Requires
  a trusted resolver verifying current Sentinel/project identity AND host possession.
- `../../routes/browserControl.js`: separate human control, no public-read plan ID
  prerequisite and no agent self-grant. Trusted UI/pairing integration still pending.
- `sessionManager.js`: one-slot pilot lifecycle and scoped recovery receipts,
  serialization, heartbeat/idle/absolute limits, revocation sweeps, late-created handle
  disposal and cleanup quarantine. Requires real worker containment and output
  sanitization; test doubles are not a working Chromium service.
- `postgresGrants.js` / `deploy/web/008_browser_grants.sql`: additive permission
  repository and migration candidate. **Not applied or real-PostgreSQL-qualified.**

## Frozen route contract

Mount the browser router at `/api/browser/v1` on its **dedicated** listener, before
JSON middleware. All listed routes use POST, JSON and no-store responses:

| Relative route | Tool |
|---|---|
| `/capabilities` | `get_browser_capabilities` |
| `/sessions` | `browser_open` |
| `/observe` | `browser_observe` |
| `/navigate` | `browser_navigate` |
| `/act` | `browser_act` |
| `/credentials` | `browser_credentials` |
| `/authenticate` | `browser_authenticate` |
| `/extract` | `browser_extract` |
| `/action-status` | `browser_action_status` |
| `/close` | `browser_close` |

Human control exposes POST `/grants` and `/grants/:grantId/revoke` on a separate
control mount, requiring verified current owner/admin identity and explicit
`organizationId` / `projectId` query scope. These are never MCP model tools.
No handler is installed in existing servers by importing these modules.

Operation IDs are caller/host/runtime-epoch scoped. Recover a lost `browser_open`
reply without knowing its session ID. On runtime restart, report unknown outcome;
never silently create a replacement session or replay a login. Closed receipts
retain only outcome identity, not private page content.

## Next implementation, not yet available

Complete BROW-02 real process/IPC/egress containment, current-principal/host-proof
wiring, protected owner enrollment and isolated PostgreSQL migration tests.
Then BROW-03 observations and BROW-04 generic interactions. Protected credential
input/native/XHR login, MCP registration, exact-image qualification and release
remain later sprint work. `privateEnabled` defaults to false.

Run focused foundation tests from repository root:

```sh
node --test tests/browser/*.test.cjs
```

Canonical plan/checkpoint live one directory above this independent Git repository:
`../docs/plans/traylinx-web-agent-generic-browser/` and
`../docs/sprints/CURRENT_STATUS.md`. Do not use older planning-validation reports as
runtime proof. No full suite, performance campaign or production credentials needed.

## Optional stdio transport (GB01 development)

`TRAYLINX_BROWSER_CONNECTION_FILE` enables the additive browser MCP adapter in
`scripts/web-agent-mcp.js`. Absent this variable, existing tools remain unchanged.
The host-owned absolute-path JSON file must be a regular, current-user-owned file
with no group/other permissions, not a symlink. It contains `url` (HTTPS endpoint
ending `/api/browser/v1`), `bound` (enrolled identity/host binding), `grantId`, and
an Ed25519 `privateKey` matching that host fingerprint. This is a platform host
connection, **not** a website recipe or website-password file. Provision it through
owner enrollment; do not construct authority from page text or model claims.

Each call obtains fresh Sentinel headers and signs the exact method/path/body.
Only the two Sentinel headers plus browser identity/proof headers are forwarded.
Redirects, cached responses and oversized output fail closed. No action is retried
automatically: use the original action ID and status tool to resolve uncertainty.

Source wiring and synthetic stdio/HTTP fixtures are implemented. No production
browser service or real host connection has been installed by this change.
Protected website-input transport and owner setup still require composition.

### Protected remote input transport (GB01, not deployed)

`remoteCredentialProvider` connects the paired loopback `credentialSurface` to
`browserInput` through `httpClient.protectedCall`. The local owner identity must
come from the paired session verifier, never an MCP argument. Completion proofs
bind the current grant, host, owner, entry, session, origins and expiry, with an
atomic single-use nonce. Ordinary host request signatures independently bind the
exact submitted body. The broker retains credentials only in bounded volatile
buffers; HTTP responses use strict shared `inputContracts` schemas.

The owned composition test uses a real loopback form and Express route, real
Ed25519 proofs, and synthetic session/owner authority. It does not certify live
owner setup, PostgreSQL, a deployed private browser or customer-site login.
Runtime/server setup and authentication-decision delivery remain pending.

### Composed runtime

`createBrowserRuntime` assembles the dedicated Express routes, session manager,
volatile input broker, signed host/completion/consent verification and persistent
worker factory. `authorize`, current `resolveCaller`, atomic `consumeNonce` and
isolated egress `lease` are mandatory operator-side dependencies, not model inputs
or permissive defaults. Private mode defaults off. Protected input routes precede
the browser router's terminal 404; the legacy server does not import this runtime.

Session identity is passed only to the parent worker factory as a separate trusted
context. It is not serialized into Chromium initialization. Worker disposal also
removes pending credential/decision entries. Worker outputs are validated by
operation before receipt storage. Owner provenance survives grant validation so
legitimate credential requests can identify the approving owner.

Owned runtime composition tests exercise signed HTTP, session dispatch, completion,
consent, consume-once private delivery and shutdown using a worker fixture. Actual
Sentinel/PostgreSQL boot wiring and real Chromium-through-IPC release qualification
remain required; this module alone is not a production release.

### Dedicated startup and authority (not released)

`scripts/browser-server.js` is the opt-in entrypoint. `BROWSER_ENABLED` defaults to
`0`; `BROWSER_PRIVATE_ENABLED` defaults to `0` and cannot enable a disabled server.
The service is separate from legacy capture and READ. Default listener is
`127.0.0.1:8292`; deployment must explicitly configure the container binding.

Required when enabled:

- `BROWSER_CONTAINMENT=isolated-proxy-v1`, only after actual containment qualification.
- `BROWSER_POSTGRES_URL`, `BROWSER_REDIS_URL`: protected deployment configuration.
- `BROWSER_AGENT_ACCESS_URL`: existing current Sentinel caller access endpoint.
- `BROWSER_OWNER_ACCESS_URL`: existing service-authenticated current authority endpoint.
- `BROWSER_SENTINEL_URL`, `BROWSER_SENTINEL_CLIENT_ID`,
  `BROWSER_SENTINEL_CLIENT_SECRET`, `BROWSER_AGENT_ID`: operator service identity.
- `BROWSER_PROXY_CONTROL_URL`, `BROWSER_PROXY_TOKEN`: dedicated browser egress lease.
- Optional `PUPPETEER_EXECUTABLE_PATH`, `BROWSER_HOST`, `BROWSER_PORT`.

Startup checks the separately applied `web_browser.grants` schema; it performs no
DDL. Runtime bindings retain the exact authenticated grant ID. Background checks
send only the original token-generation reference through the service identity,
not a retained customer token. Foreign identities/generations, revocation and
expired authority fail closed. Redis uses atomic `SET NX PX` under the separate
`browser-v1:nonce:` prefix with hashed identifiers and at most 120-second TTL.
Deployment must verify this namespace cannot be evicted or cleared while proofs
remain valid; restarting the browser must not reset replay protection.

Focused tests use database/Redis doubles and synthetic service responses. No real
database connectivity, migration, Redis policy, service entitlement or deployed
browser readiness is implied. Those remain release gates, alongside the container
packaging and actual protected host setup.

### Host liveness

The optional browser stdio adapter now owns session heartbeats automatically.
`/api/browser/v1/heartbeat` is a signed, current-authority-checked host route, not
an MCP tool or owner approval. Heartbeats run every 30 seconds; 60 seconds without
an acknowledgement marks the local session lost, matching the server's host-loss
ceiling. The server still enforces independent idle/absolute/action limits.

A failed heartbeat never replays a website action. Lost-open recovery can recover
session tracking through the original action receipt. Disconnect closes tracked
sessions best-effort within five seconds; a late open result after disconnect is
also closed. If delivery fails, server-side expiry remains authoritative. No
browser host adapter is constructed when the optional connection is absent, so
legacy stdio tool exposure remains unchanged.

### Owner pairing transport

Private runtime exposes signed host-only `pair-begin`, `pair-exchange` and
`owner-check` routes. `createProtectedHost` composes these with the local PKCE
session and protected credential form. Pairing IDs have a stable alphabetic prefix
so random base64url bytes cannot violate the public ID grammar.

Human approval is a separate bearer-authenticated boundary at
`POST /api/browser/control/v1/pairings/:pairingId/approve`, with organization/project
query scope and empty JSON body. It rejects agent headers, ambient cookies and
Origin. A trusted Workspace backend must call it; it is not a model approval tool
or a cross-origin browser form action. Only the current original approving owner
can approve; the result contains the one-time callback destination for that owner.
The pairing-only runtime mount does not expose grant creation/revocation.

Private production startup additionally requires `BROWSER_PROJECT_ACCESS_URL` for
the existing human project authority resolver. Grant enrollment/Workspace setup UI,
actual stdio protected-host presentation and scoped pending-operation consent still
need integration. Owned transport tests exercise real signatures and loopback HTTP
with synthetic human/current-agent authority, not a live Workspace session.
