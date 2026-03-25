# CLI Reference

## Synopsis

> **Note on Advanced Features:** This CLI orchestrator focuses on headless browser extraction containing HTML-to-Markdown pipelines (`convert`, `batch`, `crawl`). The advanced **Agentify Pipeline** and **File2MD** (PDF/Media Uploads with Vision and Whisper models) modules are exclusively accessible via the completely distinct Web UI and REST API.

```text
bin/html2md [options] <url|file>
bin/html2md --batch <urls.txt>
bin/html2md --crawl <url> [--depth N]
bin/html2md --crawl <url> --tree-only
bin/interactive.js
```

## Modes

### Single URL

Convert a single URL or local HTML file:

```bash
./bin/html2md https://example.com
./bin/html2md ./local-page.html
```

### Batch Mode

Convert multiple URLs in parallel from a text file (one URL per line):

```bash
./bin/html2md --batch urls.txt
```

**`urls.txt` format:**

```text
https://example.com
https://dev.to/some-article
https://github.com/some/repo
```

### Crawl Mode

Discover all pages on a domain via BFS link crawling, then convert them all:

```bash
./bin/html2md --crawl https://docs.example.com --depth 3
```

The crawler first checks for `sitemap.xml` (instant) before falling back to BFS crawling.

## Options

| Flag                    | Description                         | Default                   |
| ----------------------- | ----------------------------------- | ------------------------- |
| `-o, --output DIR`      | Custom output directory             | Auto-generated in `jobs/` |
| `-d, --download-images` | Download referenced images          | `true`                    |
| `--no-images`           | Skip image downloading              | -                         |
| `--front-matter`        | Add YAML front matter to output     | `false`                   |
| `-w, --wait MS`         | Puppeteer JS rendering wait time    | `10000`                   |
| `--max-image-size MB`   | Skip images larger than N MB        | `10`                      |
| `--concurrency N`       | Parallel jobs for batch/crawl       | `3`                       |
| `--depth N`             | Max crawl depth                     | `3`                       |
| `--max-pages N`         | Max pages to crawl                  | `300`                     |
| `--tree-only`           | Show site tree but skip conversion  | `false`                   |
| `--stream`              | Output NDJSON events to stdout      | `false`                   |
| `--output-format FMT`   | Output format (text, json, stream)  | `text`                    |
| `--site-dir`            | Group pages under specific site dir | -                         |
| `-q, --quiet`           | Suppress progress output            | `false`                   |
| `-v, --verbose`         | Show detailed script output         | `false`                   |
| `-h, --help`            | Show help                           | -                         |

## Examples

### Convert with YAML front matter

```bash
./bin/html2md https://blog.example.com/post --front-matter
```

Output:

```yaml
---
title: "My Blog Post"
source: "https://blog.example.com/post"
date: "2026-03-03"
---

# My Blog Post
...
```

### Convert without images

```bash
./bin/html2md https://example.com --no-images
```

### Batch with custom concurrency

```bash
./bin/html2md --batch urls.txt --concurrency 5 --front-matter
```

### Crawl a docs site

```bash
./bin/html2md --crawl https://docs.stripe.com --depth 2 --max-pages 50
```

### View site structure without converting (Tree-only)

```bash
./bin/html2md --crawl https://example.com --tree-only
```

### Quiet mode (for scripts/CI)

```bash
./bin/html2md https://example.com -q -o ./output
```

### Stream NDJSON progress to another process

```bash
./bin/html2md https://example.com --stream > output.ndjson
```

### Interactive mode

```bash
npm run interactive
```

Launches a guided menu where you select the mode and enter options interactively. See [Interactive CLI](interactive-cli.md) for details.

## Exit Codes

| Code | Meaning                                         |
| ---- | ----------------------------------------------- |
| `0`  | Success                                         |
| `1`  | Error (invalid input, fetch/conversion failure) |
