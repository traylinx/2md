# Conversion Pipeline & Caching

## The 5-Step Pipeline

Every URL goes through 5 sequential steps. Each step is a separate Node.js script executed via `spawnSync` with a **120-second hard timeout**.

```
URL → [1. Fetch] → [2. Cache Check] → [3. Extract] → [4. Download Images] → [5. Polish] → page.md
```

### Step 1: Fetch (`scripts/fetch.js`)

Launches headless Chrome via Puppeteer and navigates to the URL.

**Produces:**
- `input/raw.html` — The original HTTP response body (before JS execution)
- `input/rendered.html` — The fully rendered DOM after all JavaScript has executed
- `input/screenshot.png` — A full-page screenshot (15-second timeout, skipped if page is too long)

**Fallback:** If Puppeteer crashes, falls back to a simple HTTP GET request (no JS rendering).

**Configuration:**
- `--wait MS` controls how long to wait for JavaScript to settle (default: 10000ms)
- `waitUntil: "networkidle2"` ensures most network requests have completed

### Step 2: Cache Check (orchestrator logic in `bin/html2md`)

Computes a SHA-256 hash of the newly fetched `rendered.html` and compares it against the hash stored in `page.json` from the previous run.

**If hashes match (Cache Hit):**
- Steps 3, 4, and 5 are completely skipped
- The existing `output/page.md` is reused as-is
- Terminal shows `(cached)` next to the URL
- Emits a `cache_hit` event in NDJSON streaming mode

**If hashes differ (Cache Miss):**
- Proceeds to Steps 3–5
- Updates `page.json` with the new hash after completion
- Emits a `cache_miss` event in NDJSON streaming mode

### Step 3: Extract (`scripts/extract.js`)

Parses `input/rendered.html` using Turndown (HTML-to-Markdown converter) with custom rules for:
- Code blocks and syntax highlighting
- Tables
- Images with alt text
- Heading hierarchy preservation
- Link normalization

**Produces:** `processing/extracted.md` — Raw markdown extraction (may contain artifacts)

### Step 4: Download Images (`scripts/downloadImages.js`)

Scans the extracted markdown for image references and downloads them locally.

**Produces:**
- `output/assets/` directory with downloaded images
- `output/assets/manifest.json` listing all downloaded files

**Configuration:**
- `--no-images` skips this step entirely
- `--max-image-size MB` limits individual file downloads (default: 10MB)

### Step 5: Polish (`scripts/polish.js`)

Cleans up the raw extracted markdown by:
- Removing duplicate headings
- Fixing broken links
- Removing navigation artifacts and boilerplate
- Computing quality metrics

**Produces:**
- `output/page.md` — The final, clean Markdown file
- Quality metrics in the JSON result (headings count, links, images, word count, etc.)

---

## Timeout Architecture

| Component            | Timeout             | Kill Signal              |
| -------------------- | ------------------- | ------------------------ |
| `spawnSync` per step | 120 seconds         | `SIGKILL`                |
| `page.screenshot()`  | 15 seconds          | `Promise.race` rejection |
| `page.goto()`        | `waitMs + 10000` ms | Puppeteer timeout error  |
| REST API `exec()`    | 600 seconds         | Node.js `exec` timeout   |

If any step exceeds its timeout, the orchestrator marks it as failed and continues with the next URL in the batch.

---

## Caching Details

### Where Hashes Are Stored
- **Per-page:** `page.json` contains the `htmlHash` field
- **Per-site:** `hashes.json` at the site root maps `slug → hash` for quick lookup

### Cache Invalidation
The cache is automatically invalidated when:
- The website's HTML content changes (different SHA-256 hash)
- The `page.json` or `hashes.json` file is manually deleted
- The job directory is removed (`rm -rf jobs/<domain>`)

### Re-crawl Behavior
Running `--crawl` on the same domain multiple times:
1. **Fetches** fresh HTML for every discovered page (always overwrites `input/`)
2. **Compares** the new HTML hash against the stored hash
3. **Skips** extraction + polishing if the hash matches
4. **Rebuilds** `site.json` at the end with updated metadata for all pages

This means `input/raw.html`, `input/rendered.html`, and `input/screenshot.png` are always overwritten on every run, but `output/page.md` is only overwritten when the page content actually changes.
