HTML to Markdown Converter | html2md

# The Web is Messy. Your Data Shouldn't Be.

Stop wrestling with messy HTML, tracking scripts, and pop-ups. We intelligently extract the core content from any URL and deliver perfectly formatted Markdown—ready for your AI agents, apps, or personal notes.

80% Token Reduction5x More Content Per Context Window0 External Dependencies

[document\_scannerConvert Page](/)[travel\_exploreCrawl Site](/crawl)[account\_treeSitemap](/map)[smart\_toyAgentify](/agentify)

Extract and convert a **single URL** directly into Markdown.

boltConvert

iImages

iMetadata

---

## Zero-Friction: Browser-Bar Conversion

Paste any URL after the domain to instantly get Markdown — no API call needed:

```
https://2md.traylinx.com/https://example.com/article
```

Just prepend `https://2md.traylinx.com/` to any URL in your browser address bar. Returns clean Markdown instantly. Add `?format=json` for JSON output.

---

## API Reference: Convert

Convert any URL into clean Markdown using a single POST request. The server intelligently selects the best extraction method — from lightweight static parsing to full headless browser rendering — and responds with polished Markdown.

**Response Modes:** Use the `format` parameter to choose your response type: `json` (default for API tools — clean structured JSON), `markdown` (raw text), or `stream` (live NDJSON logs with `__JSON__` result, default for Web UI). If you cancel the process or disconnect, the server instantly kills any headless browser processes.

**Conversion Methods:** Use the `method` parameter to control extraction: `auto` (default — tries native→static→browser), `native` (HTTP content negotiation), `static` (cheerio/Readability, no browser), or `browser` (full Puppeteer for JS-heavy SPAs).

**Rate Limits:** Free tier allows 20 requests/minute. Pass `Authorization: Bearer <key>` for higher limits (Pro: 100/min, Enterprise: 500/min). Standard `RateLimit-*` headers are returned.

### Parameters

| Parameter        | Type      | Default | Description                                                               |
| ---------------- | --------- | ------- | ------------------------------------------------------------------------- |
| `url`required    | `string`  | `—`     | The URL of the page to convert.                                           |
| `downloadImages` | `boolean` | `true`  | Download images locally and rewrite URLs in the Markdown output.          |
| `frontMatter`    | `boolean` | `true`  | Extract title, author, date, and description into YAML front matter.      |
| `waitMs`         | `number`  | `10000` | How long (ms) to wait for the page to finish rendering (useful for SPAs). |
| `maxImageSizeMb` | `number`  | `10`    | Maximum size (MB) for downloaded images. Larger images are skipped.       |
| `format`         | `string`  | `json`  | Response format: `json`, `markdown`, or `stream`.                         |
| `method`         | `string`  | `auto`  | Conversion engine: `auto`, `native`, `static`, or `browser`.              |

### Query Parameters

| Parameter | Type      | Default | Description                                      |
| --------- | --------- | ------- | ------------------------------------------------ |
| `maxAge`  | `number`  | `—`     | Only serve from cache if fresher than N seconds. |
| `force`   | `boolean` | `false` | Bypass cache entirely and re-convert.            |

### Response Headers

Every response includes these metadata headers:

| Header                | Description                                                          |
| --------------------- | -------------------------------------------------------------------- |
| `x-markdown-tokens`   | Estimated token count of the resulting Markdown.                     |
| `x-html-tokens`       | Estimated token count of the source HTML.                            |
| `x-conversion-method` | Actual method used: `native`, `static`, `browser`, or `local_cache`. |
| `x-cache`             | Cache status: `hit` or `miss`.                                       |
| `x-request-id`        | Unique request UUID for tracing.                                     |
| `x-job-id`            | Job ID (use with `/api/jobs/:id` to check status).                   |
| `x-client-id`         | Pass this header to scope jobs to your session.                      |

### Example: Basic Conversion

POST/api/convert

Send a JSON payload with a target URL. The renderer will strip headers, footers, and tracking scripts automatically.

#\_ Request (cURL){ } Response

BASHcontent\_copyCopy

```
curl -X POST https://2md.traylinx.com/api/convert \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/article",
    "downloadImages": true,
    "frontMatter": true
  }'
```

### Example: SPA with Extended Wait

POST/api/convert

Use a longer waitMs for JavaScript-heavy single-page apps that need extra rendering time.

#\_ Request (cURL){ } Response

BASHcontent\_copyCopy

```
curl -X POST https://2md.traylinx.com/api/convert \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://app.example.com/dashboard",
    "waitMs": 20000,
    "downloadImages": false,
    "frontMatter": false,
    "maxImageSizeMb": 5
  }'
```

### Integrate into Your Code

JavaScript

```javascript
const res = await fetch('https://2md.traylinx.com/api/convert', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://example.com/article',
    format: 'json',
    method: 'auto'
  })
});
const { markdown, tokens, method } = await res.json();
console.log(`Converted via ${method} — ${tokens.md} tokens`);
```

Python

```python
import requests

res = requests.post('https://2md.traylinx.com/api/convert', json={
    'url': 'https://example.com/article',
    'format': 'json',
    'method': 'auto'
})
data = res.json()
print(f"Converted via {data['method']} — {data['tokens']['md']} tokens")
```

### 🚀 Get Your Free SwitchAI API Key

SwitchAI is Traylinx's unified LLM router — one key, access to GPT, Claude, Llama, Mistral, and more. Sign up in 30 seconds and start generating intelligent Skill Bundles immediately.

[Create Free Account →](https://traylinx.com/switchai)

Pay-as-you-go pricing · No monthly minimums · Your key, your data

## Frequently Asked Questions

Common questions about single-page conversion.

Can it convert JavaScript-heavy Single Page Applications (SPAs)?+

Yes. When using `method=browser` (or `method=auto` which falls back to browser when needed), a full headless Chromium browser renders the page via Puppeteer before extraction. This handles React, Vue, Next.js, and Angular apps. Fine-tune the waitMs parameter to allow extra time for async API calls. For simpler pages, `method=static` is much faster and avoids browser overhead entirely.

What does front matter contain and why is it useful?+

When enabled, front matter extracts the page title, author, date, and meta description into a YAML block at the top of your Markdown file. This is invaluable for AI agents that need structured metadata without parsing the full document.

How much do you reduce the token count compared to raw HTML?+

Typically 70-85% reduction. The Readability algorithm strips navigation menus, footers, cookie banners, ads, inline scripts, and tracking pixels — returning only the core content payload.

Are images downloaded locally?+

Yes, when downloadImages is enabled (the default). The pipeline fetches all referenced images, saves them locally, and rewrites Markdown image links to point to the local copies. Use maxImageSizeMb to skip oversized assets.

Can I cancel a conversion mid-way?+

Yes. Close the tab, cancel via the UI button, or disconnect your HTTP client. The server instantly detects the disconnect and gracefully terminates the headless browser process, freeing all resources.

## Engineered for AI Data Pipelines

Raw HTML wastes tokens and confuses LLMs. HTML2MD automatically cleans, structures, and optimizes web content, delivering pristine Markdown that maximizes your context window and reduces AI hallucinations.

STEP 1

### Smart Method Selection

The `auto` method intelligently tries the fastest extraction path first: HTTP content negotiation (`native`), then lightweight static parsing (`static`), and only falls back to full headless Chromium (`browser`) when needed — maximizing speed without sacrificing quality.

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
