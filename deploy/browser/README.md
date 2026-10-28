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
