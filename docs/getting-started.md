# Getting Started

## Prerequisites

- **Node.js** 18+ (tested on 22.x)
- **Python 3** (optional, for Trafilatura fallback)

## Installation

```bash
# Clone the repository
git clone <repo-url>
cd html2md

# Install Node.js dependencies
npm install

# (Optional) Set up Python fallback for difficult pages
python3 -m venv venv
source venv/bin/activate
pip install trafilatura
```

## Your First Conversion

```bash
./bin/html2md https://example.com
```

Output:

```text
  html2md — HTML to Markdown Converter
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Job: 2026-03-03_10-36-17_example-com
  Source: https://example.com

  ⏳ Fetch...
  ✅ Fetch (7.96s)
  ⏳ Extract...
  ✅ Extract (2.54s)
  ⏳ Convert...
  ✅ Convert (0.22s)
  ⏳ Download images...
  ✅ Download images (0.10s)
  ⏳ Polish...
  ✅ Polish (0.10s)

  ✨ Done!
  Output: ~/.2md/jobs/2026-03-03_10-36-17_example-com/output/page.md
  Size: 0.3 KB · 31 words
  Structure: 1 headings, 0 lists, 1 links, 0 images
```

## Converting a Local HTML File

```bash
./bin/html2md ./my-page.html
```

## Quick Browser Extract (URL-Prepend)

If you have the API server running (`npm start`), you can instantly convert any URL from your browser by navigating to:

```text
http://localhost:8222/https://example.com
```

This bypasses the UI and returns the raw Markdown or JSON result immediately.

## Job Folder Structure

Each conversion creates an isolated job folder in the configured `JOBS_DIR` (defaults to `~/.2md/jobs`):

```text
~/.2md/jobs/2026-03-03_10-36-17_example-com/
├── input/
│   ├── raw.html            # Original HTML (before JS rendering)
│   ├── rendered.html       # Full rendered HTML (after Puppeteer)
│   └── screenshot.png      # Page screenshot
├── processing/
│   ├── extracted.html      # Clean content (after extraction)
│   ├── extracted.md        # (If Trafilatura was used)
│   └── log.txt             # Processing log
├── output/
│   ├── page.md             # Final Markdown output
│   └── assets/             # Downloaded images
└── job.json                # Job metadata and quality metrics
```

## Interactive Mode

Prefer a guided experience? Use the interactive CLI:

```bash
npm run interactive
```

A menu lets you pick the mode and enter options step by step — no flags to memorize. See [Interactive CLI](interactive-cli.md) for more.

## Viewing a Site Tree

Before converting an entire site, preview its structure:

```bash
./bin/html2md --crawl https://docs.example.com --tree-only
```

This crawls the site and displays a visual tree without converting any pages:

```text
/  # My Docs
├── getting-started  # Getting Started
├── guides
│   ├── installation  # Installation
│   └── configuration  # Config Guide
└── api
    └── endpoints  # API Endpoints
```

## Creating an AI Skill Bundle (Agentify)

The **Agentify Pipeline** allows you to discover and convert an entire website into a structured, AI-ready Skill bundle (producing `llms.txt`, `SKILL.md`, and markdown pages).

This is an advanced feature available exclusively via the **Web UI** and **REST API**.

1. Start the API server: `npm start`
2. Open the Web UI in your browser (e.g., `http://localhost:8222/agentify`).
3. Enter the target URL, configure your options (like max pages), enter your SwitchAI API key, and click **Agentify Site**.

## Converting Files (File2MD)

Need to convert a local PDF, DOCX, image, or YouTube video to Markdown? Use the **File2MD** module. Like Agentify, this requires the Traylinx File Engine and is available via the **Web UI**.

1. Start the API server: `npm start`
2. Open the Web UI in your browser (e.g., `http://localhost:8222/file2md`).
3. Drag and drop your file, enter your SwitchAI API key, and click **Process**.

## Environment Configuration

You can customize the application's behavior and set up advanced LLM features using a `.env` file in the root directory.

| Variable                     | Default       | Description                                                                |
| ---------------------------- | ------------- | -------------------------------------------------------------------------- |
| `JOBS_DIR`                   | `~/.2md/jobs` | Storage location for all processed jobs, registries, and downloaded assets |
| `UPLOADS_DIR`                | OS Temp Dir   | Temporary storage location for file uploads                                |
| `PORT`                       | `8222`        | API server port                                                            |
| `SWITCHAI_API_KEY`           | -             | Primary API key for internal routing                                       |
| `AGENTIFY_LLM_BASE_URL`      | -             | Base URL for the Agentify pipeline's LLM provider                          |
| `AGENTIFY_LLM_API_KEY`       | -             | API key for the Agentify pipeline                                          |
| `AGENTIFY_LLM_MODEL`         | -             | Model to use during Agentify extraction                                    |
| `AGENTIFY_MAX_PAGES`         | `50`          | Default maximum crawl depth for Agentify                                   |
| `AGENTIFY_BYOK`              | `false`       | Bring-your-own-key toggle for API users                                    |
| `FILE2MD_ENHANCE_MODEL`      | -             | Vision model used during File2MD enhancement                               |
| `AGENTIC_UPLOAD_ENGINES_URL` | -             | Base URL for remote Agentic Upload processing                              |

## Next Steps

- [Interactive CLI](interactive-cli.md) — guided menu-driven mode
- [CLI Reference](cli-reference.md) — all flags and options
- [API Reference](api-reference.md) — REST API endpoints
- [Architecture](architecture.md) — how the pipeline works
- [Deployment](deployment.md) — Docker, Railway, Netlify
