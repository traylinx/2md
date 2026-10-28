# GB01 candidate package — not deployed

The Dockerfile extends the pinned existing capture runtime. It adds only browser,
owner/enrollment transport and parent PG/Redis dependencies from the existing locked
runtime manifest. Legacy images/services are not replaced. Browser, private and
enrollment flags default OFF. No migration runs at boot.

`render.py --image ghcr.io/<org>/<package>@sha256:<digest> --node-name <verified-node>`
produces an **inert candidate**: two zero-replica deployments, separate8290/8291/8292
services, no ingress, default-deny ingress/egress and no credentials. It does not apply
anything. Proposed pilot limits: runtime1 CPU/1GiB, egress250m/192MiB. These are not
allocated or capacity-approved. Node placement, live endpoint-specific policies,
private registry access and secret references remain
release work. Do not scale this draft or set a containment marker to bypass that work.

Containment qualification must verify browser bypass attempts, parent credential
isolation, profile/process/lease disposal and explicit AUTH/PG/Valkey destinations.
Network interception tests alone do not certify container isolation. Keep the
shared legacy proxy ports and deployments unchanged.

Candidate source/archive build must exclude operator secrets and use committed files.
The traylinx-ci rootless lab runbook prohibits copying production application images;
do not transfer this base there by inference. The pinned AMD64 base is already cached
in local Docker, which can build this additive candidate without a browser/load test.

Release rollback: disable new ingress/capability and admission, close owned sessions,
scale only new deployments down, revert only changed adapter/routes if needed. Retain
browser grant schema/audit records. Never DROP the table or alter existing grants.

## Owned real-client qualification

`tests/browser/clientCandidateMcp.cjs <exact-local-image-id>` is a **test-only**
stdio entrypoint. It starts the network-isolated synthetic public fixture through
Docker, using the real runtime/worker and MCP server. It does not load production
Sentinel credentials or provide private input. Do not configure it as the product.
`clientCandidateTransport.integration.cjs` checks transport plumbing, not agentic
usability. Real clients must discover and perform the task themselves.

Keep candidate-client MCP configuration temporary and scoped to this fixture.
Client permissions and server grants are separate: a noninteractive client may
reject stateful browser tools even when the server grant is valid. Never relabel
stateful tools read-only or disable global approval controls to make a test pass.
Record an approval denial as a denied journey, not extraction success. Claude
public fixture journey has passed; Codex noninteractive approval remains unresolved.
Private-input, preview and released-service journeys remain distinct acceptance.

Candidate client follow-up: Codex 0.165.0 completed the public journey with a
required fixture MCP server and explicit per-tool `approval_mode="approve"` for
that fixture's open/act/navigate/close tools. `auto` did not preapprove those calls.
The host remained read-only; no global or production permission changes were made.
This is an acceptance harness setting, not a recommendation to preapprove arbitrary
production operations. Claude 2.1.312 also respected preview-only mode and correctly
reported unavailable private input. Successful private-client journeys remain open.

The MCP adapter now negotiates URL elicitation when clients advertise that capability.
It offers the existing protected loopback input link once per intervention, with a
bounded presentation timeout. Unsupported clients retain the link fallback. An
elicitation `accept` never grants ownership, supplies secrets or executes approval;
the protected input page remains authoritative. Protocol checks passed; real-client
credential-entry UX is not certified by those checks alone.

Private candidate bridge: add `--private` to the test-only MCP entrypoint. The
fixture owner completes real owner pairing and the protected HTTP credential form
using a synthetic account, outside model messages. The model receives only the
opaque credential reference and discovers login controls/messages itself. Actual
signed host transport, runtime, forked Chromium and session isolation are retained.
This validates agentic private browsing with pre-completed fixture-owner input;
it does not certify a real human's interactive pairing/elicitation UX or live-site
login. Never supply production credentials to this harness.

Candidate renderer now binds the disabled runtime configuration to `0.0.0.0:8292`
and includes startup/readiness checks against its existing `/health` endpoint.
Both deployments remain zero replicas and deny-all. Health proves listener/runtime
quarantine state, not successful downstream authentication, database or egress
requests. Service-link environment injection is disabled. This is not activation.

## Scoped network preparation

`python3 deploy/browser/render-network.py --database-ip <verified-tailnet-ip>`
prints separate additive access policies; it never applies them. The runtime can
reach only cluster DNS, its dedicated proxy ports, Kong TLS, and the explicit
DB/Valkey IPv4 on5432/6379. The proxy can reach cluster DNS and public IPv4 web
ports80/443, excluding non-public ranges. IPv6 remains denied by the default policy.
No proxy access to the database or shared capture lease ports is granted.

This still requires an enabled deployment's exact dependency URLs/TLS routing,
CNI enforcement and bypass qualification before activation. Existing policies are
additive: check for any broad selector granting these pods extra access. A rendered
policy or kubectl client dry-run is syntax evidence, not enforcement proof.

## Inactive runtime bindings

Add `--runtime-bindings --database-ip <verified-tailnet-ip>
--gateway-cluster-ip <verified-Kong-ClusterIP>` to `render.py` to reference the
pre-provisioned `traylinx-browser-runtime` and `traylinx-browser-proxy` Secrets,
`registry-ghcr`, and existing `traylinx-web-postgres-ca` public trust ConfigMap.
Each environment key is explicitly selected; no envFrom or secret values emitted.
The runtime Secret must supply the BROWSER_ keys listed by the renderer, including
separate reader/enrollment PostgreSQL URLs and service identity. Provisioning those
roles/credentials remains a separate controlled step; existing READ identities are
not implicitly reused. PostgreSQL URLs must preserve hostname verification and use
`sslrootcert=/postgres-tls/server.pem` with verify-full semantics. No TLS bypass.

The fixed hostname aliases retain `traylinx-db` and `api.makakoo.com` TLS identity
while routing to verified private endpoints. This does not create an ingress, run
a migration, publish an image or enable any flags. No containment qualification
marker is rendered: supply it only after actual isolation validation. The local
Docker image ID is not automatically a GHCR manifest digest; use the verified
published digest for any actual deployment.

`rehearse-network.py --execute --ssh-host <verified-cluster-host> --node <verified-node>
--image <verified-cached-digest>` is a bounded, explicit live CNI rehearsal in a
unique disposable namespace. It uses imagePullPolicy Never, synthetic TCP listeners,
three100m/96Mi caps,180s pod lifetime and UID-guarded namespace deletion. It sends no
application credentials or production database requests. Requires approved isolated
cluster testing authority and confirmed cached Node image; do not run as a generic
production health check. A failure is not permission to retry indefinitely.

## Closed browser routes

`python3 deploy/browser/render-routes.py` renders only the three browser path prefixes
on api.2md.traylinx.com, using the existing TLS reference. Its separate Kong termination
gate returns503 until a controlled release explicitly opens it. No apply, activation,
legacy ingress change, proxy port or health route is included. Dedicated browser
identity verification is implemented in Workspace68dbd4a on the published feature
branch feat/gb01-browser-service-pin, not deployed. Its optional WEB_BROWSER_AGENT_ID
pin must match the dedicated runtime service identity; READ/control pins are not
permission to share credentials. Retain the gate for rollback before
stopping the new runtime. Schema/grant records must remain intact.

## Dedicated nonce identity

`nonce-acl.py` defaults to a nonsecret inert policy summary. Its explicitly protected
output mode reads a password only from stdin and renders a hashed ACL line for
`browser-nonces-v1`: only SET on `browser-v1:nonce:*`, INFO and PING. It never
contacts a server, applies ACLs, changes global policy or generates credentials.
Never send protected output to terminal/logs. Applying it still requires guarded
configuration persistence, existing-user preservation and scoped verification.
No production ACL has been installed by this renderer.

Read-only traylinx-db inspection29October confirmed noeviction, appendonly=yes,
maxmemory=0. This is persistence configuration evidence, not capacity qualification.
Dedicated browser service8f839393-2f4f-438e-99dc-270a95f9dae3 was created through the
owner API with persisted idempotency intent and protected response. Bounded OAuth
identity check confirms active agent binding. No service credentials are in Git.
Workspace pin and browser runtime bindings are not activated yet.

Runtime preparation29October: guarded provision-nonces.py applied the dedicated
nonce ACL on traylinx-db after exact-hash preflight. Existing consumers/config and
noeviction/AOF settings preserved; no restart/data writes.13legacy+16nonce guard
tests and live scoped checks passed. Production proxy Secret and Workspace pin
ConfigMap created without deployment/activation. Runtime/database Secret, schema
and coordinated rollout remain pending. Protected passwords are never in this repo.

Database preparation29October:008 now defines separate browser NOLOGIN roles.
Migration applied only to web_intelligence; dedicated bounded LOGIN roles created,
verify-full TLS/effective permissions passed, no READ schema access in either
direction. Runtime Secret11keys created, no grants seeded. Cluster dependency path
and runtime activation still await coordinated release. Old fixture evidence using
READ roles is historical, superseded by BROWSER_DEDICATED_PG_TEST.txt.
