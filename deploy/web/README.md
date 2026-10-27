# Dedicated READ and headless MCP packaging

This package does not replace the legacy API or browser/capture deployment.
Targets `read`, `control` and `mcp` contain only the Node runtime dependencies and explicit
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

Release gates still open: production-architecture image build/run and publication,
scoped database provisioning, Workspace integration, host-controlled approval,
background agent revocation and a real headless client journey. Agent execution is implemented behind a default-off gate, not enabled in production.
Packaging is not evidence of deployment or full agent readiness.

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

## Headless control process

Run `node scripts/web-control-server.js`, or build the `control` Docker target
with the same approved immutable `NODE_IMAGE` digest. It defaults disabled on
port 8082. This service runs only approval HTTP handlers, not a worker, dispatcher
or result-cache client. It does not migrate the database.

Set `WEB_CONTROL_ENABLED=1` only after configuring:

- `WEB_CONTROL_POSTGRES_URL`: protected login with only `web_read_control` membership.
- `WEB_CONTROL_PROJECT_ACCESS_URL`: fixed HTTPS human project-authority endpoint.
- `WEB_CONTROL_OWNER_ACCESS_URL`: fixed HTTPS background owner-authority endpoint.
- `WEB_CONTROL_SENTINEL_URL`, `WEB_CONTROL_AGENT_ID`,
  `WEB_CONTROL_SENTINEL_CLIENT_ID`, `WEB_CONTROL_SENTINEL_CLIENT_SECRET`:
  protected service identity explicitly accepted by the owner-authority endpoint.
- `WEB_CONTROL_CONFIRM_ISSUER`, `WEB_CONTROL_CONFIRM_KEY_ID`,
  `WEB_CONTROL_POLICY_VERSION`: matching READ verification configuration.
- `WEB_CONTROL_SIGNING_KEY_FILE`: an Ed25519 private-key file readable by the
  service UID, mounted read-only with mode 0400 or 0600. Symlinks and group/world
  permissions are rejected. Do not mount a default Kubernetes Secret symlink
  directly: stage the selected key into a private service-owned file with the
  required mode. Never place it in image layers, arguments, logs or MCP config.

`WEB_CONTROL_HOST` and `WEB_CONTROL_PORT` override the listener; the container
binds 0.0.0.0, while the direct executable defaults to loopback. Termination drains
HTTP before closing its bounded two-connection PostgreSQL pool. Configuration
errors produce sanitized diagnostics. No Redis credentials are required.

Factory, approval-handler and process-lifecycle tests passed with fixture
adapters. The control container has passed isolated ARM64 build/start checks, but is not
deployed or production-architecture qualified. Workspace background
agent authority and rotation-aware AUTH references are now implemented locally;
full framework/database and live integration remain unverified. **Keep agent
execution disabled** until those release gates pass.

## Approved agent admission rollout

`WEB_READ_AGENT_EXECUTION_ENABLED=1` explicitly enables agent-proof POST `/web/v1/runs`;
it requires READ enabled and `WEB_READ_AGENT_ACCESS_URL` configured. Defaults off.
Keep it off until AUTH/Workspace background checks, approval control, schema roles,
SEARCH dispatch and the complete headless flow have been qualified. No migration
or flag change is performed by packaging. The MCP image also includes the separate
host command `scripts/web-agent-run.js`; it is not registered as an MCP tool.

## Bounded isolated headless journey

Run `PG_BIN=/path/to/postgresql/bin python3 tests/web/sql/run-headless-isolated.py`
with the existing pinned Node dependencies available (`pg`, `ioredis`, `supertest`)
and `redis-server` installed. For a checkout without `pg`, stage the locked
`deploy/web/runtime` manifest in an owned temporary directory, run its `npm ci`,
set `NODE_PATH` to that temporary node_modules directory, then remove it afterward.
Do not reinstall unrelated project dependencies or install system packages.

The driver creates a socket-only temporary PostgreSQL cluster, applies migrations
001–006, and runs a single bounded Node journey using actual runtime/control SQL
roles and a socket-only persistence-disabled Redis. It verifies human approval,
idempotent admission, single-use dispatch, encrypted result retrieval and
revocation before dispatch. Node/Redis process group and temporary cluster are
cleaned on failure as well as success. No production databases or credentials.

Verified locally on 27 October: journey passed. AUTH/Workspace identity and SEARCH
capture are fixture adapters; this is not real Rails/Sentinel/SEARCH qualification,
a container build, load test or production deployment.

## Kubernetes preparation renderer

Render separate READ and control resources with qualified immutable images:

```sh
python3 deploy/web/render.py \
  --read-image "$QUALIFIED_READ_IMAGE_DIGEST" \
  --control-image "$QUALIFIED_CONTROL_IMAGE_DIGEST" \
  --namespace production > /tmp/traylinx-web-preparation.json
```

This prints JSON only. It does not contact Kubernetes, build/publish images,
create credentials or execute SQL. Do not pipe it to `kubectl apply` without
review and release authorization. The renderer rejects mutable/foreign images.

Both Deployments are deliberately **zero replicas with feature gates off**.
Each has its own ClusterIP Service and deny-all ingress/egress NetworkPolicy.
The pods use UID/GID 1000, read-only root filesystems, no capabilities, no service
account token and capped resources. No Ingress, database migration Job, Secret,
shared-service patch or private signing-key volume is generated. Recreate rollout
avoids overlap during this first single-instance release. MCP remains host-side,
not a public Kubernetes service.

Before activation, an operator must supply narrowly scoped configuration/Secrets,
private registry pull access, confirmation key mounts (including safe private-key
staging for control), exact network allow rules and approved SQL migrations/roles.
READ needs database, cache, Workspace, AUTH and SEARCH egress; control needs only
database, Workspace and AUTH. Never solve this by granting unrestricted egress.
Verify namespace-existing policies too: Kubernetes allow policies are additive.
Then enable each required gate and scale explicitly in the reviewed release.
Scaling alone leaves readiness at 503 and cannot enable product traffic.

`python3 tests/web/deployment-render.test.py` checks the inert preparation contract.
Three tests pass; this is a structural check, not Kubernetes admission, image
execution, server-side validation or deployment evidence. No manifests applied.

## ARM64 image qualification — 27 October 2026

All three Docker targets built on traylinx-ci using official Node 22 bookworm-slim
resolved to `node@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d`.
`tests/web/image-smoke.cjs` ran inside each image as UID1000, with networking disabled,
read-only rootfs, all capabilities dropped, 1 CPU / 384 MiB / 96 PIDs.
READ/control actual executable startup, live=200, disabled readiness=503, denied
product traffic and graceful termination passed. MCP completed a real client/server
initialize and tool-list handshake using synthetic configuration; no AUTH, model
or capture request was sent. Actual packaged SDK/dependencies resolved successfully.

Evidence and exact local image IDs: workspace
`docs/evidence/web-image-packaging-2026-10-27/{BASE,BUILD,SMOKE,SCAN}.txt`.
These are **ARM64 packaging results**, not AMD64 release qualification, an enabled
end-to-end result, a vulnerability audit or registry publication. Mandatory NODE_IMAGE
build argument produces expected Docker lint warnings about no default FROM value;
the build supplied the exact digest. No deployment or feature activation occurred.

## Required pilot configuration

Before enabling READ/control, their protected runtime configuration must include
`WEB_PILOT_ORGANIZATION_ID`, `WEB_PILOT_PROJECT_ID` and
`WEB_CAPTURE_ALLOWED_ORIGINS`. Disabled processes do not require these values.
Use identical pilot values, source origins and base policy version in READ/control;
use the identical source-origin list in SEARCH. Verify parity before deployment.
Changes invalidate old plans; obtain fresh human approval. No global rollout
switch is provided by this pilot implementation. Existing image smoke evidence
predates these changes: rebuild/qualify the release images before activation.
