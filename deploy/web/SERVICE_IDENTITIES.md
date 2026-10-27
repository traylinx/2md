# Service identity wiring

This is a release configuration contract, not credential provisioning or activation.
Keep customer Sentinel Passes separate from these operator-owned service identities.
No credential values belong in this document or a rendered deployment artifact.

| Identity | Credential consumer | Required trust pins |
|---|---|---|
| READ | READ runtime only | READ `WEB_READ_AGENT_ID`; Workspace `WEB_READ_AGENT_ID`; SEARCH `WEB_READ_SERVICE_AGENT_ID` |
| Control | Control runtime only | Control `WEB_CONTROL_AGENT_ID`; Workspace `WEB_CONTROL_AGENT_ID` |
| Workspace verifier | Workspace runtime only | AUTH `WEB_BACKGROUND_VERIFIER_AGENT_ID`; Workspace `WEB_SENTINEL_CLIENT_ID` and `WEB_SENTINEL_CLIENT_SECRET` belong to this identity |
| SEARCH | SEARCH runtime only | SEARCH `WEB_SEARCH_AGENT_ID`; READ `WEB_READ_SEARCH_AGENT_ID` |

Use distinct identities. In particular, do not share READ credentials with control
or use the customer's agent credential for a service. Customer proof remains
request-scoped; background reauthorization uses only its bound reference and the
Workspace verifier. AUTH does not accept READ/control as authority-query callers.

Workspace commit `42459cb` adds the optional explicit control pin to background
owner checks. Missing control pin leaves that caller denied. Legacy READ-only
configuration remains valid. Every accepted service proof still undergoes fresh
introspection and exact returned-agent binding. This does not grant human approval
rights: the approval process still checks the real human and stored plan policy.

## Fixed endpoints

- AUTH SDK base: `https://api.makakoo.com/ma-authentication-ms/v1/api`
- Workspace human project check: `https://api.makakoo.com/web/project-access`
- Workspace agent project check: `https://api.makakoo.com/web/agent-project-access`
- Workspace background owner check: `https://api.makakoo.com/web/background-project-access`
- READ dispatch target: `https://api.makakoo.com/internal/web/read`
- SEARCH grant-consumption callback: `https://api.2md.traylinx.com/web/v1/internal/dispatch-grants`

All new public routes remain release-gated. Endpoint existence is not evidence
that enabled upstream verification works. Explicit DNS/HTTPS egress and gateway
source ingress still need preparation before activation; database/cache policies
alone do not permit these calls.

## Remaining operator inputs

Provision and record the four identities through the platform's supported path;
check their active/expiry state and protected credential ownership. Configure the
same exact pilot organization/project and source-origin allowlist on READ/control,
and identical source origins on SEARCH. Browser CORS origins (`WEB_READ_ORIGINS`)
are a different setting, not a source allowlist or authorization grant.

Then release compatible AUTH, Workspace and SEARCH code through their production
workflows, verify image identity and dependencies behind the closed gate, and run
one owner-approved pilot. Do not reuse historical chat credentials, invent pilot
IDs or activate while required values are missing. No identity creation or upstream
release is claimed by this document.
