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
readiness for enabled runtime, private registry access and secret references remain
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
