# Legacy Kubernetes release

Production pushes build an immutable AMD64 candidate on GitHub-hosted runners.
They **do not deploy automatically**. The former DigitalOcean SSH/Compose
workflow targeted a retired host and must not be restored. This public repository
must never use a private self-hosted runner or receive cluster credentials.

The candidate extends the exact qualified legacy image. The dependency-lock
check intentionally fails if dependencies change: qualify a new base explicitly,
not bypass the guard. The mutable `latest` tag is not updated.

## Promotion

1. Verify the image build succeeded for the intended production commit and record
   its immutable digest. Retain the previous deployment/image for rollback.
2. Confirm context `strato-prod`, namespace `production`, deployment `html2md`.
   Verify queues are idle and protect job/cache data before pod replacement.
   Never replace an `emptyDir` pod without preserving its contents first.
3. Promote the digest for both `api` and `worker` in one guarded deployment
   update. Keep current Secrets, resource limits and commands. Do not touch
   `html2md-capture` or `html2md-capture-egress`.
4. Wait for rollout readiness. Verify both image IDs, source hashes, API health
   and worker startup. A green build is not a deployment.
5. Force-refresh only the reported URL once, then request it normally and verify
   complete content on a cache hit. No cache-wide purge or load test.
6. On failure restore the previous digest for both containers, preserving the
   job volume. Keep private infrastructure/user data outside Git.

October 26 source/runtime verification is tracked in
`docs/sprints/traylinx-web/RELEASE_STATUS.md`. Capture/Sentinel release is separate.

## Current job storage

Since the October 26 release, legacy jobs/cache use the `html2md-jobs` PVC
(`local-path`, 1 GiB requested) instead of pod-lifetime `emptyDir`. Preserve that
claim during promotions and rollbacks. It is node-local, not replicated storage
or a backup, and local-path does not enforce a hard 1 GiB filesystem quota.
