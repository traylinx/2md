# API Reference

Start the API server:

```bash
npm start
# or
node server.js
```

The server runs on port `8222` by default. Set `PORT` environment variable to change.
## Base API Features

### Rate Limits & Tiers
The API enforces rate limiting based on your tier. Pass an API key via the `Authorization: Bearer <token>` header to access higher tiers.
- **Free (No Key):** 50 requests / 15 min
- **Pro:** 500 requests / 15 min
- **Enterprise:** 5000 requests / 15 min

Rate limit headers (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`) are included in every response.

### Response Formats
All core conversion endpoints (`/api/convert`, `/api/batch`, `/api/file2md`) support content negotiation via the `format` query string (or `Accept` header for `/convert`):
- `?format=json` — Returns a structured JSON response (default for API tools)
- `?format=markdown` — Returns raw Markdown directly (`/api/convert` only)
- `?format=stream` — Streams NDJSON log events followed by a final `__JSON__` result (Default for Web UI)

### Conversion Methods
You can control the conversion engine via the `method` parameter:
- `auto` (Default): Attempts `native` → `static` → `browser`
- `native`: Fetches raw markdown if the target server supports content negotiation.
- `static`: Uses lightweight cheerio/Readability extraction without executing JS.
- `browser`: Spawns a full headless Puppeteer instance for JS-heavy SPAs.

### Async Workflows (Webhooks & Email)
Long-running endpoints (`batch`, `crawl`, `agentify`) support asynchronous execution:
- Pass `"async": true` in the JSON body to receive an immediate `202 Accepted` response with a `job_id`.
- Optionally pass `"email": "you@example.com"` to receive a branded email containing a secure, 72-hour ZIP download link when the job finishes.
- Optionally pass `"webhook_url": "https://..."` to receive an HTTP POST callback when the job finishes.
- The webhook payload will be signed with `X-Webhook-Signature` (HMAC-SHA256) if the server is configured with a `WEBHOOK_SECRET`.

### Quick Convert: URL-Prepend
For immediate extraction without writing API scripts, prepend the service URL to any target URL in the browser:
- **Pages & Documents (Free):** `https://2md.traylinx.com/https://example.com/page`
- **Media/Vision (Requires Key):** `https://2md.traylinx.com/https://example.com/image.png?apiKey=sk-...`

## Endpoints
### `GET /api/health`

Health check.

**Response:**
```json
{
  "status": "ok",
  "time": "2026-03-03T10:00:00.000Z"
}
```

---

### `POST /api/convert`

Convert a single URL to Markdown.

> **Note on Steaming & Cancellation:** This endpoint streams progress logs in real-time. If the client disconnects before the process completes (e.g., closing the tab), the server instantly detects the disconnect and utilizes `tree-kill` to safely terminate the running headless browser to save memory.

**Request:**
```json
{
  "url": "https://example.com",
  "downloadImages": true,
  "frontMatter": true,
  "waitMs": 10000,
  "maxImageSizeMb": 10
}
```

| Field            | Type    | Required | Default | Description                |
| ---------------- | ------- | -------- | ------- | -------------------------- |
| `url`            | string  | yes      | -       | URL to convert             |
| `downloadImages` | boolean | no       | `true`  | Download referenced images |
| `frontMatter`    | boolean | no       | `true`  | Add YAML front matter      |
| `waitMs`         | number  | no       | `10000` | JS rendering timeout (ms)  |
| `maxImageSizeMb` | number  | no       | `10`    | Max image size to download |

**Response (200):**
```json
{
  "success": true,
  "url": "https://example.com",
  "markdown": "# Example Domain\n\nThis domain is for...",
  "metadata": {
    "title": "Example Domain",
    "byline": null,
    "excerpt": null
  },
  "quality": {
    "headings": 1,
    "links": 1,
    "images": 0,
    "lists": 0
  }
}
```

**Error (400):**
```json
{ "error": "Missing url in request body" }
```

**Error (500):**
```json
{ "error": "Conversion failed", "details": "..." }
```

---

### `POST /api/batch`

Convert multiple URLs in parallel.

> **Note on Steaming & Cancellation:** This endpoint streams progress logs. If the client disconnects before completion, all running child processes are killed immediately.

**Request:**
```json
{
  "urls": [
    "https://example.com",
    "https://info.cern.ch",
    "https://httpbin.org"
  ],
  "downloadImages": true,
  "frontMatter": true
}
```

| Field            | Type     | Required | Default | Description               |
| ---------------- | -------- | -------- | ------- | ------------------------- |
| `urls`           | string[] | yes      | -       | Array of URLs to convert  |
| `downloadImages` | boolean  | no       | `true`  | Download images           |
| `frontMatter`    | boolean  | no       | `true`  | Add YAML front matter     |
| `async`          | boolean  | no       | `false` | Run quietly in background |
| `email`          | string   | no       | -       | Send ZIP link when done   |
| `webhook_url`    | string   | no       | -       | POST result to this URL   |

**Response (200):**
```json
{
  "success": true,
  "results": [
    { "url": "https://example.com", "success": true, "markdown": "# Example..." },
    { "url": "https://info.cern.ch", "success": true, "markdown": "# CERN..." },
    { "url": "https://httpbin.org", "success": false }
  ]
}
```

**Timeout:** 5 minutes (300s).

---

### `POST /api/crawl`

Crawl a domain and convert all discovered pages.

> **Note on Steaming & Cancellation:** This endpoint streams progress logs. If the client disconnects before completion, the crawler and all its headless browser instances are killed immediately.

**Request:**
```json
{
  "url": "https://docs.example.com",
  "depth": 3,
  "maxPages": 50
}
```

| Field      | Type    | Required | Default | Description                         |
| ---------- | ------- | -------- | ------- | ----------------------------------- |
| `url`      | string  | yes      | -       | Root URL to crawl                   |
| `depth`    | number  | no       | `3`     | Max crawl depth                     |
| `maxPages` | number  | no       | `50`    | Max pages to discover               |
| `treeOnly` | boolean | no       | `false` | Return site tree without converting |

**Response (200) — default:**
```json
{
  "success": true,
  "message": "Crawl completed for https://docs.example.com"
}
```

**Response (200) — with `treeOnly: true`:**
```json
{
  "success": true,
  "tree": "/  # My Site\n├── about\n└── contact",
  "urls": [
    "https://docs.example.com",
    "https://docs.example.com/about",
    "https://docs.example.com/contact"
  ],
  "stats": { "depth": 3, "maxPages": 50 }
}
```

**Timeout:** 10 minutes (600s).

---

### `POST /api/agentify`

Execute the Agentify pipeline to convert a website into an AI-ready Skill Bundle.

> **Note on Steaming & Cancellation:** This endpoint streams progress logs in real-time.

**Request:**
```json
{
  "url": "https://example.com",
  "maxPages": 10,
  "includeApiSchema": false,
  "targetAgent": "web",
  "apiKey": "sk-...",
  "urls": []
}
```

| Field              | Type     | Required | Default | Description                           |
| ------------------ | -------- | -------- | ------- | ------------------------------------- |
| `url`              | string   | yes      | -       | Target URL to agentify                |
| `maxPages`         | number   | no       | `50`    | Max pages to crawl                    |
| `includeApiSchema` | boolean  | no       | `false` | Instruct LLM to generate API schemas  |
| `targetAgent`      | string   | no       | `"web"` | Target agent profile (`web`, `local`) |
| `apiKey`           | string   | no       | -       | Required if `AGENTIFY_BYOK=true`      |
| `urls`             | string[] | no       | `[]`    | Optional predifined list of URLs      |

**Response (200):** NDJSON log events followed by the final `__JSON__` result summary.

---

### `POST /api/file2md`

Upload a local file (e.g., PDF) to be processed into Markdown via Agentic Upload Engines + Vision Models.

**Request Content-Type:** `multipart/form-data`

| Form Field | Type   | Required | Description                              |
| ---------- | ------ | -------- | ---------------------------------------- |
| `file`     | File   | yes*     | The file to convert                      |
| `url`      | string | yes*     | Fallback URL to download the file        |
| `apiKey`   | string | yes      | LLM API Key (required for Vision models) |
| `enhance`  | string | no       | `"true"`/`"false"`                       |
| `model`    | string | no       | Override the vision model to use         |

*\* Either `file` or `url` must be provided.*

**Response (200):** NDJSON log events followed by the final `__JSON__` result summary.

---

### `GET /api/download/:site`

Download a ZIP archive of a site's processed results.

**Query Parameters:**
- `slugs=page-slug1,page-slug2` (Optional): Create a scoped ZIP containing only the specified pages.

**Response (200):** Returns a `.zip` file download.

---

### `GET /api/jobs` and Job Management

Manage asynchronous job processes.

- `GET /api/jobs` — List all stored jobs.
- `GET /api/jobs/:id` — Get metadata for a specific job ID.
- `GET /api/jobs/:id/result` — Fetch the final result of a completed job.
- `DELETE /api/jobs` — Clear the job registry (optional `?before=[ISO-Date]` to clear older jobs).

---

### Agent Discovery Endpoints

Let AI agents auto-discover capabilities and skill bundles.

- `GET /llms.txt` — Standard entry point describing the service to AI agents.
- `GET /llms-full.txt` — Verbose entry point for context.
- `GET /skills/:skillName.md` — Fetch a generated SKILL.md bundle directly by name.

---

### Static Frontend — Web UI

The server serves a full-featured Web UI (Preact/Vite) from `frontend/dist/`.

#### Keep-Alive Architecture

The UI is built using a Keep-Alive architecture where inactive tabs (Convert, Crawl, Sitemap) are hidden via CSS (`display: none`) instead of being unmounted. This guarantees that long-running operations, live logs, and active fetch connections survive seamlessly as you switch between modes.

#### Convert Page

Paste a single URL and convert it to Markdown. Options for downloading images and adding YAML front matter. Shows word count, headings, links, and file size stats. A **Cancel Process** button instantly halts the server-side extraction.

#### Crawl Site

1. Enter a root URL with depth and max pages settings.
2. Click **Discover** to run `treeOnly` crawl — shows the site tree and a list of all discovered URLs.
3. Select/deselect individual pages using checkboxes.
4. (Optional) Provide an email address to receive an async secure download link.
5. Click **Convert Selected** to batch-convert the chosen pages.
6. Results show per-page success/failure. You can download all successful conversions as a `.zip` archive or wait for the email.
7. A **Cancel Process** button is available at any time to halt crawling or batch operations.

#### Sitemap

Input a URL to generate a visual site structure. Available to download exactly as it appears on screen in `.txt`, `.md`, or `.json` formats.

## Usage with cURL

```bash
# Single conversion
curl -X POST http://localhost:8222/api/convert \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}' | jq .markdown

# Batch conversion
curl -X POST http://localhost:8222/api/batch \
  -H "Content-Type: application/json" \
  -d '{"urls": ["https://example.com", "https://info.cern.ch"]}'

# Crawl
curl -X POST http://localhost:8222/api/crawl \
  -H "Content-Type: application/json" \
  -d '{"url": "https://docs.example.com", "depth": 2}'

# Crawl — tree only (no conversion)
curl -X POST http://localhost:8222/api/crawl \
  -H "Content-Type: application/json" \
  -d '{"url": "https://docs.example.com", "depth": 2, "treeOnly": true}'
```
