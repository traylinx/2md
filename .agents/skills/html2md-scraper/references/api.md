# REST API Reference

The html2md tool includes an Express.js REST server (`server.js`) for HTTP-based integration.

**Base URL:** `http://localhost:8222` (configurable via `PORT` env var)

## Health Check

```
GET /api/health
```
**Response:**
```json
{ "status": "ok", "time": "2026-03-03T14:00:00.000Z" }
```

## Base API Features

**Rate Limits & Tiers (via `Authorization: Bearer <token>`)**
- Free: 50 requests / 15 min
- Pro: 500 requests / 15 min
- Enterprise: 5000 requests / 15 min

**Formats & Methods**
Endpoints (`convert`, `batch`, `file2md`) support `?format=json|markdown|stream` and `?method=auto|native|static|browser`.

---

## Convert Single URL

```
POST /api/convert
```
Converts a single URL and returns the Markdown content directly in the response body.

**Request Body:**
```json
{
  "url": "https://example.com/page",
  "downloadImages": true,
  "frontMatter": true,
  "waitMs": 10000,
  "maxImageSizeMb": 10,
  "stream": false
}
```

| Field            | Type    | Default    | Description                 |
| ---------------- | ------- | ---------- | --------------------------- |
| `url`            | string  | *required* | URL to convert              |
| `downloadImages` | boolean | `true`     | Download referenced images  |
| `frontMatter`    | boolean | `true`     | Add YAML front matter       |
| `waitMs`         | number  | `10000`    | JS rendering wait time (ms) |
| `maxImageSizeMb` | number  | `10`       | Max image size in MB        |

**Streaming & Cancellation:**
All endpoints (Convert, Batch, Crawl) return `Transfer-Encoding: chunked`. The endpoints stream real-time CLI terminal output logs as plain text. Once the operation finishes, it appends a `__JSON__` delimiter followed by the final JSON response payload. 
If the HTTP connection is closed by the client early, the server detects this and instantly kills the headless browser processes to conserve memory.

**Response format (at end of stream):**
```json
__JSON__{
  "success": true,
  "url": "https://example.com/page",
  "markdown": "# Page Title\n\nContent here...",
  "metadata": { "title": "Page Title", "description": "..." },
  "quality": { "headings": 5, "links": 12, "images": 3 }
}
```

---

## Batch Convert

```
POST /api/batch
```
Converts multiple URLs. Returns an array of results.

**Request Body:**
```json
{
  "urls": ["https://example.com/page1", "https://example.com/page2"],
  "downloadImages": true,
  "frontMatter": true,
  "stream": false
}
```

**Response (non-streaming):**
```json
{
  "success": true,
  "results": [
    { "url": "https://example.com/page1", "success": true, "markdown": "..." },
    { "url": "https://example.com/page2", "success": false }
  ]
}
```

**Async Execution:**
If you pass `"async": true`, the server immediately returns a `202 Accepted` response with a `job_id`. You can optionally pass `"webhook_url"` to receive an HTTP POST callback when the batch conversion is finished.

---

## Crawl Site

```
POST /api/crawl
```
Discovers and converts an entire site. Files are persisted on disk under `jobs/<domain>/`.

**Request Body:**
```json
{
  "url": "https://docs.example.com",
  "depth": 3,
  "maxPages": 50,
  "treeOnly": false,
  "stream": false
}
```

| Field      | Type    | Default    | Description                       |
| ---------- | ------- | ---------- | --------------------------------- |
| `url`      | string  | *required* | Seed URL to crawl from            |
| `depth`    | number  | `3`        | Max link-following depth          |
| `maxPages` | number  | `50`       | Max pages to discover             |
| `treeOnly` | boolean | `false`    | Only return tree, skip conversion |

**Response (full crawl):**
```json
{
  "success": true,
  "message": "Crawl completed for https://docs.example.com",
  "siteJson": "/absolute/path/to/jobs/docs.example.com/site.json"
}
```

**Response (tree-only):**
```json
{
  "success": true,
  "tree": "/  # Homepage\n├── about  # About\n└── docs  # Documentation",
  "urls": ["https://docs.example.com/", "https://docs.example.com/about"],
  "stats": { "depth": 3, "maxPages": 50 },
  "siteJson": "/absolute/path/to/jobs/docs.example.com/site.json"
}
```

> **Important:** After a crawl, always read the `siteJson` path from the response to find all generated Markdown files.

**Async Execution:**
Pass `"async": true` to return immediately with a `202 Accepted` response (`job_id`). Optional `"webhook_url"` will receive a callback when the crawl completes.

---

## Agentify Site

```
POST /api/agentify
```
Executes the Agentify pipeline to convert a website into an AI-ready Skill Bundle.

**Request Body:**
```json
{
  "url": "https://example.com",
  "maxPages": 10,
  "includeApiSchema": false,
  "targetAgent": "web",
  "apiKey": "sk-your-switchai-key",
  "urls": []
}
```

| Field              | Type     | Required | Description                           |
| ------------------ | -------- | -------- | ------------------------------------- |
| `url`              | string   | yes      | Target URL to agentify                |
| `maxPages`         | number   | no       | Max pages to crawl                    |
| `includeApiSchema` | boolean  | no       | Instruct LLM to generate API schemas  |
| `targetAgent`      | string   | no       | Target agent profile (`web`, `local`) |
| `apiKey`           | string   | *        | Required if BYOK is active            |
| `urls`             | string[] | no       | Optional predefined list of URLs      |

**Async Execution:**
Pass `"async": true` to return immediately with a `202 Accepted` response (`job_id`). Optional `"webhook_url"` will receive a callback when the agentify pipeline completes.

---

## File2MD (Agentic Uploads)

```
POST /api/file2md
```
Upload a local file (e.g., PDF, image, media) to be processed into Markdown via Agentic Upload Engines + Vision Models.

**Request Content-Type:** `multipart/form-data`

| Form Field | Type   | Required | Description                              |
| ---------- | ------ | -------- | ---------------------------------------- |
| `file`     | File   | yes*     | The file to convert                      |
| `url`      | string | yes*     | Fallback URL to download the file        |
| `apiKey`   | string | yes      | LLM API Key (required for Vision models) |
| `enhance`  | string | no       | `"true"`/`"false"`                       |
| `model`    | string | no       | Override the vision model to use         |

*\* Either `file` or `url` must be provided.*

---

## Starting the Server

```bash
cd /Users/sebastian/Projects/pruebas/html2md
node server.js
```

Or with a custom port:
```bash
PORT=8080 node server.js
```
