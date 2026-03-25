---
name: html2md-scraper
description: A powerful tool to scrape, render, and convert any URL or entire website into clean Markdown using headless Chrome (Puppeteer). Use when you need to read a webpage, crawl documentation sites, extract text from JavaScript-heavy apps (React, Next.js, Vue), convert HTML files to Markdown, or build a knowledge base from web content. Supports single-page fetch, deep multi-level site crawling with incremental SHA-256 caching, full-page screenshots, image downloading, and both CLI and REST API interfaces.
---

# html2md-scraper

Convert any URL or entire website into clean, LLM-friendly Markdown. Uses Puppeteer (headless Chrome) outfitted with advanced stealth plugins to fully render JavaScript and bypass Cloudflare/WAF anti-bot mechanisms before extracting content. It works on modern SPAs, SSR apps, and static sites alike.

**Location:** `/Users/sebastian/Projects/pruebas/html2md`
**Executable:** `/Users/sebastian/Projects/pruebas/html2md/bin/html2md`

## When to Use

- Read the content of a specific webpage or URL
- Crawl an entire documentation site, blog, or domain
- Extract text from JavaScript-rendered websites (React, Next.js, Vue)
- Convert local `.html` files into Markdown
- Build a persistent, cached knowledge base from web content
- Take full-page screenshots of websites

## Installation & Setup

If you are running this tool for the very first time on a new system (or just cloned the repository), you must install its dependencies before executing the commands below:

```bash
cd /Users/sebastian/Projects/pruebas/html2md
npm install
```
*(Puppeteer will automatically download a compatible Chromium binary during `npm install`.)*

## Quick Start

### Fetch a Single Page (Recommended)
```bash
/Users/sebastian/Projects/pruebas/html2md/bin/html2md --crawl <URL> --depth 0
```
Fetches only that one page and places it inside the domain-grouped `jobs/<domain>/` folder. Outputs the path to `site.json` at the end.

### Crawl an Entire Site
```bash
/Users/sebastian/Projects/pruebas/html2md/bin/html2md --crawl <URL> --depth 3
```
Discovers all linked pages up to depth 3 and converts each one. Uses SHA-256 caching to skip unchanged pages on re-runs.

### Isolated One-Off Fetch (Legacy)
```bash
/Users/sebastian/Projects/pruebas/html2md/bin/html2md <URL>
```
Converts a single URL without domain grouping. The output path is printed directly.

## How to Read Results

**Critical:** Never parse Markdown from terminal stdout. Always read the generated files from disk.

### For `--crawl` commands (recommended):
1. Wait for the command to complete
2. Read the path printed after `Site Metadata:` at the bottom of the output
3. Open that `site.json` file — it contains a `files` array listing every page
4. For each page object, read `pages/<slug>/output/page.md` relative to the site directory

### For standalone commands (no `--crawl`):
1. The output path is printed after `Output:` in the terminal
2. Read the `.md` file at that path directly

**For complete CLI reference, flags, and options:** See [📋 CLI Reference](references/cli.md)
**For REST API integration:** See [🌐 REST API Reference](references/api.md)
**For understanding the output file structure:** See [📂 Output Schema](references/output_schema.md)
**For the conversion pipeline and caching:** See [⚙️ Pipeline & Caching](references/pipeline.md)

## Key Behaviors

### Incremental Caching
When re-crawling a domain, the tool computes a SHA-256 hash of each page's rendered HTML. If the hash matches the previous crawl, it skips extraction and reuses the existing Markdown. This saves significant time on large sites.

### Timeouts
Each conversion step has a hard 120-second timeout. Full-page screenshots have a 15-second timeout. If a page hangs or fails, the tool skips it and continues with the remaining pages.

### Domain Grouping
All pages from the same domain are stored under `jobs/<domain.com>/pages/<slug>/`. Running the tool multiple times on different subpages of the same domain will accumulate all results in the same folder without duplicating data.

### Download Images
By default, the tool downloads images referenced in the page. Use `--no-images` to disable this. Downloaded images are stored in `output/assets/`.

## Web UI

A graphical frontend is available at `http://localhost:8222` when the API server is running. Start it with:

```bash
cd /Users/sebastian/Projects/pruebas/html2md && node server.js
```

The Web UI offers keep-alive tab routes:
- **`/`** — paste a URL and get Markdown instantly, stream logs live, export results.
- **`/crawl`** — discover all pages on a site, select which ones to convert, and batch-process them. Supports **Email Notifications** for large async batches.
- **`/map`** — generate visual sitemaps and download them as `.md`, `.txt`, or `.json`.
- **`/agentify`** — agentify an entire site into a skill bundle.
- **`/file2md`** — convert local files (PDF, images, media) into Markdown using OCR and Whisper.

**Pro Tip:** You can also use the **URL-Prepend** shortcut in your browser to instantly convert a page or file without opening the UI. Just prepend `https://2md.traylinx.com/` to any URL (e.g., `https://2md.traylinx.com/https://example.com`).

## REST API: Response Formats

All core endpoints accept a `format` parameter:

| Value      | Use When                                                   |
| ---------- | ---------------------------------------------------------- |
| `json`     | **Recommended for agents.** Returns clean structured JSON. |
| `markdown` | When you only need the raw Markdown text (`/api/convert`). |
| `stream`   | When displaying live progress (Web UI default).            |

## REST API: Conversion Methods

Control how the server extracts content via the `method` parameter:

| Value     | Behavior                                                               |
| --------- | ---------------------------------------------------------------------- |
| `auto`    | Default. Tries `native` → `static` → `browser` in order of efficiency. |
| `native`  | HTTP content negotiation — fastest if the server supports it.          |
| `static`  | cheerio + Readability.js — no browser needed, very fast.               |
| `browser` | Full headless Puppeteer — use only for JS-heavy SPAs.                  |

## REST API: Async Workflows

Long-running endpoints (`/api/batch`, `/api/crawl`, `/api/agentify`) accept:
- `"async": true` → returns `202 Accepted` immediately with a `job_id`
- `"email": "you@example.com"` → branded email from `noreply@traylinx.com` with a secure download link (valid 72 hours)
- `"webhook_url": "https://..."` → HTTP POST callback on completion
- Poll job status: `GET /api/jobs/:id`
- Token-signed downloads: `GET /api/download/job/:id?token=...` (included in email and webhook payloads)

## Platform Limits & Defaults

| Setting             | Default  | Description                          |
| ------------------- | -------- | ------------------------------------ |
| Max pages per crawl | 50       | Hard cap to prevent runaway crawls   |
| Crawl depth         | 3        | Link-levels deep from root URL       |
| Concurrency         | 3        | Parallel page fetches                |
| Download link TTL   | 72 hours | Signed ZIP links expire after 3 days |
| Image download      | off      | Toggle on to include images          |
| Screenshots         | off      | Full-page screenshot per page        |
| Front matter        | on       | YAML metadata header                 |

## Guidelines for Agents

- **Always use `format=json`** when consuming the REST API — never parse streaming output
- **Always use `--crawl <URL> --depth 0`** for single pages — this ensures proper domain grouping and caching
- **Always read results from disk** — never try to parse Markdown from stdout
- **Always check `site.json`** after crawl commands — it is the single source of truth for all discovered pages and their file locations
- **Expect `(cached)` responses** on repeat runs — this is correct behavior, not an error
- **Use `--depth 0`** when you only need one specific page to avoid crawling the entire site
- **Use `--tree-only`** to preview a site's structure before committing to a full crawl

