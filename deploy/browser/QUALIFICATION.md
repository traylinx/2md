# Candidate qualification — release blocked, not deployed

Candidate source c38484742e81f280bd391ff4d49665be1c190fee.
Image sha256:0ad2ed2a5ae078d50f8fd559e979158ee56a899e699a5af10545316b7f3fb471.

Passed bounded checks:
- Real PostgreSQL16 migration008 and effective reader/control roles, no grant-body
  rewrite/delete/truncate, revocation visibility, no public schema access; fixture
  transaction rolled back, container removed. No production connection.
- Exact-image actual forked Chromium private journey, signed completion/consent,
  private IPC, one login, idempotent recovery, region extraction/redaction and cleanup.
  Network-none owned fixture with test-only certificate wrapper/public-IP hosts entry,
  1CPU/1GiB/256PID limit; fixture/container removed. No real website credentials.

**Observed release defect:** although child environment is sanitized, same-UID child
can read parent `/proc/<ppid>/environ` inside the current container. Synthetic-only
probe returned workerHasParentSecretInEnv=false,parentEnvironmentReadable=true.
No real token was read/exported. This violates intended parent credential isolation
if the browser/worker is compromised. Do not enable/publish this candidate as ready.
Fix process isolation and rerun this targeted probe plus affected worker cleanup.
Do not merely redact the diagnostic or assert that a minimal child environment fixes
Linux process visibility. Default-deny network policies do not fix this boundary.

Evidence lives in workspace docs/evidence/gb01-implementation-2026-10-28:
GRANT_MIGRATION_PG.txt, EXACT_IMAGE_PRIVATE_WORKER.txt,
CANDIDATE_PROCESS_ISOLATION.txt. Container-isolation fix remains actionable work;
this is not a request to pause or abandon the sprint.
