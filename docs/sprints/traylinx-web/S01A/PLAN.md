# S01A: verified Search-to-Read boundary

Implement an internal product controller, not a replacement for existing APIs.

1. Strict immutable principal, public-read plan and admission contracts.
2. Fixed-endpoint client for the non-provisioning Workspace permission resolver.
3. Exact confirmed target/project/creator/policy/expiry binding.
4. Controller checks authority before capture and before returning content;
   Search consumes only execution references resolved by a trusted authority.
5. Synthetic tenant, cancellation, refusal and cross-component tests.
6. Documentation and separate implementation/test/release checkpoints.

The controller has no production registration or default admission store. Durable
confirmation/admission, worker recovery and authenticated execution transport are
S02 work. In-memory authority exists only in tests. No public run endpoint is
enabled, and no existing authentication contract or capture grant changes.

The product controller owns the plan digest. The Search capture adapter's manifest
hash remains a separate transport fingerprint. A valid service Sentinel pass does
not authorize customer project access or confirm a plan.
