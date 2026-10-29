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

**Private-site readiness remains incomplete.** Cross-origin embedded frames are
currently unsupported, and the remote browser has no same-session human takeover.
These limitations affect CAPTCHA and some SSO/login flows. Entering an invitation
code dynamically does not solve them. Do not tell users to complete a challenge
in a different browser and imply its state transfers to this isolated session.
No site-specific recipe or automatic challenge bypass is planned as a substitute
for guarded frame support and a real human handoff.
