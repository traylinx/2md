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

Current deployment (28 October): READ, SEARCH, control and Workspace are running;
the real owner-approved pilot completed capture/result/comparison retrieval.
Comparison quality remains partial when source content is incomplete. See
`docs/sprints/traylinx-web/RELEASE_STATUS.md` and the workspace current checkpoint
for exact releases rather than the historical preparation notes below.

A real stdio MCP client connected to the supplied entrypoint with the customer's
protected Sentinel configuration, listed all five tools, and read an existing
production run successfully. Approval/admission are not model-facing tools. This
qualifies the MCP transport, not installation into every customer's Claude/Codex
configuration. Secrets remain host-bound; no capture was started by this check.

The READ/control/MCP Docker stage must include the transitive capture helpers,
including `resourceScope.js`. The source dependency-closure regression checks
this packaging boundary. Reader failures emit only fixed stage/code diagnostics;
raw SQL, URLs, proofs and credentials are never emitted. Historical transient
503s remain unexplained; successful current reads do not retroactively fix them.

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
adapters. The control container has passed ARM64 and native AMD64 packaging/start checks,
but is not deployed. Workspace background
agent authority and rotation-aware AUTH references are now implemented locally;
isolated database checks passed; the complete live integration remains unverified. **Keep agent
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

## Native AMD64 packaging

Run `bash scripts/package-web-amd64.sh` on the existing native x86_64 Docker
engine. It packages a committed source whitelist, scans with Gitleaks, builds
READ/control/MCP sequentially against the pinned Node22 base, verifies architecture
and runs the real entrypoint/MCP handshake with networking disabled. Smoke
containers use 1 CPU, 384 MiB, read-only root and no capabilities. Build dependency
installation requires registry access; no runtime credentials enter the context.
The script does not publish images, create infrastructure or deploy anything.

Local image IDs are not registry manifest digests. Do not put them into Kubernetes
manifests as GHCR references. Publish privately and resolve the registry digest
before rendering a release. Record the source revision and architecture alongside
that digest. Rebuild if runtime source changes.

## Private publication — 27 October 2026

Qualified source `04ca2f6` READ/control/MCP images were published under the private
GHCR package `traylinx/web-intelligence-agent`. Privacy was checked before any
application content was uploaded and after each image push. Existing public
`traylinx/2md` was not used. Runtime credentials were not included.

The workspace evidence directory `docs/evidence/web-private-publication-2026-10-27/`
contains exact registry references in `PUBLISHED_IMAGES.json`, six rendered inert
resources in `INERT_KUBERNETES.json`, and outstanding inputs in `RELEASE_INPUTS.md`.
Manifests remain unapplied: zero replicas, execution off, deny-all network policies.
Before activation, verify registry pull permission, coordinated upstream release,
scoped schema/logins, pilot/source parity, service identities, protected key mounts
and actual endpoint/network paths. Publishing images does not satisfy those gates.

## Protected runtime bindings

Add `--runtime-bindings` to `deploy/web/render.py` to reference pre-provisioned
runtime secrets without rendering their values. Output remains inert: zero
replicas, explicit enable flags set to `0`, deny-all networking, no Secret objects
or migration jobs. Explicit environment entries override secret-supplied flags.

Required names in the deployment namespace:

- `registry-ghcr`: existing platform image-pull secret. Access to the new private
  package was verified by actual Kubernetes pulls; no credential copy or rotation.
- `traylinx-web-read-runtime`: READ environment configuration only.
- `traylinx-web-control-runtime`: control environment configuration only.
- `traylinx-web-confirmation-public`: `public.pem`, mounted only in READ.
- `traylinx-web-confirmation-private`: `private.pem`, mounted only in the control
  init container. Never include this key in READ, MCP or environment configuration.

The non-root init container uses the same pinned control image. It stages the
selected key into a memory-backed volume as a UID1000-owned regular mode0600 file.
The control container receives only that staged volume, read-only. The original
Secret mount is unavailable to the main container. No key appears in command-line
arguments or logs. Startup continues to validate key type and protected file mode.

Validation: four structural renderer tests pass. A bounded check using the
qualified AMD64 control image and a synthetic symlinked key confirmed regular-file
output, UID1000, mode0600 and Ed25519 parsing. This does not validate Kubernetes
Secret projection/fsGroup behavior live; verify it during the disabled deployment
before enabling approval traffic. No real signing key or cluster Secret was
created by these checks. Runtime/network configuration and upstream deployment
remain required; this option is not an activation command.

## Disabled cluster deployment verified — 27 October 2026

READ/control Deployments, ClusterIP Services and deny-all NetworkPolicies now exist
in production. Each deployment was briefly scaled to one replica with all feature
flags off, using its qualified private digest and existing `registry-ghcr` pull
secret. Both ran as UID1000 with zero restarts; liveness returned 200, readiness
and product traffic returned 503 as required while disabled. Both were then scaled
back to zero. No public ingress, runtime Secrets or product schema were created.

Evidence: workspace `docs/evidence/web-disabled-deployment-2026-10-27/`. This proves
private registry access and disabled startup on the actual cluster, not enabled
service readiness. Existing AUTH/Workspace/SEARCH/HTML2MD deployments were not
modified. Runtime bindings, live key staging and enabled dependency checks remain
pending. Workspace/SEARCH ingress currently attaches legacy auth plugins; dedicated
Sentinel-only route handling must be verified before activation, without weakening
legacy authentication.

## Dedicated HTTPS routes — installed but gated

`python3 deploy/web/render-routes.py` renders four additive Ingresses and one
route-scoped `request-termination` plugin. It always blocks with HTTP503 and
`{"error":"WEB_RELEASE_NOT_ACTIVE"}`; no activation option is provided.
Existing ingress/auth plugins are not edited. Native backend paths are preserved:

| Role | Fixed HTTPS endpoint |
| --- | --- |
| Human project authority | `https://api.makakoo.com/web/project-access` |
| Customer agent authority | `https://api.makakoo.com/web/agent-project-access` |
| Background owner authority | `https://api.makakoo.com/web/background-project-access` |
| SEARCH dispatch | `https://api.makakoo.com/internal/web/read` |
| READ base | `https://api.2md.traylinx.com/web/v1` |
| READ dispatch grant | `https://api.2md.traylinx.com/web/v1/internal/dispatch-grants` |
| Control approvals base | `https://api.2md.traylinx.com/approvals` |

These routes avoid the legacy gateway bearer plugins that conflict with service
proof-only requests. Application authentication remains mandatory on activation:
current Sentinel identity and project scope, pinned service proofs, or human
OWNER/ADMIN bearer as appropriate. AUTH retains its existing HTTPS API prefix.

On 27 October all five resources passed server dry run and were applied with the
gate attached. Six live TLS-verified checks returned the exact gated response.
Before/after hashes of the five existing AUTH/Workspace/SEARCH/HTML2MD ingresses
match. READ/control remain at zero replicas with deny-all networking.

Evidence: workspace `docs/evidence/web-gated-routes-2026-10-27/`. This verifies
routing to the gate, not upstream authentication, request delivery or activation.
Do not remove the gate until compatible upstream releases, scoped secrets/storage,
network rules and application-level denial checks are ready. Do not delete the
plugin while its ingress annotations remain; controlled activation must explicitly
change the relevant annotations and preserve all legacy routes.

Kong reference: https://developer.konghq.com/plugins/request-termination/

## Runtime keys provisioned — 27 October 2026

Four dedicated Secrets now exist in production:
`traylinx-web-confirmation-public`, `traylinx-web-confirmation-private`,
`traylinx-web-read-runtime`, `traylinx-web-control-runtime`.
The Ed25519 pair was generated in memory and sent directly to Kubernetes;
private/public key Secrets are immutable. The READ runtime Secret contains a
fresh 32-byte result-encryption key. Both runtime Secrets contain matching issuer
`traylinx-web-control`, key ID `web-20261027-v1` and base policy `pilot-v1`.
No existing signing key or shared password was rotated. No private key or result
key was written into repository files, command arguments, logs or evidence.

Runtime bindings were applied while disabled. Actual Kubernetes checks confirmed
Secret projection/fsGroup staging produces a regular UID1000-owned private key
with mode0600; the control main container cannot access the original Secret mount.
READ has no private-key mount and its public-key fingerprint matches control.
Both deployments were returned to zero replicas; gateway release gate remains on.

**Configuration is incomplete.** Runtime Secrets contain scoped database URLs but still need
service identity inputs, fixed endpoints and exact pilot/source policy. Cache
credentials are now present for READ only.
Do not replace these Secrets with incomplete manifests or regenerate keys on retry.
Inspect existing names before resuming; preserve the current result/signing keys.
Use the normal protected cluster backup/recovery process; do not export them into
the planning/evidence repository. Evidence contains only names and public-key hash:
workspace `docs/evidence/web-runtime-keys-2026-10-27/`.

## Product database prepared — 27 October 2026

Dedicated `web_intelligence` database now exists on `traylinx-db`, owned by the
maintenance role with a 12-connection limit. Public database access is revoked.
Migrations 001–006 were applied in order with bounded lock/statement deadlines.
Four product tables and the three NOLOGIN permission groups exist; groups have no
superuser, role/database creation or RLS-bypass privileges. Control cannot select
runs; runtime cannot directly update runs. No executions exist. Existing databases
were not migrated or modified. Migration hashes and outputs are recorded in the
workspace evidence directory `docs/evidence/web-storage-preparation-2026-10-27/`.

Separate `web_read_login` and `web_control_login` accounts are provisioned with
only their corresponding group and database CONNECT, connection limits 4 and 2,
5-second statement and 2-second lock deadlines. Protected URLs were added to the
existing runtime Secrets without replacing their keys. Neither login belongs to
`web_read_executor`. No existing application credentials were reused or rotated.

HBA now permits only this database and these users over TLS from the three
Kubernetes nodes' exact Tailscale IPs. The prior file was hash-checked and preserved
as a root-only preimage; PostgreSQL configuration was reloaded, not restarted.
`postgres-egress.json` adds only TCP5432 to `100.69.18.112/32` for the two product
pod selectors. It is additive to deny-all isolation; no ingress or other egress is
opened. Apply this separate policy only as part of approved runtime preparation.

Include this database in the established protected backup process before accepting
durable production work. The existing daily job already includes this database;
see the verified backup preparation below.

The existing server certificate has SAN `DNS:traylinx-db`. The renderer now mounts
public certificate trust from ConfigMap `traylinx-web-postgres-ca` at
`/postgres-tls/server.pem` and resolves `traylinx-db` to private IP `100.69.18.112`.
Use PostgreSQL URLs with hostname `traylinx-db` and query parameters
`sslmode=verify-full&sslrootcert=/postgres-tls/server.pem`. Never set
`rejectUnauthorized=false` or downgrade to plaintext to work around hostname errors.
The public certificate was copied from the actual server; certificate rotation
requires updating this pinned trust material before rollout.

Actual READ/control Kubernetes pods authenticated with their separate accounts
using the pinned certificate and `verify-full`; both reported TLS enabled.
Checks confirmed metadata reads, no direct run updates or executor membership,
and control denied run reads. Both deployments returned to zero replicas with the
public release gate retained. Evidence: workspace
`docs/evidence/web-database-access-2026-10-27/`.
Valkey and backup preparation are recorded below. Service identities and the
coordinated upstream release remain pending.

## Scoped result cache and backup coverage — 27 October 2026

`web-read-results-v1` is provisioned on the shared Valkey7.2.13 service. Its only
key pattern is `web-read:{transient-results}:*`; exact commands are versioned in
`result-cache-acl.json`. INFO supports the existing ioredis readiness handshake.
No SELECT, key discovery, administrative commands, Pub/Sub or foreign key access
is granted. EVAL permits scripts within these command/key grants; it is not a
CPU sandbox or a separate tenant. Existing default/Sentinel users and global
memory/AOF settings were compared and preserved.

`provision-result-cache.py` is a root/operator utility, not application startup.
It takes a password through protected stdin, defaults to inspection, and requires
an approved reference plus exact config hash to apply. It checks the existing
Sentinel include hash, saves a root-only preimage, creates only the new service-owned
0600 `/etc/valkey/web-read-users.conf`, and appends its explicit include. No global
rewrite or restart occurs. Resume interrupted preparation with the existing Secret
and exact inputs; never regenerate/overwrite credentials to make a retry pass.
Persistent file verification is not a live restart or recovery test.

Only `traylinx-web-read-runtime` received `WEB_READ_REDIS_URL`. The separate
`result-cache-egress.json` permits READ alone to reach100.69.18.112:6379; control
has no cache credential or cache egress. This uses Redis over the private Tailscale
network, not native Redis TLS. Never expose this listener publicly.

Actual READ pod used the packaged runtime clients and production result-store
implementation with synthetic content: connection, encrypted write/read, duplicate
rejection, one-second payload expiry and foreign-key/admin denial all passed.
One small synthetic index/size reservation remains until normal stale-entry cleanup;
no global delete/flush was performed. Deployment returned to zero replicas.
13 focused provisioning/policy tests passed; no runtime image rebuild was needed.

Existing root cron runs the protected database backup script daily at03:00 server
time. Its database enumeration already includes `web_intelligence`, so no script
change was needed. Initial server-local custom-format archive was created under
root-only `/var/backups/pg`, mode0600, and `pg_restore --list` succeeded. No archive
contents left the host. This is archive readability, **not a restore rehearsal**;
cluster roles and Kubernetes key recovery remain separate recovery dependencies.
Existing seven-day find-based retention was unchanged.

Evidence: workspace `docs/evidence/web-cache-backup-2026-10-27/`.
Remaining release inputs: dedicated service identities, exact pilot/source policy,
fixed endpoint settings and compatible AUTH/Workspace/SEARCH releases. Gate stays
closed; these checks do not demonstrate an enabled end-to-end agent journey.

## Cross-service identity release fix — 27 October 2026

Workspace background-owner verification now supports a separate, explicitly pinned
control-service identity as well as READ. Deploy Workspace `42459cb` or a descendant
and configure `WEB_CONTROL_AGENT_ID`; otherwise control approval checks are denied.
READ/customer proof validation is not broadened to arbitrary agents. The focused
Workspace suite passed43tests/282assertions locally; this is not deployed evidence.
See [service identity wiring](SERVICE_IDENTITIES.md) for the exact trust pins and
fixed endpoints. Provisioning these identities and the upstream release are pending.

## Internal HTTPS gateway connectivity — 27 October 2026

The optional `--gateway-cluster-ip 10.43.131.119 --runtime-bindings` render mode
adds fixed host aliases for `api.makakoo.com` and `api.2md.traylinx.com` to the
verified Kong proxy service. URLs, Host/SNI and normal certificate validation do
not change. Node-level requests through that exact service IP verified both TLS
identities and received the expected release-gate HTTP503. This is not yet a pod
network or enabled end-to-end verification.

Each READ/control pod receives only its own HTTP ingress port from Kong app pods
in namespace `kong`, plus TCP8443 egress to those same selected pods. There is no
public Internet/DNS wildcard egress, admin-port access or permission for other
namespace pods. Existing deny-all policies, separate PostgreSQL/cache rules,
zero replicas and disabled feature flags remain. Database hostname/trust aliases
are retained. Recheck the service IP/selectors and re-render after a Kong service
replacement; stale mappings fail rather than silently allowing new destinations.
Six focused renderer checks pass. This deployment-only change does not require
rebuilding the qualified application images.

## Comparison candidate publication and inactive cluster preparation

Runtime source `70d46cf0ff0e758b57610e72de1c1692f6dd788b` has now passed native AMD64
READ/control startup and MCP handshake checks and private publication:

- READ: `ghcr.io/traylinx/web-intelligence-agent@sha256:9145476b377733d982855bd68dba36093c41d71b5134c431c31015c9fffb367f`
- Control: `ghcr.io/traylinx/web-intelligence-agent@sha256:038bf1986beacd7b89b8fd9cb1b14698c9d7780b468d12ce751713a45d746157`
- MCP: `ghcr.io/traylinx/web-intelligence-agent@sha256:cc69a116f47ea298a4625833257d3bf696a07c324dd69f7b852e9ed3b2c1a30e`

Package privacy was checked before and after every push. READ/control deployment
images (including the control key-staging init container) and gateway host aliases
were updated using live resource-version/spec compare-and-set checks. Both remain
zero replicas with disabled flags. The two narrow gateway NetworkPolicies were
created; existing DB/cache policies and HTTP503 release gate remain intact.
This is inactive cluster preparation, not a running comparison service or a new
pod-level networking test. Service identities, pilot configuration, coordinated
upstream enrollment release and bounded owner-authorized journey are still required.
Evidence: workspace `docs/evidence/sentinel-enrollment-release-2026-10-27/`.
