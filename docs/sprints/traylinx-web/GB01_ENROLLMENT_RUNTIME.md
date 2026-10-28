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

## Host connection installer

`node scripts/browser-connect.js` reuses the protected Sentinel credentials loader.
Host packaging supplies `TRAYLINX_BROWSER_ENROLLMENT_URL` (fixed HTTPS endpoint
ending `/api/browser/enrollment/v1`), `TRAYLINX_BROWSER_OWNER_SETUP_URL` (fixed HTTPS
`/admin/browser/connect`), `TRAYLINX_BROWSER_CONNECTION_FILE`, and existing project,
organization and Sentinel configuration. The destination parent must already be an
owner-only real directory. Existing files are never overwritten.

Installer generates the Ed25519 key locally, prints a scoped owner-setup link and
fingerprint, and waits at an ephemeral loopback callback for at most the enrollment
lifetime. Only a verified PKCE exchange for the same host/grant/project permits a
0600 connection-file write. Callback errors contain no remote body or credentials.
Restart the MCP client after installation. No website recipes are involved.

Synthetic integration exercises signed begin/exchange, human approval, real local
HTTP callback, rejected wrong state, and reload of the protected file. Live owner UI,
production service and packaging defaults still need qualification. No user host
connection was created by these tests.
