---
name: traylinx-browser
description: Use an already connected Traylinx Web Agent MCP server for dynamic public pages or authorized login-and-read tasks, including evidence-based summaries and pagination.
---

# Traylinx browser

Optional guidance for any agentic application. The MCP server's current schemas,
capabilities and instructions are authoritative. Installing this skill does not
install MCP, grant permissions or prove a deployed feature is available.

## Discover and respect the task

Call `get_browser_capabilities`. Distinguish implemented, available and permitted
operations. If tools are unavailable, report the missing integration; do not invent
results or silently switch browser providers. Host tool permission and server owner
grants are separate. Never change client permissions without authorization.

For preview requests, explain the intended scope before execution. A request to
show a plan is not permission to navigate, log in or submit credentials. Keep
session/action IDs internal unless needed to explain recovery.

## Public reading

Open a public session, observe actual controls and use their current opaque refs.
Follow task-relevant tabs, links, selects or scrolling to expose content. Extract
from the current page; use an observed semantic region when only that region is
wanted. Cite returned evidence IDs with source URLs. Keep missing prices, limits,
account details and ambiguous associations explicit.

Example request: “Read this pricing page; summarize monthly plans and limits.”
Do not infer that hidden/lazy content is absent merely because the first extraction
misses it. Do not invent information that bounded exploration cannot obtain.

## Authorized login and private reading

Check that protected input is available before opening `login_read`. If an owner
connection link is returned, present it with its host fingerprint. This is host
pairing, not a website-specific recipe.

Observe the actual form. Request protected credentials for its origin. Present the
protected input link, or use negotiated URL elicitation. Never place passwords,
cookies or raw session tokens into ordinary tool arguments or chat. Opening a link
or accepting elicitation is not owner approval: the protected surface verifies it.

Use the returned credential reference with the observed username/password/submit
refs. For email-first forms, submit username only, observe the next step and use
the same reference for the password step. Do not repeat a password attempt blindly.
`credentials_rejected` means stop, not ask for another password automatically.
`login_submitted` is not verified account identity; cite the account actually shown
and flag missing or inconsistent identity evidence.

For “summarize my latest five messages,” navigate the current authenticated session,
follow pagination if needed and preserve account, ordering, source and excerpts.
Do not send messages. A read may have site-side read-receipt effects; do not promise
that every remote GET or JavaScript action is immutable.

## Gates and recovery

- MFA, CAPTCHA or invitation warnings: report the prerequisite; do not bypass it.
- `needs_input`: present the protected link. After the owner completes the step,
  recover the original action with `browser_action_status`; do not submit twice.
- Lost reply: retain the original action ID and runtime epoch. Query status even
  when a lost `browser_open` reply did not provide a session ID.
- `outcome_unknown`: report uncertainty, never replay automatically.
- `STALE_REFERENCE`: observe again and reassess the intended target; do not guess
  a selector or silently click a similar replacement.
- Degraded/truncated extraction: report the limitation alongside evidence.

No arbitrary scripts, raw selectors, uploads or business-write workaround. Close
the session when finished or abandoned. Report access failures truthfully instead
of treating a login gate as successful account retrieval.

Account evidence: report the visible signed-in identity. Compare only with an account explicitly expected for this task, not a usual email from memory or unrelated profile. Stop before private messages on an explicit mismatch; absent identity stays unverified.
