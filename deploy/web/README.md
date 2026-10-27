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
