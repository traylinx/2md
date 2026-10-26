# Durable public-read admission

Status: internal storage slice, not a public API or deployed schema.

`lib/web/postgresAdmission.js` requires a configured PostgreSQL-compatible pool,
current verified principal, policy version and an independently authenticated
confirmation authorizer. There is no default database or permissive authority.
The repository inserts plans without updating existing content. Reusing a plan ID
with different content fails. The confirmation authorizer must verify human
`web:confirm` authority, CSRF protection and the exact plan digest; agent text or a
caller-supplied boolean is not consent. Authorization tokens are not SQL arguments.

`deploy/web/001_admission.sql` creates a separate `web_read` schema. Do not add it
to automatic deployment. Database ownership, least-privilege runtime grants,
connection/statement deadlines and the production driver must be configured in a
separately approved integration step. The migration deliberately fails if the
schema already exists; it does not silently overwrite an existing installation.

Admission is a single PostgreSQL function call. It serializes a principal/org/
project/operation-scoped idempotency key, locks the plan and confirmation, and
inserts the run and reference-only outbox together. Retrying the same key and
content returns the original run. Different content conflicts. A second key
cannot spend the same confirmation. Revoked or expired plans cannot start a new
run. A connection failure is an unknown admission outcome: retry the same key,
not a new logical operation. Replays return run metadata, not execution permission
or captured content. Current principal authorization is still required.

This repository is intentionally **not** the existing synchronous controller's
`admit` port: that port expects an execution grant. Do not adapt a metadata result
into a grant. Next wire durable admission/result orchestration and authenticated SEARCH
execution transport to the fenced worker described below. Only the worker may consume
a dispatch claim, and uncertain execution must become `needs_reconciliation`
rather than be automatically retried. The worker implementation below is not activated; no runtime consumes this outbox.
Captured content, bearer tokens, browser sessions and provider credentials are not
stored. Plan metadata retains validated public target URLs; a retention/purge
policy remains required before activation. This is not the full quote/billing or
agent product confirmation system.

## Focused verification

```sh
node --test tests/web/*.test.cjs
PG_BIN=/path/to/postgresql/bin python3 tests/web/sql/run-isolated.py
```

The SQL harness uses an existing local PostgreSQL installation, a private temporary
socket-only cluster, 16 MiB shared buffers and ten connections. It checks replay,
conflicts, ownership, revoked confirmation, transactional outbox failure and four
concurrent same-key admissions. It stops/removes only its own cluster. It does not
connect to production, install PostgreSQL or run a capacity benchmark.

## Fenced worker lifecycle (S02B)

`002_worker.sql` adds atomic reference claims, worker ownership, a monotonic fence,
a bounded lease and terminal outcome metadata. Claiming removes the outbox row in
the same transaction. Only admitted runs can be claimed. A duplicate worker cannot
claim an already-running run; revoked confirmations and expired plans are closed
without dispatch. A terminal write requires the exact worker/fence and a live
lease. Partial captures retain `result_state=partial`, even though their lifecycle
state is `completed`; completion does not certify extraction quality.

`reconcile_expired(limit)` locks at most 1,000 expired runs with `SKIP LOCKED` and
marks them `needs_reconciliation`. It never requeues them. A lost claim response,
worker crash or lost completion write therefore cannot trigger blind replay.

`postgresWorker.js` provides the internal SQL port. `readWorker.js` processes one
reference, rechecks current creator/project authority, bounds execution to the
plan deadline/lease, and passes only execution ID/digest/worker/fence to transport.
It stores no capture content in PostgreSQL and returns no captured pages to the dispatcher caller. Validated content is staged in the encrypted transient store below. Exceptions after
transport invocation are ambiguous and require reconciliation. No service loop,
public route, database credentials, worker activation or deployment is added.

Remaining integration: authenticate the READ-to-SEARCH transport, atomically
consume its fenced dispatch reference at the receiving boundary, wire durable
controller/run retrieval and transient result delivery, configure the real pool
and scoped roles, and verify Workspace with its pinned Rails/database runtime.
The injected execution port alone is not a production authenticated transport.

## Single-use dispatch transport (S02C)

`003_dispatch.sql` adds a consumed timestamp and atomic `consume_dispatch`.
The exact execution ID, worker ID, fence and plan digest must match a running,
unexpired claim with a non-revoked confirmation. Consumption returns authoritative
plan data once. A lost response after consumption is uncertain; never request a
new claim or replay capture automatically.

`dispatch.js` sends reference-only JSON to a fixed HTTPS SEARCH endpoint using
service SDK proof. It rejects redirects, unexpected response shapes and oversized
status bodies, and does not forward customer bearer credentials. `dispatchGrant.js`
implements the reciprocal READ grant endpoint: verify the pinned SEARCH identity
and narrow operation, recheck live creator/project rights, then consume the claim.
`dispatchServiceVerifier.js` reuses the existing Sentinel receiver verifier and
its credential lifecycle; it grants only `web:consume-dispatch`, no target origins.

SEARCH's `read-dispatch-http.ts` supplies the request handler, grant client and
pinned READ-service SDK introspection adapter. Authentication requires matching
active, unexpired `a2a` proof; a claimed agent-ID header alone is insufficient.
The confirmed execution consumer receives targets only from READ's consumed grant.
All HTTP adapters remain unmounted. Runtime SDK/pool configuration and service
operation grants are not created by these modules or these commits.

Focused evidence uses synthetic SDK/identity/database adapters for the cross-repo
HTTP composition, plus real isolated PostgreSQL for single-use/fence checks. No
live credentialed communication or production deployment was performed. The
service transport now returns bounded captured results to READ, which validates
and stages them as described below. It is not an end-user/public result endpoint. Status
`complete` is transport completion, not an assertion that extraction quality is
complete. Existing per-page capture quality remains on the consumer result.


## Creator-authorized result delivery (S02D)

`runAdmissionController.js` submits durable admission only; request retries cannot
start capture synchronously. An expired plan does not prevent retrieval of a
previous admission through the same idempotency key. SQL still rejects an expired
plan when admission is new. `runReader.js` scopes run lookup by creator, organization
and project, and rechecks current project rights immediately before disclosure.
Pending/unpublished content returns `RESULT_NOT_READY`; absent or expired content
returns `ARTIFACT_EXPIRED`. Metadata does not require a result-cache read.

The private SEARCH response now includes captured pages. READ validates the
manifest, target order, Markdown digests, final URLs, failure codes, partial state
and aggregate two-MiB size before publication. Page quality `degraded`/`unknown`
remains explicit. Treat Markdown as untrusted text; never render active HTML.

`transientResults.js` requires an explicitly configured Redis-compatible client and
32-byte encryption key. It uses AES-256-GCM with creator/project/run/digest/fence
as authenticated data. The separate `web-read:{transient-results}:` namespace is
never the legacy anonymous cache. Default content TTL is five minutes (configurable
one second to five minutes), with 128 entries and 32 MiB encrypted-payload budget
at most (configurable up to 64 MiB). Atomic admission refuses capacity rather than
evicting active results; existing entries cannot be overwritten. Expired capacity
metadata is pruned on writes using Redis server time. Metadata indexes contain
only hashes/sizes/expiry; expired entries can remain there until the next write.
This short transient delivery window does not activate the proposed seven-day
artifact-retention product or certify backup deletion.

The worker stages encrypted content, then publishes its expiry in PostgreSQL via
`004_result_publication.sql` with the current worker/fence/live lease. A stale
worker's staged content is inaccessible through run retrieval and expires normally.
Unknown cache or completion-write outcomes require reconciliation, not recapture.
Redis loss/key rotation can make content unavailable: report expiry/unavailability;
never silently regenerate it. Configure the same protected key across READ replicas,
namespace-scoped ACLs and bounded connection/command timeouts before activation.
No production key, ACL, Redis configuration or database migration was applied.

Focused checks used socket-only temporary PostgreSQL and Redis instances with
synthetic data; both were stopped and removed. Redis test persistence was disabled.
HTTP composition used synthetic SDK/identity/database ports, not live credentials.

## Runtime composition and HTTP surface (S02E)

`runtime.js` composes the existing admission repository, worker, dispatch client,
grant handler, encrypted results and run reader. `application.js` provides a
separate Express application factory. Disabled by default, it returns 404 without
constructing clients or starting a dispatcher. Enabling without real human,
confirmation, background-owner and SEARCH-service authorities fails construction.
There is no import-time listener, connection, migration or worker startup.
The legacy `server.js` and its wildcard CORS middleware are unchanged.

The dedicated app exposes these routes under `/web/v1` when explicitly enabled:

- `POST /plans`: exact public URL/deadline/response-limit specification; creates a
  server-generated plan bound to the verified caller/project and current policy.
- `POST /plans/:id/confirmations`: explicit confirmation ID, bearer authentication,
  allowlisted Origin and separately supplied confirmation authority.
- `POST /runs`: plan/confirmation references and scoped `Idempotency-Key`; returns
  202 for new admission or 200 for replay. Never executes capture synchronously.
- `GET /runs/:id` and `GET /runs/:id/result`: creator/current-project guarded reads.
- `POST /internal/dispatch-grants`: service-only fenced grant consumption; no
  browser Origin or customer bearer authentication is accepted.

Human routes use `organizationId` and `projectId` query selectors, not identity
assertions. Cookie-only or mixed human/agent authentication is refused. JSON bodies
are limited to 16 KiB; duplicate credential/idempotency/origin headers are rejected.
CORS allows only configured exact HTTPS origins, never `*`. Responses are no-store.
Do not mount this router behind the legacy wildcard CORS/body-parser stack.

`dispatcher.js` has no overlapping ticks, default concurrency two (maximum four),
1-second polling and a bounded 100-row lease sweep. It fetches reference-only outbox
entries; SQL claim ownership still decides who may execute. An unavailable
unclaimed admission may be polled later; claimed/uncertain executions are not
requeued. `start()` is explicit; `stop()` aborts active workers and waits for the
current bounded tick. Diagnostic counters contain no raw dependency exceptions.

`runtimeClients.js` configures a maximum four-connection PostgreSQL pool, 2-second
connection timeout, 5-second server statement timeout and 6-second client query
timeout. Redis uses 2-second connect/5-second command deadlines, no offline queue,
no automatic command resend and no reconnect retry. Connections require explicit
`open()` and are shut down by `close()`. PostgreSQL `pg` is pinned to 8.23.1 in the
manifest/lockfile; lock-only update did not reinstall local dependencies.

**Activation still pending:** bind real authority adapters (including fresh
background-owner membership checks), choose and wire the deployment entrypoint,
configure protected client/Redis result-key/namespace ACLs and scoped database
roles, apply separately approved migrations, and verify Workspace with its pinned
Rails/database runtime. The new app has been exercised through real local HTTP
with synthetic backend/identity ports, not against production services.

## Live background-owner authority (S02F)

`ownerPrincipal.js` authenticates READ to WORKSPACE's new
`/web/background-project-access` endpoint using the READ SDK's service proof. It
sends only the stored plan's creator/workspace/org/project selectors, never a human
bearer, claimed role or arbitrary HTTP headers. WORKSPACE verifies the pinned READ
identity via Sentinel and evaluates its existing current project policy. READ
checks the returned principal against every stored selector and rejects VIEWER.
There is no membership cache, snapshot fallback or permission inference from the
service pass itself. Errors, redirects, unexpected bodies and deadline overruns
fail closed before capture.

`createWebRuntime` can build this real resolver from `ownerAccessEndpoint`, the
existing READ SDK and configured READ agent ID. Tests may still inject a resolver;
missing both the endpoint and an explicit resolver remains a construction failure.
The endpoint and new WORKSPACE feature flag are not configured or activated by
this code change. Human confirmation integration, production entrypoint wiring,
scoped runtime configuration and pinned Rails/database verification remain pending.

### Dedicated process lifecycle (local implementation)

`lib/web/process.js` owns the dedicated HTTP listener and infrastructure lifecycle.
It validates composition before connecting, opens clients before listening, and
starts dispatch only after the listener succeeds. `/health/live` reports process
liveness; `/health/ready` stays unavailable when disabled or draining. Connection
and listen failures return sanitized errors and clean owned resources. Shutdown
closes admissions, aborts/drains dispatch, then closes clients; HTTP connections
have a bounded drain window. Start/stop are idempotent, with no restart after stop.
The default listener is loopback, port 8081. The disabled default does not connect
to infrastructure. No schema migration or legacy server modification occurs.

This is a callable lifecycle module, **not yet a production executable or deployed
service**. Trusted confirmation-channel composition, environment/secret binding,
signal handling in the eventual executable, and pinned Rails/database integration
verification remain required before activation. Existing bearer plus Origin is
not by itself proof of the separate human confirmation authority.

### Signed human confirmation assertions

The confirmation route now requires `X-Web-Confirmation` in addition to current
human authorization and an allowed Origin. The runtime can configure
`confirmationAuthority: { publicKey, issuer, keyId }`. READ holds only the pinned
Ed25519 verification key. No request-provided key, key URL or algorithm is used.

The compact signed assertion uses header `alg=EdDSA`,
`typ=web-confirm+jwt`, and the configured `kid`. Exact payload fields are:
`iss`, `aud=web-read-confirmation`, `scope=web:confirm`, `sub`,
`workspaceUserId`, `organizationId`, `projectId`, `planId`, `planDigest`,
`confirmationId`, `iat`, `exp`. Timestamps use integer Unix seconds; lifetime is
at most 120 seconds, with no future issuance or expired acceptance. Every identity
and plan field must match the current verified principal and stored immutable
plan. Unknown claims, algorithms and keys fail closed. The assertion is transient,
not persisted in SQL or returned in results. Identical valid proof retries use
the existing durable confirmation/idempotency rules.

**Issuer integration remains pending.** Only the separate user-controlled,
CSRF-protected confirmation service may sign after displaying the exact plan and
receiving explicit user approval. Never provide its signing key, session or
assertions to the proposer/model. Signature verification does not itself prove a
human clicked: that guarantee depends on the protected issuer and UI integration.
No production key was generated, configured or deployed in this implementation.
