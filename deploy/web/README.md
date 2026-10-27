# Dedicated READ and headless MCP packaging

This package does not replace the legacy API or browser/capture deployment.
Targets `read` and `mcp` contain only the Node runtime dependencies and explicit
source paths. No Chromium, Python, frontend, tests, credentials or environment
files are copied. Sentinel's existing package hash is checked during build.

Supply a reviewed Node 22 base image as `NODE_IMAGE` **by immutable digest**:

```sh
docker build --file deploy/web/Dockerfile --target read \
  --build-arg NODE_IMAGE="$APPROVED_NODE_IMAGE_DIGEST" --tag traylinx-web-read:candidate .
docker build --file deploy/web/Dockerfile --target mcp \
  --build-arg NODE_IMAGE="$APPROVED_NODE_IMAGE_DIGEST" --tag traylinx-web-agent:candidate .
```

These commands build only; they do not push, migrate or deploy. Use traylinx-ci
for image builds, subject to its shared load/capacity runbook. No base digest is
invented or silently selected here. A tag-only override is not release-approved.

The READ image defaults disabled. Liveness `/health/live` can pass while readiness
`/health/ready` remains 503. Configure a separate service/port, a read-only root
filesystem, non-root UID, no Linux capabilities, no service-account token, explicit
resource caps and restricted egress. Supply environment secrets using existing
protected configuration; mount the confirmation public key read-only. No private
signing key belongs in READ. Schema and scoped database roles require separate
controlled preparation; startup never migrates or grants privileges.

Run the MCP target with stdin kept open, no TTY and no published port. Its stdout
is protocol only. Inject Sentinel/project configuration through the host's secret
mechanism. Do not bake secrets into image layers/build arguments. See
`docs/headless-agent.md` for variables and the supported tools.

Release gates still open: actual container build/run against an approved digest,
scoped database provisioning, Workspace integration, host-controlled approval,
background agent revocation and a real headless client journey. Agent execution
remains denied. Packaging is not evidence of deployment or full agent readiness.

## Database roles (manual migration 005)

After approved migrations 001–004, `005_runtime_roles.sql` creates three NOLOGIN,
non-superuser group roles atomically. It intentionally fails if these names already
exist rather than inheriting unknown grants. No passwords/login users are created.

- `web_read_runtime`: reads product metadata, inserts immutable plans and verified
  confirmations, and calls the five fenced lifecycle functions. It cannot directly
  mutate runs/outbox, delete plans or create schema objects. Confirmation insertion
  remains available because the current READ process contains that trusted route.
- `web_read_control`: reads plans/confirmations and inserts confirmations only;
  cannot admit/dispatch runs or read run contents. Optional/deferred control UI
  does not have to be deployed to create this group.
- `web_read_executor`: NOLOGIN function owner, never granted to application login
  identities. Holds only tables/columns needed by the reviewed lifecycle functions.
  SECURITY DEFINER functions use a fixed trusted search path with pg_temp last;
  PUBLIC execution stays revoked.

An operator must separately create protected login identities and grant only the
appropriate runtime/control group. Never grant executor membership or reuse a
superuser/migration login in the service. These are service-level privileges, not
row-level tenant isolation: the application still validates every owner/project.
No unrelated schema/database grants or shared credential changes are made.
Future function replacements require an explicit ownership/privilege review.

Verified in an isolated real PostgreSQL 16 cluster using SET ROLE: admission,
claim, dispatch consumption and finish work; direct lifecycle writes, plan deletion,
schema creation and control-role admission/run reads are denied. The temporary
cluster was removed. This does not mean the migration was applied in production.
