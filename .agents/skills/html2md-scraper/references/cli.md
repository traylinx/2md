# CLI Reference

## Executable
```
/Users/sebastian/Projects/pruebas/html2md/bin/html2md
```

## Modes

> **AgentNote:** This CLI executable strictly handles headless DOM extraction pipelines. The advanced **Agentic Upload Engines** (File2MD) and **Agentify Pipelines** exist as separate modules exposed through the Web UI and REST API. Do not look for them as CLI flags here.

### Single URL/File Conversion
```bash
bin/html2md <url|file>
```
Converts a single URL or local HTML file. Creates an isolated job folder.

### Batch Conversion
```bash
bin/html2md --batch <urls.txt>
```
Reads a text file with one URL per line and processes all of them with configurable concurrency.

### Site Crawl (Recommended)
```bash
bin/html2md --crawl <url> --depth <N>
```
Discovers pages by following links from the seed URL up to depth N. All pages are grouped under `jobs/<domain>/pages/<slug>/`.

- `--depth 0` — Only the exact URL provided (no link following)
- `--depth 1` — The target page + all pages it links to
- `--depth 3` — Standard for full documentation sites (default)

### Tree-Only Preview
```bash
bin/html2md --crawl <url> --depth 3 --tree-only
```
Discovers and prints the site tree structure without performing any conversion. Useful for previewing what will be crawled.

## Options Reference

| Flag                         | Default        | Description                          |
| ---------------------------- | -------------- | ------------------------------------ |
| `-o, --output DIR`           | auto-generated | Custom output directory              |
| `-d, --[no-]download-images` | `true`         | Download referenced images           |
| `--no-images`                | —              | Alias for `--no-download-images`     |
| `--front-matter`             | `false`        | Add YAML front matter to output      |
| `-w, --wait MS`              | `10000`        | Wait time for JS rendering (ms)      |
| `--max-image-size MB`        | `10`           | Max image file size in MB            |
| `--concurrency N`            | `3`            | Parallel conversions for batch/crawl |
| `--depth N`                  | `3`            | Max crawl depth                      |
| `--max-pages N`              | `300`          | Max pages to crawl                   |
| `--tree-only`                | `false`        | Show tree, skip conversion           |
| `--stream`                   | `false`        | Output NDJSON events to stdout       |
| `--output-format FORMAT`     | `text`         | `text`, `json`, or `stream-json`     |
| `-q, --quiet`                | `false`        | Suppress progress output             |
| `-v, --verbose`              | `false`        | Show detailed output                 |

## Output Formats

### `text` (default)
Human-readable progress bars, emoji status indicators, and a summary table.

### `json`
Quiet mode. Outputs a single JSON object at the end with the result summary.

### `stream-json` (or `--stream`)
Outputs NDJSON (newline-delimited JSON) events in real-time. Each line is a valid JSON object with an `event` field. Events include:
- `start` — Crawl/batch started
- `step` — Individual conversion step completed or failed
- `job_complete` — Single page finished
- `cache_hit` / `cache_miss` — SHA-256 cache result
- `site_metadata` — Final event with `siteDir` and `siteJson` paths
- `complete` — Overall batch finished with stats

## Examples

### Fetch one page with domain grouping
```bash
bin/html2md --crawl https://docs.example.com/api/auth --depth 0
```

### Crawl full docs site
```bash
bin/html2md --crawl https://docs.example.com --depth 3 --max-pages 100
```

### Preview site structure before crawling
```bash
bin/html2md --crawl https://example.com --depth 2 --tree-only
```

### Convert a local HTML file
```bash
bin/html2md ./path/to/page.html -o ./my-output
```

### NDJSON streaming for programmatic consumption
```bash
bin/html2md --crawl https://example.com --depth 1 --stream
```
