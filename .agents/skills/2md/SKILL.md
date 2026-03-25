---
name: 2md
description: Use `2md` by Traylinx — a data-extraction API that converts any URL, file, or website into clean, AI-ready Markdown. Supports instant URL-prepend, batch, crawl, sitemap, file conversion, and agent skill generation.
---

# 2md — Agent Instructions

You have access to **2md by Traylinx**, a data-extraction API that converts any URL, file, or website into clean Markdown optimized for AI context windows.

**HOW TO USE:** Make HTTP requests using your own built-in tools (`fetch`, `read_url_content`, `requests`, `run_command` with curl, or any HTTP capability you have).

---

## Recommended Workflow

When a user asks you to read, extract, or analyze a webpage:

1. **Single page?** → Use the URL-Prepend GET shortcut (fastest, zero config)
2. **JavaScript-heavy SPA?** → Add `?method=browser` to the URL-Prepend
3. **Multiple pages?** → Use POST `/api/batch` with async mode
4. **Entire documentation site?** → Use the Crawl Prepend or POST `/api/crawl`
5. **Need a sitemap first?** → Use POST `/api/map` to discover pages, then batch convert

---

## 1. Instant Convert (GET — URL-Prepend)

The fastest method. Prepend the 2md URL to any target:

```
GET https://2md.traylinx.com/https://example.com/any-page
```

### Query Parameters

| Param | Default | Options | Purpose |
|-------|---------|---------|---------|
| `format` | `markdown` | `markdown`, `json` | `json` returns structured data with metadata |
| `method` | `auto` | `auto`, `native`, `static`, `browser` | Use `browser` for JS-heavy SPAs |
| `force` | `false` | `true`, `false` | Bypass cache entirely |
| `maxAge` | — | seconds (e.g. `3600`) | Only serve cached results fresher than N seconds |

### Examples

```
https://2md.traylinx.com/https://example.com/docs?format=json
https://2md.traylinx.com/https://react-app.dev?method=browser&format=json
https://2md.traylinx.com/https://old-page.com?force=true
```

No API key needed for public web pages.

### JSON Response Schema

When using `?format=json`, you receive:

```json
{
  "success": true,
  "url": "https://example.com/docs",
  "markdown": "# Page Title\n\nExtracted content...",
  "cache": "miss",
  "method": "native",
  "tokens": { "html": 45000, "md": 3200 },
  "metadata": { "title": "Page Title", "description": "..." },
  "quality": { "wordCount": 1250 }
}
```

### Error Response

```json
{
  "success": false,
  "error": "Description of what went wrong"
}
```

---

## 2. Instant Crawl (GET — URL-Prepend)

Crawl an entire site via GET:

```
GET https://2md.traylinx.com/crawl/https://docs.example.com?depth=3&maxPages=50
```

| Param | Default | Purpose |
|-------|---------|---------|
| `depth` | `3` | How many link levels deep to crawl |
| `maxPages` | `50` | Maximum number of pages to convert |
| `email` | — | Email address for completion notification |
| `webhook_url` | — | URL to POST results to when done |

Returns a `job_id` for async polling (see Async Jobs below).

---

## 3. POST API Endpoints

Base URL: `https://api.traylinx.com`

All POST endpoints accept `Content-Type: application/json`.

### POST /api/convert — Convert a single URL

```json
{
  "url": "https://example.com/docs",
  "format": "json",
  "method": "auto"
}
```

Optional fields:

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `downloadImages` | bool | `true` | Download and embed images |
| `frontMatter` | bool | `true` | Include YAML front matter |
| `screenshot` | bool | `false` | Capture a screenshot of the page |
| `waitMs` | number | `10000` | Wait time for page load (browser method) |
| `maxImageSizeMb` | number | `10` | Max image size to download |

### POST /api/batch — Batch convert multiple URLs

```json
{
  "urls": ["https://example.com/1", "https://example.com/2"],
  "format": "json",
  "async": true
}
```

### POST /api/crawl — Crawl an entire website

```json
{
  "url": "https://example.com",
  "format": "json",
  "async": true,
  "depth": 3,
  "maxPages": 50
}
```

Optional: `email` (string), `webhook_url` (string) for completion notifications.

### POST /api/map — Map a website (discover pages without converting)

```json
{
  "url": "https://example.com",
  "format": "json"
}
```

Returns a list of discovered URLs. Useful for planning which pages to convert.

### POST /api/file2md — Convert uploaded files

Multipart form upload. Supports: PDF, DOCX, images, audio, video.

```
POST /api/file2md
Content-Type: multipart/form-data

file=@document.pdf
format=json
```

Requires `apiKey` for media/vision extraction (images, audio, video).

### POST /api/agentify — Generate AI Skill Bundles

```json
{
  "url": "https://docs.example.com",
  "format": "json",
  "async": true
}
```

Generates `SKILL.md` + `llms.txt` + reference files for injecting documentation knowledge into autonomous agents.

---

## Format Options (all endpoints)

| Format | Content-Type | Description |
|--------|-------------|-------------|
| `json` | `application/json` | Structured JSON with markdown, metadata, token counts **(recommended)** |
| `markdown` | `text/plain` | Raw Markdown text only |
| `stream` | `text/plain` (chunked) | NDJSON streaming logs with final `__JSON__` payload |

---

## Async Jobs

Long-running requests (batch, crawl, agentify) return a `job_id`.

```
Poll status:  GET https://api.traylinx.com/api/jobs/{job_id}
Get result:   GET https://api.traylinx.com/api/jobs/{job_id}/result
```

Poll every 5-10 seconds. The status field will be `running`, `done`, or `failed`.

---

## Important

- **Free tier:** Unlimited public page conversions, no API key required.
- **Media/vision extraction:** Requires an API key. Append `?apiKey=sk-...` to the URL or include `apiKey` in the POST body.
- **Rate limits:** The API uses tiered rate limiting. If you receive a 429 response, wait and retry.
- **Full documentation:** [docs.traylinx.com](https://docs.traylinx.com)
- **Agent discovery:** [2md.traylinx.com/llms.txt](https://2md.traylinx.com/llms.txt) and [2md.traylinx.com/agents.json](https://2md.traylinx.com/agents.json)
