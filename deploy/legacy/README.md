# Automatic legacy Kubernetes release

A runtime change pushed to `production` builds an immutable AMD64 image, then
**automatically deploys API and worker to Kubernetes**. Documentation-only commits
are excluded. Normal releases require no manual kubectl step.

## Release path

1. GitHub-hosted runner validates the dependency lock and focused tests, then
   publishes `ghcr.io/traylinx/2md:legacy-<full-commit>` with its source label.
2. The fixed-purpose `production/html2md-auto-deploy` CronJob checks production
   every two minutes. It reads only public GitHub/registry metadata, requires a
   successful matching build job, resolves and verifies the immutable manifest
   and source labels, and rechecks that the branch has not advanced.
3. Its dedicated Kubernetes identity can only get/patch the named `html2md`
   deployment. It cannot read Secrets, exec into pods or change other services.
   The controller code changes only both container images and its annotations,
   with resourceVersion/full-spec drift guards. PVC, commands, Secrets and limits
   are preserved. CronJob concurrency is forbidden.
4. After exact-image rollout readiness and versioned HTTP health succeed, it
   writes a tiny non-secret release proof to the dedicated PVC subdirectory.
   GitHub waits for both the baked source revision and that controller proof.
   A green **whole workflow** therefore means live deployment was verified, not
   merely that an image was built.
5. On rollout/health failure, it restores the previous immutable image only if
   the candidate is still current. The failed revision is held against automatic
   replay; fix forward with a new commit, or investigate before clearing the hold.

No private self-hosted GitHub runner, Tailscale policy change, registry write
credential, personal kubeconfig or production Secret is needed in GitHub. The
controller uses a short-lived projected Kubernetes service-account token.
Existing tailnet policy was found to allow all connections; this pull design
avoids granting that access to a public-repository CI runner.

## Runtime and storage boundaries

- The candidate extends the exact qualified legacy runtime. Dependency-lock
  changes deliberately fail until a new base is qualified. No browser upgrade
  is hidden inside an application release. The mutable `latest` tag is unused.
- The existing Recreate strategy remains: releases briefly interrupt service.
  This is not zero-downtime deployment or an in-flight-request loss guarantee.
- Existing jobs/cache remain on `html2md-jobs`, node-local `local-path` storage
  with 1 GiB requested. This is not replication, backup or a hard filesystem quota.
- The controller mounts only `.deployment`, not user job directories. Its public
  release proof contains a commit and image digest, never job content or secrets.
- `/api/health` retains its response body; additive `X-2md-Revision` and
  `X-2md-Deployment: verified` headers identify and confirm the release.
- Sentinel capture/egress, AUTH, USERS, grants and credentials are untouched.

## Initial installation and controller maintenance

Render with `python3 deploy/legacy/render-controller.py`. Inspect/dry-run the
manifest, then apply through the authorized operator context `strato-prod`.
The existing job PVC must already contain the `.deployment` directory, owned by
UID/GID 1000 and mode 0755. Do not overwrite a pre-existing nonempty directory.
No new disk/server is provisioned by this controller manifest.

Controller code is an immutable, content-named ConfigMap. Changing its policy or
RBAC requires a reviewed operator apply; it never executes code fetched from Git.
Suspend `cronjob/html2md-auto-deploy` before manual recovery, wait for its active
job to finish, and preserve the PVC. Inspect logs and these deployment annotations:
`html2md.traylinx.com/deployed-revision`, `pending-revision`, `failed-revision`,
`rollback-image`, and `build-run`. Do not clear a failed hold without diagnosis.

Initial rollout evidence is recorded separately in the workspace under
`docs/evidence/html2md-autodeploy-implementation-2026-10-26/`. This runbook describes
behavior; it is not itself proof that every failure path was exercised live.

## Verified activation

A production push of `cb79008a8875b9383184b00e215361eea7eff7eb` completed
[workflow 40352503116](https://github.com/traylinx/2md/actions/runs/40352503116):
build plus live-deployment verification both succeeded. The controller promoted
API and worker without a manual image update; both became ready with zero restarts.
The current source hash matches the immutable controller ConfigMap. Fifteen focused
checks, 31 compatibility checks and six RBAC checks passed. Automatic rollback is
implemented but was not deliberately exercised against production.
