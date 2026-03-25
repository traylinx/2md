# Interactive CLI

The interactive CLI provides a guided, menu-driven experience — no flags to memorize.

## Start

```bash
npm run interactive
# or
node bin/interactive.js
```

## Main Menu

> **Note on Advanced Features:** The advanced **Agentify Pipeline** and **File2MD** (PDF/Media Uploads) modules are exclusive to the Web UI and REST API. To use these features, select `6. Start API Server` and open `http://localhost:8222` in your browser.

```text
  html2md  — Interactive Mode
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  1. 🌐  Convert URL         Convert a single web page to Markdown
  2. 📄  Convert File        Convert a local HTML file
  3. 📦  Batch Convert       Convert multiple URLs from a file
  4. 🕷️  Crawl Site          Discover and convert all pages on a domain
  5. 🌳  View Site Tree      Show site structure without converting
  6. 🚀  Start API Server    Launch the REST API on localhost
  
  0. 👋  Exit

  › Choose (0): _
```

## Option Details

### 1. Convert URL

Prompts for:

- **URL** — the web page to convert
- **Front matter** — add YAML metadata header (y/N)
- **Skip images** — skip image downloading (y/N)
- **Output directory** — custom output path or `auto`

### 2. Convert File

Prompts for:

- **File path** — path to a local `.html` file
- **Front matter** — add YAML metadata header (y/N)

### 3. Batch Convert

Prompts for:

- **URLs file** — path to a `.txt` file with one URL per line
- **Concurrency** — number of parallel conversions (default: 3)
- **Front matter** — add YAML metadata header (y/N)

### 4. Crawl Site

Prompts for:

- **Site URL** — root URL to start crawling
- **Max depth** — how deep to follow links (default: 3)
- **Max pages** — page limit (default: 300)
- **Front matter** — add YAML metadata header (y/N)
- **Skip images** — skip image downloading (y/N)

### 5. View Site Tree

Shows the site structure as a visual tree without converting any pages. Useful for previewing a site before committing to a full crawl.

Prompts for:

- **Site URL** — root URL to crawl
- **Max depth** — how deep to follow links (default: 3)
- **Max pages** — page limit (default: 300)

Example output:

```text
/  # My Docs Site
├── getting-started  # Getting Started
├── guides
│   ├── installation  # Installation Guide
│   └── configuration  # Configuration
└── api
    ├── endpoints  # API Endpoints
    └── authentication  # Authentication
```

### 6. Start API Server

Launches the Express REST API server on `localhost:8222` (or the port set via `PORT` environment variable). Press `Ctrl+C` to stop.

## Exiting

Type `0`, `q`, or `exit` at the menu prompt to quit.

## Web UI Alternative

For a graphical interface, start the API server and open `http://localhost:8222` in your browser. The Web UI provides the same conversion and crawl capabilities with a visual site tree and page selection.
