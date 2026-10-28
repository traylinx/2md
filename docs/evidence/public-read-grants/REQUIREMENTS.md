# MCP public-read usability correction

Status: implemented, published and deployed; bounded live MCP journey passed. Final conversational user acceptance pending.
Date: 28 October 2026. Product requirements supplement, not a replacement for the
canonical Web Intelligence product specification or a monetization authorization.

## User experience

Connect a Sentinel pass to the selected project once. An authenticated owner grants
bounded public reading once, with visible limits and revocation. Thereafter the
host prepares and runs reads within those limits without a separate human task
for every plan. When the user explicitly asks to preview first, the host shows
the task and waits for the user's response; that response controls the workflow,
not creation of a new server privilege. Ordinary direct read requests do not
require a redundant confirmation.

The host manages plan/run identifiers, bounded status polling, transient result
retrieval, source citations and explicit unknowns. Credentials, shell commands
and confirmation IDs are not normal user workflow. Do not claim arbitrary browser
interaction, unsupported sites, private login, purchases or wallet spending.

## Implementation contract

1. Persist an explicit public-read grant owned by the authenticated project owner.
   Bind the exact agent, workspace user, organization and project; constrain
   origins, URL count, deadline, bytes, policy version and expiry. Record real
   grantor/provenance and revocation. Reuse existing verified identity resolution.
2. Add admission under that grant, retaining immutable plans, transactional
   outbox and stable retry identity. Do not manufacture an existing per-plan
   confirmation with a fictional `approved_by`. If reusing the confirmation
   table, explicitly distinguish standing delegation from per-plan approval and
   prevent the old admission path from bypassing delegation checks.
3. Serialize admission against revocation and revalidate before dispatch alongside
   existing fresh project/pass checks. Keep already-admitted run recovery distinct
   from permission to create a new execution. No claims that revocation can undo
   a capture already dispatched.
4. Expose server-verified authorization availability through the client. Add a
   plan execution tool requiring no user-managed confirmation ID when the current
   grant covers it. Preserve manual approval for existing callers; no silent
   endpoint or legacy contract replacement.
5. Update host discovery/instructions from actual behavior, not a local assumed
   grant. A client must never claim standing authorization merely because a pass
   exists. The current local discovery explicitly reports unsupported.

Do not add an automatic-approval boolean, ask the model to authenticate a human,
put owner credentials in MCP, or solve this by making the owner CLI model-callable.
Do not expand target/network policy or implement monetization as part of this fix.

## Focused acceptance

- One-time real owner setup, followed by an actual registered MCP host read with
  no per-task owner terminal or confirmation ID handoff.
- Preview request makes no admission before the user's go; ordinary authorized
  public-read request proceeds without redundant permission questions.
- Wrong agent/project/origin, expired/revoked grant and lost membership fail closed.
- Concurrent revoke/admit is ordered; pre-dispatch revocation stops undispatched
  work. Existing SSRF, deadlines, response limits and transient retention remain.
- Lost admission response and repeated tool call recover one durable execution,
  not two captures. An uncertain outcome does not trigger a new plan.
- Completed/partial/degraded/missing/expired states produce honest evidence-backed
  answers. Source text cannot grant permissions or change the user's task.
- Existing independently approved clients continue working unchanged.

Local host ergonomics evidence: 19 focused tests passed via
`node --test --test-concurrency=2 tests/web/hostGuide.test.cjs tests/web/headlessAgent.test.cjs tests/web/mcpServer.test.cjs tests/web/approvalHandoff.test.cjs`.
This is not a live journey or backend authorization result.

Release evidence: `docs/evidence/web-public-read-grants-2026-10-28/RELEASE_SUMMARY.md`. One-time owner control UI remains separate future product work.
