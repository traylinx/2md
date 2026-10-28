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


## Guarded candidate follow-up

Candidate `sha256:1ccfb66e5c598971455dd0a4d6ed440cb2b5a6a268f320d4f47b2f4f51eaf6f1`,
source `e2ab98f`, fixes the observed environment exposure with a non-dumpable
launcher/runtime and fail-closed kernel-visible startup verification. Probe under
nonroot/cap-drop-all found both same-UID ancestors unreadable. Worker environment
has no synthetic parent marker. This proves that observed defect fixed, not all
possible process-containment properties.

`PROCESS_GUARD_IMAGE.txt`, `GUARDED_PRIVATE_WORKER.txt` and
`PRIVATE_MESSAGE_FIDELITY.txt` pass. Actual forked Chromium, signed private input,
one login, cookie-bound two-page inbox, five ordered synthetic messages, account
and source evidence, no hidden message/password disclosure, no duplicate action,
profile/proxy cleanup. Owned HTTPS fixture has test-only TLS bypass; network none,
read-only filesystem, no capabilities, 1 CPU/1 GiB/256 PIDs. No real credentials.

Reproduce with `python3 tests/browser/runCandidatePrivate.py <exact-local-image-id>`.
Test files mounted read-only; runtime bytes remain the exact image. This scripted
journey is not a held-out independent layout or a real agentic-client acceptance.
Remaining client, network/containment, compatibility and release gates still apply.
No GB01 image published or deployed.

### Worker-exit follow-up 97f630d

Exact candidate77ab84ddcd0a002a3685abb6b517ddef7c294eac134daeac225bb1c1738bb94e passes SIGKILL-after-login cleanup before the next client command: no live owned Chromium group, residual profile/proxy, duplicate login or retained private receipt. WORKER_EXIT_IMAGE_CRASH.txt and WORKER_EXIT_IMAGE_NORMAL.txt pass;27 affected lifecycle checks pass. An idle-exit resource leak was reproduced then fixed by immediate idempotent disposal. No production deployment. This is worker-crash proof, not parent/container-loss, full network containment or wholeA10 certification.
