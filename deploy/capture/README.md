# Isolated html2md capture deployment

This is an additional runtime for the existing html2md repository, not a new
product service or a replacement for `/api/convert`. It extends the exact running
production image with capture-only files. The old API and queue worker need not
restart. A narrowly scoped ingress routes the new capture paths to this runtime.

## Required isolation

- Capture: non-root, read-only filesystem, all Linux capabilities dropped,
  no privilege escalation, runtime-default seccomp, 1 CPU / 1 GiB browser/API limit.
  A separate TLS frontend adds 100m CPU / 128 MiB; egress adds 250m / 192 MiB.
- `/tmp` is memory-backed, 128 MiB maximum. Node swap must be disabled; core
  dumps are disabled by the entrypoint. No website passwords are configured in
  persistent volumes, environment or logs. The platform lease token is an env
  secret; TLS key is mounted only in the separate frontend container.
- A separate egress proxy resolves every connection and connects to that exact
  checked public IP. Every operation receives a fresh bounded proxy lease.
- Capture has no general internet egress. Allow only the proxy, cluster DNS and
  the exact identity-verification endpoint. Qualify network policy with real
  denied-connect tests before ingress promotion.
- Proxy allows public TCP 80/443 and DNS only. Private/reserved ranges are denied
  both by its resolver and network policy. No website credentials enter its
  control API; authenticated page traffic stays inside a TLS CONNECT tunnel.
- Chromium uses a fresh context/profile and a process group per operation.
  It runs without Chromium's internal sandbox inside the above container boundary;
  do not claim a browser sandbox. Native browser compromise can threaten other
  workers/API in this container without a kernel exploit. TLS-key isolation is
  a separate container boundary, not universal credential isolation.

## Server configuration

For the deployed, explicitly granted Sentinel-agent extension, see the
[installation, verifier configuration and grant guide](../../docs/sentinel-integration.md).
The renderer keeps agent support off by default; it does not provision a verifier
identity or secret. The approved SDK is installed in an isolated dependency tree. Capture images are
published privately under `ghcr.io/makakoo/sentinel-html2md-runtime`; use the existing
`registry-ghcr` image-pull Secret. Do not publish to the public legacy `traylinx/2md`
package or restart the legacy deployment for this extension.

- `HTML2MD_ENHANCED_CAPTURE=1` enables public capture.
- `HTML2MD_AUTHENTICATED_CAPTURE=1` enables request-scoped form login.
- `CAPTURE_CONTAINMENT=isolated-proxy-v1` is an operator attestation after actual
  isolation tests, not a bypass a caller can supply.
- `CAPTURE_AUTH_URL=https://sentinel.traylinx.com/oauth/token/info` uses the
  existing verified user-token contract. No user id is trusted from headers.
- `CAPTURE_GRANTS_FILE` maps verified AUTH user ids to `operations`, `origins`,
  and optional origin restrictions. Missing grants deny access. Authorized accounts may have `"*"` origins; runtime target restrictions still apply. This is an operator allowlist, not the full future WORKSPACE
  authorization product. Explicitly granted active AUTH agent IDs are supported
  too. Grants load at startup: revoke admission and restart capture to apply a
  changed grant; editing the ConfigMap alone is not immediate revocation.
- Login instructions arrive in the authenticated request's `login` object. There
  is no server-side website catalogue or saved strategy. Agent-provided fields,
  one submission path, read/resource paths and account proof are validated and
  frozen for this operation only. No caller JavaScript is executed.
- `CAPTURE_PROXY_CONTROL_URL` and `CAPTURE_PROXY_TOKEN` address/authenticate the
  internal proxy lease service. These are platform credentials, not site passwords.

## Credential custody and limitations

Only `inlineOnce` username/password form POST is supported. No saved connection,
cookie import, SSO, OAuth, MFA completion or automatic credential retries.
Private overload rejects before reading the request body; it never queues secrets.
One request-scoped login POST is allowed, then GET/HEAD within the request scope.
Cross-origin resources, service workers, popups, frames, sockets, downloads and
other POST/PUT/PATCH/DELETE requests are denied. The caller must select an actual
login endpoint and read-only targets: HTTP methods cannot prove business semantics
(including side effects in GET). The current form mode requires full-page navigation.

Temporary browser files may contain session data on the memory-backed volume.
Cleanup is required before content release. Dropping JavaScript references is
not guaranteed memory zeroization. The design does not protect against a
compromised host, malicious target, or a trusted operator reading RAM.

## Release status

Deployed and activated on 22 October 2026 for Sebastian's approved Traylinx user.
See `docs/sprints/traylinx-web/RELEASE_STATUS.md` and workspace machine-readable
evidence for exact image, tests and residuals. Legacy runtime remains untouched.

## TLS and rollback

The browser/API binds HTTP only on pod loopback `127.0.0.1:8271`. The separate
frontend owns verified HTTPS on 8270; Kong routes only the two new exact paths.
KIC 3.3 uses the route-scoped `verify-upstream.lua` plugin and the narrowly
approved Kong trust-store module. Wrong hostname and untrusted CA fail closed.
No global upstream-verification behavior was changed for existing services.

Rollback: remove `html2md-capture-ingress` first, stop capture admission by scaling
only `html2md-capture` to zero, allow up to 70 seconds for drain, verify lease
closure, then remove only new resources if appropriate. Removing the ingress
restores legacy not-found bytes. Do not restart the old `html2md` Deployment:
its job storage is ephemeral. Restore using the retained exact image manifest.

## Automatic production image delivery

Production pushes build a separate **private** `ghcr.io/traylinx/2md-capture`
image. This does not put the capture runtime into the public legacy image.
The build job requires an existing private package before uploading and checks visibility again before becoming eligible for promotion. A missing or public package blocks publication; do not rely on registry defaults.
Existing `registry-ghcr` read access must cover the private package.

`render-release-controller.py` renders a small in-cluster pull controller with
get/patch access only to `html2md-capture` and `html2md-capture-egress`. It reads
public GitHub build results and authenticates private registry metadata reads
using the existing mounted pull Secret. GitHub receives no cluster or tailnet
credentials. The reviewed controller is an immutable ConfigMap, not fetched
executable source. Controller changes require an explicit operator apply.

The controller checks exact production source labels/digests and a successful
capture build, then patches only images and owned release annotations. Egress
updates first; capture follows. Existing Recreate strategy means brief capture
unavailability during these image changes. Runtime configuration, credentials,
permissions, network policies and stored jobs are preserved. On failure it
attempts guarded rollback and holds that failed revision rather than repeatedly
redeploying it. Drift or interrupted finalization may require operator recovery.

Both deployments must be ready before the group writes
`.deployment/capture-verified.json`. Legacy `/api/health` exposes its source SHA
as `X-2md-Capture-Revision` without changing its response body. This is a release
checkpoint, not continuous capture health monitoring. The GitHub verification job
requires both the legacy and capture revision to match the pushed commit.

Initial installation also adds `registry-ghcr` to egress imagePullSecrets (if
absent). Dependencies/schema/runtime policy changes remain deliberate review
work, not an instruction to change infrastructure. No load tests, paid provider
calls or new Sentinel grants are part of this release process.
