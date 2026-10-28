# GB01 enrollment runtime (not deployed)

Enrollment is off by default. `BROWSER_ENROLLMENT_ENABLED=1` additionally requires
`BROWSER_ENROLLMENT_POSTGRES_URL` and `BROWSER_PROJECT_ACCESS_URL`.
The writer URL must point to the same database/host/port as `BROWSER_POSTGRES_URL`,
using a different database role. Effective privileges are checked before listening:
runtime SELECT only on browser grants; writer SELECT/INSERT and UPDATE(revoked),
without other column updates, DELETE or TRUNCATE. Use the existing scoped roles
from `008_browser_grants.sql`; no role or schema changes occur on startup.

Enrollment mounts `/api/browser/enrollment/v1/{identity,begin,exchange}` and scoped
human `/api/browser/control/v1/enrollments/:id/{inspect,approve}`. Configure the
existing `BROWSER_PAIRING_ORIGIN` for the actual owner frontend. New-key possession
alone grants nothing. Approval requires the current human project owner/admin;
exchange remains key-bound and one-use PKCE. Pending enrollment is volatile.

Reader and writer pools close on shutdown/startup failure. Private browser execution
still separately requires `BROWSER_PRIVATE_ENABLED=1`. Legacy routes are unchanged.

Validation: focused browser suite 105 passed; subsequent database-target configuration
check passed 8 targeted overlapping tests. Database adapters used fixtures, not a
live privilege/migration verification. Installer flow and release qualification remain
pending. No production configuration, grants or deployment changed.
