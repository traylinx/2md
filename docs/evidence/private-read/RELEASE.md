# Private-read and extraction release candidate — 28 October 2026

Status: **implemented and locally tested; deployment/live test pending**.

- Capture-only normalization retains headings inside content card headers,
  explicit accessible icon labels and rectangular comparison-table section rows.
  No inferred icons/prices and no modification of legacy static extraction.
- Optional MCP private-read tools use opaque caller connection IDs, immutable
  in-memory plans and once-only dispatch. No credentials in model tool arguments,
  public queues or durable plans. Result expiry/restart boundaries are explicit.
- Generic native and XHR login use fresh isolated browser contexts, exact account
  proof and scoped authentication endpoints. XHR permits at most three ordered
  authentication POSTs; subsequent writes/refresh are blocked. Existing native
  login and public APIs remain compatible.
- Focused tests: 26 node cases, 138 existing capture regression cases, 13 native
  browser scenarios and four XHR browser assertions passed. Real browser tests
  use owned HTTPS fixtures inside a network-disabled Docker container. These are
  not proof of real Traylinx website compatibility or production throughput.

Operator release: publish an immutable private capture image; guard rollout
against current image/configuration drift and preserve rollback snapshots.
Leave legacy, AUTH, USERS, READ/control and databases unchanged. Configure only
an exact caller private grant, then test through the registered MCP transport.
Update this record with actual deployment/live evidence before declaring ready.

See [client instructions](../../headless-agent.md#authenticated-website-reads-optional-client-connection).
