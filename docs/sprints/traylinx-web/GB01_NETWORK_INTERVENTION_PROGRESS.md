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
