# Network intervention implementation checkpoint

Policy now routes a private unknown recipient into the same bounded exact-decision
lane as opaque POSTs. No forwarding occurs while awaiting proof; a verified decision
adds that origin to the private session recipient set. Denied/expired/changed-phase
operations do not widen recipients. Sanitized pending context exposes origin, method,
resource type and byte count, not URL query/body. DNS/public-address checks still apply.

Policy tests verify withheld forwarding, one pending request, cancellation/phase change,
denial, and recipient reuse. This is NOT an end-to-end feature completion claim.
Runtime operation broker, host decision surface, status visibility and action deadline
suspension/resume still need composition; without a configured callback unknown
recipients continue to fail closed. Legacy capture path remains unchanged.

## Parent coordination components

`operationBroker.js` stores one sanitized pending operation per session, checks
current owner/session at request, inspection, approval and final verification,
requires exact scoped signed consent, and cancels on signal, expiry or disposal.
Only the operation digest is stored; no body, full URL or website credential.
Completed proof can be consumed once. Invalid model-style approval cannot resume.

`actionDeadline.js` is browser-only: a trusted pending wait freezes remaining active
execution budget while session cancellation and a maximum120-second wait still
apply. Resume uses the original remaining budget, never a fresh30 seconds.

OPERATION_WAIT_COMPONENTS.tap:5 focused component tests PASS. These components
are not mounted yet: session receipts, child/parent IPC pauses, signed host routes
and owner UI remain the next integration task. No live capability claim.

## Runtime/receipt integration

Session manager now returns `needs_input` for an active operation while retaining
its original action receipt and worker command. Repeated action ID returns that
receipt, not another execution. Trusted resume restores the remaining action budget;
close/revocation discard pending output. Runtime composes broker with current
consent verifier and signed host-only operation-inspect/complete/cancel routes.
Child protected IPC pauses its action deadline while awaiting the host decision.

OPERATION_RUNTIME.tap:120 checks PASS, including a signed HTTP runtime fixture
that rejects model approval, resumes once, and recovers the same successful receipt.
OPERATION_BRIDGE.tap:3 overlapping targeted checks PASS after adding child pause
coverage. No real browser intervention yet. Protected owner UI and Puppeteer wait
behavior across a long pause still require integration/qualification. Public-mode
and initial-navigation interventions remain separate outstanding coverage.
