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
