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
