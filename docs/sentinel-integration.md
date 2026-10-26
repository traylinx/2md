# Sentinel Pass integration

## Current release

**26 October 2026:** the durable AUTH/USERS/worker release is deployed. The
Sentinel-enabled html2md capture image is deployed for the explicitly granted
search-agent identity. Thirteen bounded agent ingress checks and three human AUTH/USERS/capture checks
passed. Twelve events for the supplied identities in the smoke interval were
projected/finalized; pending reservation counters returned to zero. Evidence:
workspace `docs/evidence/sentinel-consumer-release-2026-10-26/`.
The legacy converter and its consumers are unchanged.

This is an implementation-first release, not a throughput certification.
Capacity, fairness, long-running soak and scaling qualification remain follow-up
work. Outbound integration delivery remains held; durable activity projection is
running. No AWS SNS/SQS resource is required for this release.

## Install the exact SDK

Use Node.js 22 or newer for this integration. The receiver uses
`traylinx-auth-client@1.1.0-rc.1`. That JavaScript release is **not published to npm**;
do not substitute the older stable version. Use the reviewed archive and lockfile
in `deploy/capture/sentinel-sdk/`:

```bash
shasum -a 256 deploy/capture/sentinel-sdk/traylinx-auth-client-1.1.0-rc.1.tgz
npm ci --prefix deploy/capture/sentinel-sdk --ignore-scripts --no-audit --no-fund
```

Expected archive SHA-256:
`2713a86810f13e5badfd6710f39e17065bad004120ee1c450d55c3d91fba026e`.
The capture image already contains the exact SDK in its separate dependency tree.
There is no root dependency upgrade and no installation step inside a running pod.
The embedded RC README is historical; use this guide for publication status.

## Create two Sentinel Pass identities

In Traylinx, open **Project → API Access → Sentinel Passes → Create Sentinel Pass**.
Create one identity for the receiving **html2md verifier** and a separate identity
for the **calling agent**. Check that each OAuth application belongs to its intended
active agent. A valid UUID alone does not prove credential ownership.

Store each returned client ID, client secret, agent UUID and API base URL in the
appropriate secret manager. The receiver's credentials are not the caller's proof,
and neither is a website login credential.

Creating a Sentinel Pass does **not** automatically grant capture access.
Operators grant explicit capture operations and origins separately. The deployed
search-agent grant currently allows public and authenticated capture only on
`https://api.2md.traylinx.com`, the owned smoke-test origin. It is not an unrestricted
web-search grant. Approve target origins before testing additional websites.

## Configure the receiver

These settings extend the existing [capture deployment](../deploy/capture/README.md).
Existing human-token authentication and human grants stay unchanged.

| Setting | Value or purpose |
|---|---|
| `HTML2MD_SENTINEL_AGENTS` | `1` to opt in; otherwise disabled |
| `CAPTURE_SENTINEL_URL` | Trusted Sentinel base URL, normally `https://sentinel.traylinx.com` |
| `CAPTURE_SENTINEL_CLIENT_ID` | Dedicated verifier OAuth client ID |
| `CAPTURE_SENTINEL_CLIENT_SECRET` | Dedicated verifier secret, Kubernetes Secret reference |
| `CAPTURE_SENTINEL_VERIFIER_ID` | Dedicated verifier agent UUID |
| `CAPTURE_AGENT_GRANTS_FILE` | Startup-loaded JSON mapping agent UUIDs to grants |

Only the capture API container receives verifier credentials. Do not inject them
into the TLS frontend, egress proxy, browser environment, logs or request body.
The browser and API still share a container boundary; this is not protection
against native browser/container compromise.

Example grant, using a synthetic UUID:

```json
{
  "12345678-1234-1234-1234-123456789abc": {
    "operations": ["capture:public"],
    "origins": ["https://example.com"]
  }
}
```

Add `capture:authenticated` only for an approved website-login use case. Missing
grants deny access. Do not inherit the owning human's permissions automatically.
Grants are snapshotted at startup: drain/restart capture after a grant change.
Editing a ConfigMap alone does not revoke already-running work.

The default renderer leaves agents disabled and creates no credentials. Update
an existing deployment through a drift-checked patch, not the first-time promoter.
Keep the immutable image digest, previous deployment spec and grant data for
rollback. The deployed candidate is in a **private** package:
`ghcr.io/makakoo/sentinel-html2md-runtime`. It uses the existing `registry-ghcr`
image-pull Secret; no new registry credential is required.

## Call capture

Keep the [capture request and response contract](capture-api.md) unchanged:

- `POST https://api.2md.traylinx.com/api/capture/v1`
- `POST https://api.2md.traylinx.com/api/capture/v1/authenticated`

Use `getAgentRequestHeaders()` from the SDK, or send exactly one proof format:

- `X-Agent-Secret-Token: <pass>` with `X-Agent-User-Id: <caller-uuid>`; or
- `Authorization: Bearer <pass>` with `X-Agent-User-Id: <caller-uuid>`.

Do not use `getRequestHeaders()` for this call: it supplies a Sentinel OAuth access
token, not the required agent proof. Never combine human and agent authentication.
An agent marker always selects agent verification, including malformed markers;
failed proof never falls back to a human token.

For authenticated website capture, provide the separate request-scoped website
credentials and declarative login instructions in the documented body. No saved
website session, arbitrary script, MFA bypass or reusable password vault exists.

## Verification, performance and errors

The receiver verifies current caller proof before reading the body and again
before releasing content. Both checks apply explicit grants. It caches **no**
positive caller authorization, proof or result. Revoked proof is checked live.

The receiver reuses the verifier's OAuth access token in memory, with one bounded
shared refresh per identity/generation. Each request retains its own deadline,
cancellation and live introspection. A cold process exchanges once; successful
captures do not exchange twice anymore. Safe introspection gets at most one
refresh/retry after HTTP 401. Credential issuance is never automatically replayed.

Default limits are eight active verifications and a three-second proof-check
budget. Internal token lifecycle bounds are 16 identities, 128 refresh waiters
and 128 handles per identity. These are bounds, not a capacity claim. Credentials
and tokens stay in memory; JavaScript garbage collection is not memory zeroization.

The backend now enforces shared Valkey limits and commits required audit receipts
in PostgreSQL. PostgreSQL is the durable work store; Valkey is not the durable
queue. Current backend quota remains bounded, so pace consumer checks. Two live
proof checks consume two introspections per successful capture. Do not bypass
quotas or claim millions of requests per day are qualified.

| Capture status | Meaning |
|---|---|
| 401 | Invalid, missing, mixed, expired/revoked proof; disabled caller or agent feature |
| 403 | Verified caller lacks an operation or origin grant |
| 429 | Capture admission/concurrency limit |
| 503 | Verifier/backend/TLS failure, timeout or upstream quota refusal; no content |
| 504 | Capture deadline exhausted |
| 499 | Caller cancellation, when a response can still be sent |

Upstream Sentinel itself may return 429 with `Retry-After`; the current capture
adapter fails closed with 503 rather than transparently forwarding that upstream
status. Do not assume a 503 is safe to replay. Raw duplicate auth headers are
rejected; production ingress checks verify that behavior through Kong.

## Deployment and maintenance boundaries

The additive capture deployment changes independently of the legacy `html2md`
Deployment. Never restart the legacy job worker merely to enable Sentinel.
Rollback restores only the previous capture specification and agent grant data.
Do not delete accepted Sentinel receipts, replay uncertain external effects,
release held outbound delivery or unsuspend activity jobs as part of consumer
rollback. Those are separate operator decisions.

Current evidence and next action live in the workspace
`docs/sprints/CURRENT_STATUS.md`. Historical qualification and the old rollout
hold remain preserved; the 26 October owner GO supersedes that hold only for the
bounded implementation-first consumer release. Public npm/docs-site publication
is separate from deployed private-image state.
