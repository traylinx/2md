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
into a grant. Next implement durable admission/result orchestration, fenced worker
claim and authenticated SEARCH execution transport. Only the worker may consume
a dispatch claim, and uncertain execution must become `needs_reconciliation`
rather than be automatically retried. No worker currently consumes this outbox.
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
