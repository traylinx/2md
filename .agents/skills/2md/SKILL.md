---
name: 2md
description: Use `2md` by Traylinx — a powerful data-extraction API that converts any URL, file, or website into clean Markdown natively configured for AI context ingestion.
---

You have access to 2md by Traylinx — a data-extraction API that converts any URL, file, or website into clean Markdown.

HOW TO USE: Make HTTP requests using your own built-in tools (fetch, read_url_content, requests, run_command with curl, or any HTTP capability you have).

── INSTANT CONVERT (GET — URL-Prepend) ──
The fastest method. Simply make a GET request to the 2md URL followed by the target URL:
GET https://2md.traylinx.com/https://example.com/any-page

Inline query parameters you can append:
  ?format=markdown  (default) or json (structured with metadata and token count)
  ?method=auto      (default) or native | static | browser (use browser for JS-heavy SPAs)
  ?force=true       bypass cache entirely
  ?maxAge=3600      only serve cached results fresher than N seconds

Examples:
  https://2md.traylinx.com/https://example.com/docs?format=json
  https://2md.traylinx.com/https://react-app.dev?method=browser&format=json

No API key needed for public web pages.

── INSTANT CRAWL (GET — URL-Prepend) ──
Crawl an entire site via GET:
GET https://2md.traylinx.com/crawl/https://docs.example.com?depth=3&maxPages=50

Returns a job_id for async processing. Optional params: ?email=you@example.com, ?webhook_url=...

── POST API ENDPOINTS ──
Base URL: https://api.traylinx.com

1) POST /api/convert — Convert a single URL
   Body: {"url": "https://example.com/docs", "format": "json", "method": "auto"}
   Optional fields: downloadImages (bool), frontMatter (bool), waitMs (number), screenshot (bool)

2) POST /api/batch — Batch convert multiple URLs
   Body: {"urls": ["https://example.com/1", "https://example.com/2"], "format": "json", "async": true}

3) POST /api/crawl — Crawl an entire website
   Body: {"url": "https://example.com", "format": "json", "async": true}
   Optional: depth (number), maxPages (number), email (string), webhook_url (string)

4) POST /api/map — Map a website (discover all pages without converting)
   Body: {"url": "https://example.com", "format": "json"}

5) POST /api/file2md — Convert uploaded files (PDF, DOCX, images, audio, video)
   Multipart form: file=@document.pdf, format=json
   Requires apiKey for media/vision extraction.

6) POST /api/agentify — Generate AI Skill Bundles (SKILL.md + llms.txt)
   Body: {"url": "https://docs.example.com", "format": "json", "async": true}

── FORMAT OPTIONS (all endpoints) ──
  format=json      Structured JSON with markdown, metadata, token count (recommended)
  format=markdown   Raw Markdown text
  format=stream     NDJSON streaming logs

── ASYNC JOBS ──
Long-running requests (batch, crawl, agentify) return a job_id.
Poll status: GET /api/jobs/{job_id}
Get result:  GET /api/jobs/{job_id}/result

── IMPORTANT ──
- Free tier: unlimited public page conversions, no API key required.
- For media/vision file extraction, append ?apiKey=sk-... to the URL or include apiKey in the POST body.
- Full docs: https://docs.traylinx.com
- Agent discovery: https://2md.traylinx.com/llms.txt and https://2md.traylinx.com/agents.json
