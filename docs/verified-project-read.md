# Verified project reads (internal integration)

**Status:** internal code; no customer-facing route or deployed activation.

The new `lib/web/` boundary connects a verified project member and confirmed plan
to the existing Search Sentinel capture adapter. Existing html2md routes, browser
guards, anonymous conversion behavior and Sentinel grants remain unchanged.

## Identity and permissions

`createProjectPrincipalResolver` calls only the operator-configured HTTPS Workspace
access endpoint. It sends the caller bearer token to that trusted endpoint only,
never to Search, a browser target or a model. It forwards no identity/admin headers.
Responses are bounded, uncached and strictly checked against the selected project.

The new Workspace resolver independently validates the token with AUTH, then reads
an existing user by AUTH subject and checks existing project access. It never calls
the user-provisioning `/me` path, matches by email, creates memberships or uses a
shared infrastructure credential. Missing/ambiguous mapping denies access.

OWNER, ADMIN and MEMBER may execute a confirmed public read. VIEWER cannot execute.
Results remain creator-only and require current project permission. Stopped,
revoked, foreign and unavailable authorization paths deny access.

## Plans and execution

`contracts.js` validates/copies/freezes scope and deterministically hashes it.
Supported plans contain 1–5 public HTTPS URLs, fixed `captured-pages-v1` output,
transient retention and bounded time/response limits. Secret-bearing URLs,
unsupported operations and unknown fields are rejected. Shape validation and a
hash are **not consent**.

`createReadController` requires explicit trusted `resolvePrincipal`, `loadPlan`,
`admit` and `execute` functions plus an operator policy version. It has no defaults.
The admission port must validate a separate authenticated confirmation and
atomically claim one execution. Confirmations expire within five minutes and bind
the exact plan, creator, project, policy, schema and limits. Changed scope requires
new confirmation. Chat text or `confirmed: true` cannot substitute for it.

Current permission is checked before loading/admitting the plan, before dispatch
and before returning content. Cancellation/deadline stops later dispatch; a remote
request already in flight is not claimed instantly reversible. Duplicate/ambiguous
admission must reconcile through the future authoritative backend, never retry
capture blindly. Partial/degraded capture results remain explicit.

The execution port sends only `executionId` and `planDigest` to Search. Its new
consumer requires an authoritative, one-time scope resolver before requesting a
service Sentinel proof. No new Search endpoint is mounted. Local cross-repository
imports exist only in a test harness, not in production code.

## Checks

```bash
node --test tests/web/*.test.cjs
```

Search's `read-product-integration.test.ts` requires `TRAYLINX_READ_TEST_ROOT` set
to this checkout. It connects real controller/client/consumer/adapter code with
synthetic Workspace HTTP responses and test-only authority, not live databases or
production authentication. Run it with the existing Vitest installation and a
small worker cap. No credentials or paid providers are needed.

## Before deployment

Still required: durable admission and confirmation state, production execution
delegation/transport, full Rails/database and deployment-runtime verification for
the new Workspace endpoint, runtime settings, and a separately approved scoped
release. No in-memory authority may be wired into production. Existing SDK
packaging remains pinned; do not require an unpublished npm RC.

Rollback: keep the new product route unregistered/disabled and the Workspace
lookup feature disabled. Preserve existing APIs, grants and unrelated work.

## Durable storage follow-up

The internal [durable admission repository](durable-read-admission.md) now stores
plan/confirmation/run/outbox metadata transactionally. It is not wired into the
synchronous controller and grants no execution authority. Fenced dispatch and
authenticated transport remain required before activation.
