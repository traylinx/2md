---
name: 2md Reference Routing
description: Routing guide for accessing 2md reference documentation.
---

## When to Use

- When you need to **convert HTML or any file to Markdown**.
- When you want to **crawl a website** and produce Markdown output.
- When you need a **website sitemap**.
- When you need to **generate an AI-ready Skill Bundle** (Agentify).
- When you need to read the site's **privacy, security, or terms of service**.

## Response Formats

All core API endpoints support `format=json` (structured response, recommended for agents), `format=markdown` (raw text), or `format=stream` (NDJSON logs). Agents should always use `format=json`.

## Conversion Methods

Use `method=auto` (default) to let the server choose the fastest extraction path: `native` → `static` → `browser`. Use `method=browser` only for JavaScript-heavy SPAs.

## Async Workflows & Notifications

Long-running endpoints (`batch`, `crawl`, `agentify`) accept `async: true` to return a `202 Accepted` response with a `job_id`. 
You can optionally pass an `email` parameter to receive a branded email with a secure, 72-hour download link when the job finishes, or pass `webhook_url` for a machine-to-machine POST callback.

## Quick Convert: URL-Prepend

For immediate extraction without using the UI or writing API scripts, you can prepend the service URL to any target URL in the browser:
- **Pages & Documents (Free):** `https://2md.traylinx.com/https://example.com/page`
- **Media/Vision (Requires Key):** `https://2md.traylinx.com/https://example.com/image.png?apiKey=sk-...`

## Available References

| Task                                  | Reference                         |
| ------------------------------------- | --------------------------------- |
| Convert HTML to Markdown              | `references/_root.md`             |
| Agentify integration                  | `references/agentify.md`          |
| Crawl website to Markdown             | `references/crawl.md`             |
| Convert a file from a URL to Markdown | `references/file2md--from-url.md` |
| Convert an arbitrary file to Markdown | `references/file2md.md`           |
| Generate a website sitemap            | `references/map.md`               |
| Read privacy policy                   | `references/privacy-html.md`      |
| Read security policy                  | `references/security-html.md`     |
| Read terms of service                 | `references/terms-html.md`        |