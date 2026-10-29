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

For login, the agent requests protected local credential input. Enter credentials
in that local form, not an ordinary fill action or MCP argument. Recipient consent
may be required for a newly discovered login destination. MFA, CAPTCHA, invitations
and other access prerequisites are reported, not bypassed. A remote application
without a reachable protected-input channel is not login-ready.

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
