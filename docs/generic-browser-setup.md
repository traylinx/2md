## Same-session human continuation

The current adapter adds `browser_handoff`. A runtime must advertise
`humanHandoffAvailable: true` before it is used. Generic observed fields remain the
normal path for invitation codes and credentials; this handoff is for an actual
human-only challenge or a user-requested manual interaction.

1. Keep the existing `login_read` session open. Call `browser_handoff` with its
   `sessionId` and `action: "start"`.
2. Show the returned one-use loopback link to the user. The user opens it on the
   MCP host, sees the **same remote browser**, and clicks the page. Text is supplied
   through the viewer's protected field, not a screenshot or model-control tool.
3. If a new destination needs access to the private session, the viewer displays
   its origin, method and exact operation digest. The user decides whether that
   request is necessary. No hidden automatic approval or request replay.
4. The user selects **Return to agent**. Call `browser_handoff` with
   `action: "status"`; at `agent_control`, observe again and continue from the
   actual page state. Do not repeat the previous login submission.

The agent cannot operate the viewer or solve CAPTCHA on the user's behalf. Its
normal browser actions and credential operations are paused while the human owns
control. Open the launch link within three minutes. Updated runtimes provide up
to five minutes from first viewer activation, within the absolute session lifetime;
expiry closes the private session. The host maintains its heartbeat. A lost input
reply is recovered through the original receipt, not another click.

The link is a one-use bearer capability to the enrolled host, not separate identity
verification. Do not fetch, preview or share it. Pixels stay in the viewer and are
not returned through MCP or saved as artifacts. The viewer requires access to the
MCP host's loopback interface; a remote/cloud host needs its own trusted UI adapter.
Arbitrary scripts, file upload, popups, workers and unrestricted network access are
not introduced. Embedded HTTPS frames use the same per-request network policy.
There is no guarantee that every website or anti-bot system will accept this browser.

Deployed release `b565190` passed owned-fixture validation and actual installed-MCP
viewer rendering, Return to agent, fresh extraction and cleanup. Restart your MCP
connection to load the new tool. Full real-account login remains a user acceptance
step; no organization read or CAPTCHA completion is claimed by the release smoke.
See `docs/sprints/traylinx-web/RELEASE_STATUS.md` for exact release evidence.

---

# Connect any compatible agentic application

The MCP client decides what to do. Traylinx provides generic browser tools, not a
catalogue of website recipes. Initial host connection is separate from logging in
to a website. A Sentinel Pass identifies your agent; it does not contain website
passwords or replace owner permission.

## Connect your host once

Use the current browser-enabled adapter checkout. Keep your Sentinel JSON in an
owner-only file outside the repository. It contains clientId, clientSecret,
agentUserId and apiBaseUrl. Never place its values in model prompts or arguments.

Set these environment variables in the host configuration:

```sh
export TRAYLINX_CREDENTIALS_FILE="/absolute/protected/sentinel.json"
export TRAYLINX_ORGANIZATION_ID="your-organization-id"
export TRAYLINX_PROJECT_ID="your-project-id"
export TRAYLINX_BROWSER_ENROLLMENT_URL="https://api.2md.traylinx.com/api/browser/enrollment/v1"
export TRAYLINX_BROWSER_OWNER_SETUP_URL="https://traylinx.com/admin/browser/connect"
export TRAYLINX_BROWSER_CONNECTION_FILE="/absolute/protected/browser-host.json"
node scripts/browser-connect.js
```

Run from the adapter checkout. The destination directory must already be owned by
you with mode0700. The installer refuses to overwrite an existing connection file.
Open its generated Traylinx link, sign in as the project owner/admin, compare the
host fingerprint, review the requested permission and select **Connect this host**.
The loopback callback saves the connection with mode0600. Keep the installer running
until it confirms success. If the link expires, start a fresh enrollment; do not
reuse an old approval. Website credentials are not requested during this step.

Configure your MCP application to start `node /absolute/checkout/scripts/web-agent-mcp.js`.
Retain its existing READ URL and organization/project/Sentinel configuration, and
add the browser connection file and owner setup URL above. Restart that MCP server.
No vendor-specific client name or optional skill is required.

## Use the tools

Ask your agent to discover `get_browser_capabilities`. Available and permitted
operations are distinct. For a public task it opens, observes and interacts using
current references, extracts evidence, then closes the session.

## Agent-directed protected input

Check `get_browser_capabilities.inputModes` before using a feature. When it includes
`observed_fields`, the agent can request protected values for any supported observed
text input, password input, textarea, select or editable text control. There is no
site catalogue, fixed login sequence or invitation-specific tool.

1. Open `login_read` and observe the page.
2. Call `browser_credentials` with the current `observationId`, `fields` as
   `[{ref, label}]`, and an optional `submitRef`. These are references/labels, not values.
3. The user enters the requested values on the paired protected-input page.
4. Call `browser_authenticate` with the returned `credentialRef` and exactly the
   same field selection. Despite its compatibility name, this tool applies arbitrary
   protected field values. Omitting `submitRef` fills without clicking.
5. Observe the result and choose the next step. `input_applied` and `form_submitted`
   are action outcomes, not proof of successful login or account identity.

Invitation and user-supplied verification-code forms use this same mechanism.
Warnings describe the page; they do not mandate a separate integration. CAPTCHA or
an unavailable human interaction still needs user intervention, not bypassing.
Old username/password callers remain supported. If `observed_fields` is absent,
do not claim the connected runtime supports generic protected fields.

Input is bound to the selected observation, controls, session and recipient and is
consumed once. Re-observe changed controls; do not replay uncertain submissions.
Never put values in normal fill arguments, URLs or tool transcripts. A remote client
without reachable protected input is not ready for private-value entry.

Normal clicks may submit a form; button names do not determine whether an action is
safe. Follow the user's task and permissions. The transport can request a scoped
recipient/operation decision; this does not authorize unrelated purchases, sends,
uploads or account changes. Even reading may cause website-side effects.

Example task: “Use Traylinx Web Agent to read this URL and summarize it with source
evidence. Flag missing information and close the session afterward.”

The server enforces bounded sessions and current permission. This capability does
not authorize purchases, sends, uploads or account changes. Site content is untrusted.
A login submission does not prove which account is active; inspect account evidence.

## Current verified release scope

Owner enrollment and a neutral stdio MCP public read are live verified. That read
returned evidence plus explicit degraded-resource/redaction warnings. Owned native
and SPA login fixtures passed candidate qualification; arbitrary real-site success
is not guaranteed. Full released private/agentic-client acceptance remains open.
An existing connection does not automatically re-enroll after grant expiry/revocation.

## Generic-input correction release status

Generic `observed_fields` is deployed in the dedicated browser runtime (source
`8030412`, image manifest `a19633c57bc7f93dfa86b0c7051f542c979435be08dd9959d1893aeec19cadc7`).
The normal installed Codex configuration now discovers this mode. Native and SPA
access-code fixtures, protected field transport, private extraction and the existing
login regression passed. Actual installed-host public smoke also passed. The real
Traylinx invitation-to-account journey has not yet been rerun; do not call it verified.

Restart an existing MCP session to load new host tools/instructions. The generic
browser instructions take precedence; configured legacy login connections are not
a prerequisite. If the protected host requests owner pairing, complete the displayed
project-owner connection before entering website values. That is host authorization,
not a website-specific integration.

## Use values already supplied to your agent

An operator can enable **agent-supplied input** for an enrolled host. This avoids
asking you to pair a local form and retype values you already gave your agent.
It does not require a website catalogue or site-specific login connection.

- Runtime: add the enrolled host ID to `BROWSER_AGENT_INPUT_HOSTS` (comma-separated
  IDs, not domains). Existing private-browsing owner grants still apply. The
  default is empty; other hosts retain paired-owner input.
- MCP host: set `TRAYLINX_BROWSER_INPUT_MODE=agent_supplied` and restart the MCP
  connection. `get_browser_capabilities` must report `agentInputAvailable: true`.
- The agent observes the page, passes `fields` and equally ordered `values` to
  `browser_credentials`, and uses the returned reference with
  `browser_authenticate`. Invitation, account, password and verification fields
  use the same mechanism. Only missing values need an input prompt.
- A held recipient/operation decision can be inspected through `browser_respond`.
  The agent may approve an operation necessary for your authorized task using its
  exact digest, or deny it. It then polls the original action rather than clicking
  or submitting again. This is an **agent decision**, not a claim that you approved
  a separate protected form. Business writes remain outside read-intent browsing.

Values sent by a calling agent may be recorded in that application's tool history.
They are transmitted to the configured browser runtime, not kept exclusively on
this computer. The runtime holds them transiently, binds them to the selected
fields and session, and excludes them from returned evidence. Use paired-owner
input instead if you do not want values to enter the calling agent's tool context.
Neither mode bypasses website access controls or guarantees every site will work.


## Runtime recovery and current limitations

Background network traffic is not a login failure. Settling is bounded; a
`NETWORK_NOT_IDLE` warning means the page may still be loading. Observe or wait
without repeating the submitted action. A successful `form_submitted` receipt
still does not prove the website accepted the values.

A pre-input `HUMAN_REQUIRED` receipt identifies an access challenge and leaves the
session inspectable. Do not label it an infrastructure outage. For transient
`UNAVAILABLE` errors on receipt reads, the host retries that read once within the
existing deadline. It never retries clicks, credential supply or authentication.
Unexpected failures retain only allowlisted stage/error diagnostics, not page,
request, credential or exception contents.

**Full private-site acceptance remains open.** Guarded embedded frames and a
same-session human viewer are now implemented and passed owned-fixture validation.
They remain opt-in; query the connected runtime's capability flags rather than
assuming a source checkout is deployed. See the release ledger for publication and
live verification. A real CAPTCHA is completed by the user in the same remote
session. Do not imply that a different browser's state transfers here or promise
that every SSO provider and anti-bot system will accept this browser.

### Automatic verification versus interactive challenges

The runtime now distinguishes passive verification from instructions that actually
require a human. Observation, extraction and protected-input preflight wait up to
8 seconds for a pending check to finish, within the existing action/session limits.
They only re-read the page: no refresh, repeated submission, challenge solver or
provider-token manipulation. A CAPTCHA CSS class, script or badge alone is not a
reason to block a normal login form. HTTP 403/503 verification interstitials remain
inspectable; unrelated HTTP errors are not treated as successful reads.

- `VERIFICATION_PENDING`: the site has not finished. Observe again within session
  limits; do not label it invalid credentials or automatically demand human help.
- `CAPTCHA_REQUIRED`: interactive instructions were observed. Use the existing
  same-session human viewer, then observe fresh state after Return to agent.
- `VERIFICATION_FAILED`: the page explicitly reports failure. Explain the failure;
  do not retry a password or pretend the site accepted it.

A failed `browser_authenticate` receipt with either verification error occurs
**before** filling or submitting. Its session and unconsumed credential remain
available until their normal expiry. Repeating the original action ID returns the
original receipt; after confirmed recovery use fresh observed references. This does
not authorize replay of an uncertain or successful submission. After submission,
observe the resulting page; `form_submitted` still does not prove login success.
All agentic MCP clients receive these instructions, not just Codex or Claude.
A fresh `browser_credentials` selection after a confirmed pre-input verification
failure replaces the obsolete binding and wipes its old values. The caller supplies
values for the newly observed fields; no hidden transfer to another field or origin
occurs. An active or uncertain attempt cannot be replaced this way.

### Recovering internal authorization outages

`AUTHORITY_UNAVAILABLE` identifies a temporary permission-service failure or rate
limit, not rejection by the target website. The MCP client should wait briefly
and retrieve the **original action's status**, not repeat its submission or close
the session immediately. A completed operation keeps its receipt even if the
post-action permission check fails. Its result is withheld until current authority
is verified. The existing session can be retained for up to 30 seconds; confirmed
revocation still closes immediately, and normal idle/absolute limits still apply.

Repeated reference lookups are coalesced only inside the same HTTP request phase.
Post-action verification starts a new phase. Nothing caches permission across
requests or transfers it between principals. Server-side authority checks remain
mandatory; clients no longer make redundant capability-discovery round trips for
every protected field or action.

### Human handoff lifetime

The launch link must be opened within three minutes. With negotiated viewer-v2
support, the runtime starts up to five minutes of interaction on first viewer
activation, capped by the existing ten-minute absolute session lifetime. Reloading
or polling does not extend it. Older runtimes retain the three-minute total lease. The ordinary two-minute agent idle timer does not shorten an active human
lease. Keep the MCP connection running: host heartbeat loss, actual revocation or
lease expiry still closes the private session. Return to the agent before expiry.
An explicit CAPTCHA-completion message beside login or access fields is recognized
even when the provider widget lives in another frame without a captcha CSS marker.
A generic article mentioning CAPTCHA is not itself an interactive challenge.

Invitation codes and passwords remain ordinary user-supplied observed fields.
A successful `form_submitted` receipt proves the browser operation completed, not
that the website accepted the invitation or authenticated the account. Observe the
result, complete any genuine human challenge in the same viewer, then continue from
fresh references. Do not repeat a submission merely because login is not complete.

### A handoff link does not open

Keep the MCP host running and open its loopback link on that same computer before
the displayed expiry. The launch link is one-use; it does not extend the remote
session lifetime.

- **Link expired (HTTP410):** return to your agent for a fresh authorized session
  and handoff. The expired session cannot be revived. This is not evidence that
  your website password was rejected.
- **Already opened (HTTP403):** use the original viewer tab. If unavailable, ask
  the agent to check the existing session and issue a fresh link while still active.
- **Link replaced (HTTP403):** use the newest handoff link for that session.
- **Connection refused:** the local MCP host is not listening, or you opened the
  loopback link on a different computer. Reconnect the host, not the remote website.

Known expired/used/replaced links now show these explanations rather than claiming
the caller lacks permission. Unknown links and invalid host/origin requests still
fail closed. Diagnostic history is bounded and stores link digests, not passwords
or browser contents. No uncertain submission is replayed to recover a link.

### The viewer opens but stops responding

The viewer now shows its remaining time and refreshes idle frames before their
30-second input validity expires. It disables input while a request is running or
the displayed frame is stale. During normal input or refresh, the previous image
stays in place under an Updating view overlay. It cannot accept additional clicks.
The next image is decoded before replacement, avoiding a blank page and layout
jumps. A transport failure or revoked/expired session still clears the image.

If a response is lost, the viewer waits at most ten seconds, then checks the
original action receipt. It does **not** repeat your click, typing or submission.
Read-only recovery is bounded to five automatic attempts. If recovery pauses, use
**Refresh view / recover status**; the original error remains visible. If a request
needs your decision, the viewer presents **Allow this request** and **Deny**.

When the countdown expires or the runtime reports `SESSION_LOST`, the viewer
clears its image and text and disables all input. That link cannot be revived.
Return to your agent for a fresh session. After completing an active handoff,
choose **Return to agent**, then tell your agent to continue from a fresh observation.

The timing/transport correction requires the updated **local MCP host and remote
browser image**. The host negotiates support; older runtimes keep the legacy flow.
When `humanInteractionAvailable` is negotiated, each normal click/type/scroll
returns its original receipt and updated image together; no second view request
is needed. A lost response is recovered through status/view only, never a fallback
input submission. Status and a ready image also share one authorized round trip.
Human consent and in-flight operations may still require further status reads. While the user reviews a
held request, only the remaining execution time of that human action is preserved;
request budgets, explicit recipient consent and session expiry remain enforced.
After updating the source installation, reconnect MCP or restart the calling
application. An already running MCP process or open viewer retains its old code.
Do not reuse an expired link to test the update.
