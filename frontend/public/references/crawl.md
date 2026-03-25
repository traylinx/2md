Website Crawler to Markdown | html2md

# The Web is Messy. Your Data Shouldn't Be.

Stop wrestling with messy HTML, tracking scripts, and pop-ups. We intelligently extract the core content from any URL and deliver perfectly formatted Markdown—ready for your AI agents, apps, or personal notes.

80% Token Reduction5x More Content Per Context Window0 External Dependencies

[document\_scannerConvert Page](/)[travel\_exploreCrawl Site](/crawl)[account\_treeSitemap](/map)[smart\_toyAgentify](/agentify)

Discover and batch-convert an **entire website** from a root URL.

boltDiscover

iDepth012345iMax Pages10203050

iImages

iMetadata

---

## API Reference: Crawl & Batch

Automate full-site extraction with a two-step workflow: **Discover** all reachable pages, then **Batch Convert** the selections.

**Response Modes:** Use `format=json` for clean structured JSON (default for API tools), or `format=stream` for live NDJSON logs with `__JSON__` result (Web UI default).

**Async Workflows:** Pass `"async": true` to immediately get a `202 Accepted` response with a `job_id`. Optionally pass `"webhook_url"` to receive an HTTP POST callback when the job finishes.

**llms.txt Guided Crawl:** The crawler automatically checks `<target>/llms.txt` before spawning Chromium. If found, seed URLs are injected into the BFS queue for more efficient discovery of curated content.

### Step 1: Site Discovery

| Parameter     | Type      | Default | Description                                                                  |
| ------------- | --------- | ------- | ---------------------------------------------------------------------------- |
| `url`required | `string`  | `—`     | The root URL to start crawling from.                                         |
| `depth`       | `number`  | `3`     | How many levels deep to follow links. 0 = single page only.                  |
| `maxPages`    | `number`  | `50`    | Maximum number of pages to discover. Prevents runaway crawls on large sites. |
| `treeOnly`    | `boolean` | `false` | When true, only discover and return the site tree — skip content conversion. |
| `format`      | `string`  | `json`  | Response format: `json` or `stream`.                                         |
| `async`       | `boolean` | `false` | Return 202 immediately, process in background.                               |
| `webhook_url` | `string`  | `—`     | URL to receive POST callback on completion.                                  |

POST/api/crawl

Returns a visual tree and an array of all discovered URLs. Use treeOnly: true for fast discovery without conversion.

#\_ Request (cURL){ } Response

BASHcontent\_copyCopy

```
curl -X POST https://2md.traylinx.com/api/crawl \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://docs.traylinx.com",
    "depth": 2,
    "maxPages": 50,
    "treeOnly": true
  }'
```

### Step 2: Batch Conversion

| Parameter        | Type       | Default | Description                                                          |
| ---------------- | ---------- | ------- | -------------------------------------------------------------------- |
| `urls`required   | `string[]` | `—`     | Array of URLs to convert in a single batch operation.                |
| `downloadImages` | `boolean`  | `true`  | Download images locally for each page.                               |
| `frontMatter`    | `boolean`  | `true`  | Include YAML front matter (title, author, date) in each result.      |
| `screenshot`     | `boolean`  | `false` | Capture a screenshot of each page. Results include `screenshotUrl`.  |
| `method`         | `string`   | `auto`  | Conversion engine: `auto`, `native`, `static`, or `browser`.         |
| `format`         | `string`   | `json`  | Response format: `json` or `stream`.                                 |
| `preset`         | `string`   | `full`  | Output mode: `full`, `compact` (no images), or `chunks` (RAG-ready). |
| `async`          | `boolean`  | `false` | Return 202 immediately, process in background.                       |
| `webhook_url`    | `string`   | `—`     | URL to receive POST callback on completion.                          |

POST/api/batch

Pass the URLs array from Step 1 to convert all pages. Each result includes independent success status and token counts.

#\_ Request (cURL){ } Response

BASHcontent\_copyCopy

```
curl -X POST https://2md.traylinx.com/api/batch \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://docs.traylinx.com/getting-started",
      "https://docs.traylinx.com/api-reference"
    ],
    "downloadImages": true,
    "frontMatter": true
  }'
```

### Step 3: Download Archive

GET/api/download/:site

Download the entire crawled site directory as a ZIP archive. Includes raw HTML, converted Markdown, and metadata.

#\_ Request (cURL){ } Response

BASHcontent\_copyCopy

```
curl -O https://2md.traylinx.com/api/download/docs.traylinx.com
```

### Health Check

GET/api/health

Simple health check endpoint. Returns 200 OK when the server is running.

#\_ Request (cURL){ } Response

BASHcontent\_copyCopy

```
curl https://2md.traylinx.com/api/health
```

### 🚀 Get Your Free SwitchAI API Key

SwitchAI is Traylinx's unified LLM router — one key, access to GPT, Claude, Llama, Mistral, and more. Sign up in 30 seconds and start generating intelligent Skill Bundles immediately.

[Create Free Account →](https://traylinx.com/switchai)

Pay-as-you-go pricing · No monthly minimums · Your key, your data

## Frequently Asked Questions

Common questions about multi-page site crawling and batch conversion.

What is the difference between depth and maxPages?+

depth controls how many link-hops the crawler follows from your start URL (e.g., depth=2 means root page + links + links of links). maxPages is an absolute safety ceiling — once that many pages are found, the crawl stops regardless of depth. Always set maxPages to avoid accidentally crawling entire domains.

What does treeOnly mode do?+

When treeOnly is true, the crawler discovers and maps all pages (producing a visual site tree) but skips the content conversion step. It is a fast way to preview the structure of a site before committing to a full crawl, saving time and resources.

How does the crawler avoid being blocked?+

The engine uses Puppeteer with stealth plugins, realistic viewport sizes, and standard Chrome headers. This renders pages exactly as a real browser would, bypassing most bot-detection mechanisms. Rate limiting is also built-in to avoid hammering servers.

Can I crawl behind authentication?+

Not directly through the web UI — but via the API you can set custom headers (e.g., Authorization, Cookie) in the request body to access protected content. Contact us for enterprise session-injection features.

What format is the batch output?+

By default (`format=json`), each URL's Markdown is returned as a clean JSON object with `success`, `markdown`, `method`, and `quality` fields. Use `preset=compact` to strip images or `preset=chunks` to split into heading-based chunks for RAG pipelines. The legacy `format=stream` mode streams NDJSON log events for real-time progress display.

## Engineered for AI Data Pipelines

Raw HTML wastes tokens and confuses LLMs. HTML2MD automatically cleans, structures, and optimizes web content, delivering pristine Markdown that maximizes your context window and reduces AI hallucinations.

STEP 1

### Smart Method Selection

The `auto` method intelligently tries the fastest extraction path first: HTTP content negotiation (`native`), then lightweight static parsing (`static`), and only falls back to full headless Chromium (`browser`) when needed.

STEP 2

### Readability Extraction

Leverages Mozilla's Readability.js algorithm to instantly strip away navigation menus, footers, popups, and ads, isolating only the core article text and images.

STEP 3

### Turndown Polish

Converts the isolated content into perfectly clean, Git-compatible Markdown using Turndown, optimizing links, transforming tables, and pruning unnecessary tags.

## REST API Reference

For programmatic access, HTML2MD exposes a clean REST API. Check the **Convert** and **Crawl** tabs for real-world usage examples and endpoint specifics.

GET/api/health

Check the health of the rendering engine.

#\_ Request (cURL){ } Response

BASHcontent\_copyCopy

```
curl ${host}/api/health
```

## Built For

Developers, AI agents, and teams building the next generation of intelligent applications.

smart\_toy

#### AI agents that browse and summarize the web

menu\_book

#### RAG pipelines that need clean document chunks

psychology

#### Training data preparation for LLMs

inventory\_2

#### Deep-site documentation crawling & archival
