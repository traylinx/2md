# Architecture

## Pipeline Overview

Every URL goes through a 5-step pipeline:

```
URL → Fetch → Extract → Convert → Download → Polish → page.md
```

```
┌─────────────────────────────────────────────────────────────┐
│                        Orchestrator                          │
│                       (bin/html2md)                           │
├──────────┬──────────┬──────────┬──────────┬─────────────────┤
│  fetch   │ extract  │ convert  │ download │     polish       │
│  .js     │  .js     │  .js     │  .js     │      .js         │
│          │    ↓     │          │          │                   │
│ Puppeteer│Readability│Turndown │  fetch   │  whitespace      │
│          │    ↓     │  +GFM   │  +Buffer │  +front matter   │
│          │Trafilatura│         │          │  +quality        │
│          │  (Python)│          │          │                   │
└──────────┴──────────┴──────────┴──────────┴─────────────────┘
```

## Step Details

### Step 1: Fetch (`scripts/fetch.js`)

Renders the page using Puppeteer (headless Chrome) equipped with advanced stealth evasion.

**Anti-Bot Evasion:**
- Utilizes `puppeteer-extra-plugin-stealth`
- Rotates realistic Desktop User-Agents
- Injects standard browser `Sec-Fetch-*` and `Accept-Language` headers
- Masks `navigator.webdriver` execution traces

**Input:** URL or local file path
**Output:**
- `input/raw.html` — original HTML before JS rendering
- `input/rendered.html` — fully rendered DOM after JavaScript execution
- `input/screenshot.png` — page screenshot

Puppeteer seamlessly handles SPAs (React, Next.js, Angular, Vue) while bypassing typical WAF/Cloudflare 403 blocks.

### Step 2: Extract (`scripts/extract.js`)

Extracts the main content, stripping boilerplate (nav, ads, footers).

**Extraction cascade:**
1. **Readability.js** (primary) — Mozilla's algorithm, same as Firefox Reader View
2. **Trafilatura** (Python fallback) — activated when Readability strips too much structure
3. **Manual strip** (last resort) — removes `<script>`, `<style>`, `<nav>`, `<footer>`, etc.

**Quality check:** compares heading/table/image/list counts before and after extraction. If Readability preserves less than 30% of headings or 50% of tables, the fallback triggers.

**Input:** `input/rendered.html`
**Output:** `processing/extracted.html` or `processing/extracted.md` (Trafilatura)

### Step 3: Convert (`scripts/convert.js`)

Converts clean HTML to Markdown using Turndown.js.

**Custom rules:**
- Fenced code blocks with language detection (`language-python`, `highlight-js`, etc.)
- YouTube/Vimeo iframe → clickable thumbnail links
- `<details>/<summary>` → HTML passthrough for GFM
- `<dl>/<dt>/<dd>` → bold term + colon definition
- Relative URLs → absolute URLs

**Input:** `processing/extracted.html`
**Output:** `output/page.md`

### Step 4: Download (`scripts/download.js`)

Downloads all images referenced in the Markdown and rewrites paths.

- Skips images larger than `--max-image-size`
- Handles base64 data URIs (writes them to files)
- Generates `output/assets/manifest.json`

**Input:** `output/page.md`
**Output:** `output/assets/*.{png,jpg,gif,webp,...}`, updated `output/page.md`

### Step 5: Polish (`scripts/polish.js`)

Final normalization and quality scoring.

- Fixes excessive blank lines
- Normalizes heading spacing
- Cleans up empty links and images
- Adds YAML front matter (if `--front-matter`)
- Calculates quality metrics (word count, headings, links, images, lists)

**Input:** `output/page.md`
**Output:** `output/page.md` (in-place), updated `job.json`

## Batch & Crawl Modes

### Batch Mode

The orchestrator reads URLs from a `.txt` file and processes them in parallel using `p-queue`. Each URL gets its own job folder and runs through the full 5-step pipeline independently.

### Crawl Mode

Two-phase process:

1. **Discovery** (`scripts/crawl.js`)
   - Employs the same advanced stealth evasion as `fetch.js`
   - Normalizes domains automatically
   - Checks `sitemap.xml` first
   - Falls back to BFS link crawling with depth/page limits
   
2. **Conversion**
   - Feeds discovered URLs into batch mode

### Tree-Only Mode

When `--tree-only` is passed, the crawl phase runs but conversion is skipped entirely. Outputs a visual tree showing the site structure with page titles.

## Architecture Ecosystem (Production)

The production environment consists of a decentralized ecosystem optimized for cost and reliability:

1. **Frontend (Netlify):** The static Preact UI is hosted on Netlify Edge CDN.
2. **Backend API & Workers (DigitalOcean Droplet):** A standalone Docker Compose stack running the Express API, Caddy Reverse Proxy, and background queue workers on a 2 vCPU / 4GB Droplet (`s-2vcpu-4gb`).
3. **Task Queues (DigitalOcean Valkey):** Background jobs (crawl, batch, convert) are dispatched using BullMQ connected to a managed Valkey (Redis-compatible) cluster via TLS (`rediss://`).
4. **Persistent Storage (AWS S3):** Successfully completed zip archives are uploaded to an AWS S3 bucket (`2md-traylinx-production`). When users download a site, the API issues an HTTP 302 redirect directly to an S3 presigned URL, offloading all heavy bandwidth completely from the Droplet.

## File Map

```
html2md/
├── bin/html2md              # Main CLI orchestrator
├── frontend/                # Preact/Vite Frontend Web UI
├── server.js                # Express API server
├── worker.js                # BullMQ Background Job Processor
├── lib/queue.js             # Valkey/Redis queue module
├── lib/storage/s3.js        # AWS S3 Storage Adapter
├── Dockerfile               # Node.js + Headless Chrome + Python Container
├── docker-compose.yml       # Production Stack (API + Worker + Caddy)
└── .github/workflows/       # GitHub Actions deploy pipeline
```

## Dependencies

### Core Application
- `puppeteer-extra` — headless Chrome + stealth
- `@mozilla/readability` + `trafilatura` — content extraction
- `turndown` — HTML→Markdown
- `express` + `bullmq` + `ioredis` — API API server & Jobs

### Storage
- `@aws-sdk/client-s3` — AWS S3 persistence layer
