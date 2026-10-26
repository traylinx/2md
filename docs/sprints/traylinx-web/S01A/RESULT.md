# S01A internal implementation result — 26 October 2026

Implemented strict product contracts, non-provisioning Workspace authorization
client, confirmed-plan binding and an internal controller. Search now has the
corresponding confirmed-execution consumer. No public product route is mounted.

## Focused evidence

- READ: 18 Node tests passed (contracts, authorization client, controller).
- SEARCH: 5 consumer tests, 3 cross-checkout integration tests and 27 unchanged
  Sentinel adapter tests passed. Targeted strict TypeScript passed.
- WORKSPACE: 9 resolver, 3 direct-controller harness and 3 transport unit tests
  passed, with 95 assertions. These used local Ruby 4.0.5, not the application's
  pinned Ruby 3.2.2. Rails/database execution was not performed.
- All network/identity/admission responses were synthetic. No live capture,
  provider charge, deployment, membership update or credential change.

The cross-component harness connects real READ controller/client code to the
real Search consumer and existing Sentinel adapter. Only external HTTP and the
admission store are fixtures. Successful capture, foreign-tenant refusal and
post-capture membership revocation were exercised. This is not durable-run or
production-transport qualification.

One controller harness initially failed because installed Minitest 6 does not
provide `stub`/`minitest/mock`. The fixture now uses a narrowly restored test-local
constructor replacement; no application guard was weakened or gem installed.

## Remaining

- Targeted Rails/database integration under the deployment Ruby/dependency
  runtime, including actual default-project/inherited-role fixtures and route
  behavior. Current unit tests verify delegation, not the real DB membership matrix.
- S02 durable immutable plan/confirmation/run linkage, atomic admission and
  consumption, production execution transport/delegation, restart/cancel recovery.
- Operator configuration and separate release approval before activation.

Task 02 and task 05 therefore retain framework-integration acceptance gaps; this
is not full S01/AG02 completion. Existing APIs and grants are unchanged. Test-only
admission providers remain outside application composition.

Next development: implement S02 durable admission against the existing READ-owned
workflow boundary. Complete the targeted Workspace framework check before any
activation; no load/soak cycle is required for this internal code increment.
