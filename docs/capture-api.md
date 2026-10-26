# Additive capture API

The existing conversion API is unchanged. These new endpoints are separate:

- `POST https://api.2md.traylinx.com/api/capture/v1`
- `POST https://api.2md.traylinx.com/api/capture/v1/authenticated`

**Activation:** deployed on 22 October 2026 and enabled for Sebastian's approved
existing Traylinx user. Other callers require a real Traylinx AUTH user/active-agent
token and an explicit capture grant. A valid platform token alone is not a grant. No anonymous capture access.

The deployed ordinary-user path uses `Content-Type: application/json` and
`Authorization: Bearer <platform-access-token>`. This token identifies the caller;
it is never sent to the destination website. Responses use `Cache-Control: no-store`.
Plain HTTP is refused with 426 rather than redirecting a credential-bearing body.

**Sentinel agent release (26 October):** the opt-in SDK adapter is deployed
for the explicitly granted search-agent identity. It accepts a runtime Sentinel
pass plus agent UUID, with separate capture grants and no user-token fallback.
See [Sentinel setup and test guide](sentinel-integration.md). Creating a pass in
Traylinx alone does not enable agent access to these routes.

## Public rendered capture

```json
{"url":"https://example.com/article","budgetMs":20000}
```

Only `url` and optional `budgetMs` are accepted. Body limit: 16 KiB. Budget:
1–30 seconds, default 20 seconds. No website credentials, cookies or arbitrary
headers. Public HTTP/HTTPS targets must pass URL, public-IP and DNS checks.

## Request-scoped authenticated capture

The agent supplies the target and declarative login instructions for this request.
There is no website registry or saved login recipe. The calling application should
inject credentials at execution time, not place them in the model's prompt/history.

```json
{
  "url":"https://example.com/report",
  "loginUrl":"https://example.com/login",
  "login":{
    "submitPath":"/login",
    "readPaths":["/report"],
    "resourcePaths":["/assets/login.js","/assets/app.css"],
    "fields":{
      "form":"#login",
      "username":"#user",
      "password":"#pass",
      "submit":"#submit"
    },
    "proof":{"selector":"#account","attribute":"data-user"}
  },
  "auth":{"mode":"inlineOnce","username":"<injected>","password":"<injected>"},
  "budgetMs":30000
}
```

Body limit: 32 KiB. Budget: 1–60 seconds, default 30 seconds. Username ≤512 bytes,
password ≤4096 bytes; no NUL. At most 32 read paths and 64 resource paths; selectors
≤256 characters. Proof attribute must be `data-*`, `value`, or `textContent`.
The proof value must equal the supplied username after login and at the target.

Supported: same-origin HTTPS form POST with full-page navigation, exact queryless
paths, one submission, then scoped GET/HEAD. Unsupported: SSO, MFA/CAPTCHA completion,
XHR-only login, saved cookies/profiles, caller JavaScript or arbitrary write actions.
The caller must choose a real login and read-only targets; method constraints do
not establish the business meaning of a remote endpoint. A denied resource can
produce a degraded result; a login/account/target failure cannot return private data.

Credentials are not queued or stored for later reuse. A fresh browser context,
profile/process group and egress lease are destroyed before successful return.
Temporary session files live in memory-backed storage, not persistent disk.
See [containment and limitations](../deploy/capture/README.md), including the
native-browser-compromise boundary and lack of guaranteed RAM zeroization.

## Results and limits

Success returns top-level `success`, `url`, `finalUrl`, `markdown`, `method`, `cache`,
`tokens`, `metadata`, `quality`, and `warnings`. `method` is `browser`, `cache` is
`miss`; `metadata.contentSha256` hashes the exact returned redacted Markdown.
`quality.status` is `complete` or `degraded`. Warnings explicitly describe fallback
or incomplete readiness; they are not proof that a remote application is complete.

HTML limit 5 MiB; Markdown limit 2 MiB; network budget 100 requests/10 MiB.
Two active operations globally, one per principal. Public waiting queue: four.
Private requests reject overload before reading the body and are never queued.

Errors return `{ "success": false, "error": "...", "code": "...", "requestId": "..." }`.
Key statuses: 400 invalid input, 401 caller authentication, 403 missing scope,
413 limit, 422 target/login/human/account refusal, 429 capacity, 502 upstream,
503 unavailable/cleanup failure, 504 deadline. An incomplete/slow request body or
client disconnect can close the transport rather than return a JSON error.
No retries with stored credentials, durable jobs or private result history.

Grant updates require restarting the capture runtime; ConfigMap edits alone do
not immediately revoke access. Full tenant/workspace product authorization is a
later integration, not implied by this explicit principal allowlist.
