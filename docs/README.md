# html2md

High-fidelity HTML-to-Markdown converter with batch processing and site crawling.

## Quick Start

```bash
npm install
./bin/html2md https://example.com
```

## Features

- **Interactive CLI** — menu-driven terminal UI, no flags to memorize
- **Advanced Stealth** — bypasses WAFs/Cloudflare using Puppeteer Extra Stealth & rotated UAs
- **Smart URL Normalization** — smoothly handles redirects and `www.` subdomains internally
- **Single URL** — convert any web page to Markdown with near-100% fidelity
- **Batch mode** — convert dozens of URLs in parallel
- **Crawl mode** — discover all pages on a domain and convert them all
- **Tree view** — visualize site structure without converting
- **JS rendering** — Puppeteer handles React, Next.js, Angular, and other SPAs
- **Smart extraction** — Readability.js primary, Python Trafilatura fallback
- **Image downloading** — downloads and rewrites image paths
- **GFM support** — tables, strikethrough, task lists, fenced code blocks
- **YAML front matter** — optional metadata header
- **Export Formats** — Download site maps in `.zip`, `.txt`, `.md`, or `.json` formats
- **REST API** — Full suite including `/api/convert`, `/api/batch`, `/api/crawl`, `/api/file2md`, `/api/agentify`, and extensive `/api/jobs` management. Features active keep-alive architecture & cross-tab process cancellation.
- **Path-Based Web UI** — A fast, SPA frontend with clean, SEO-friendly routes (`/crawl`, `/map`, `/agentify`, `/file2md`) for easy bookmarking and AI crawler discovery.
- **Agentify Pipeline** — Convert entire websites into structured, AI-ready Skill Bundles via the Web UI (`/agentify`) or REST API.
- **URL-Prepend Shortcut** — Instantly parse any page or media file by prepending `https://2md.traylinx.com/` to the URL.
- **Async & Email Notifications** — Fire-and-forget large batch crawls and receive a branded email with a secure, 72-hour ZIP download link.
- **Agentic Uploads (File2MD)** — Upload PDFs, images, and audio/video media (MP4, MP3, WAV, YouTube) via the Web UI (`/file2md`) for conversion using Vision models and intelligent Whisper transcription extraction.
- **NDJSON Streaming** — Stream real-time progress events from the API or CLI using `--stream`.
- **AI Agent Discovery** — `/llms.txt` and `/llms-full.txt` let AI agents auto-discover and use the API ([spec](https://llmstxt.org)), alongside `/skills/:skillName.md` for bundle retrieval.

## Usage

```bash
# Interactive mode (guided menu)
npm run interactive

# Single URL
./bin/html2md https://example.com

# Batch (file with one URL per line)
./bin/html2md --batch urls.txt

# Crawl entire site
./bin/html2md --crawl https://docs.example.com --depth 3

# View site tree only
./bin/html2md --crawl https://docs.example.com --tree-only

# Start API server
npm start
```

## Documentation

- [Getting Started](docs/getting-started.md)
- [Interactive CLI](docs/interactive-cli.md)
- [CLI Reference](docs/cli-reference.md)
- [API Reference](docs/api-reference.md)
- [Architecture](docs/architecture.md)
- [Deployment](docs/deployment.md)

## Tech Stack

| Component          | Tool                                           |
| ------------------ | ---------------------------------------------- |
| Page rendering     | Puppeteer (headless Chrome)                    |
| Content extraction | Readability.js + Trafilatura (Python fallback) |
| HTML → Markdown    | Turndown.js + GFM plugin                       |
| API server         | Express.js                                     |
| Concurrency        | p-queue                                        |
| Container          | Docker (Node 22 + Chrome + Python 3)           |

## License

MIT
