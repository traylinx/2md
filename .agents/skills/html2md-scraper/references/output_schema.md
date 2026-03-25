# Output Schema Reference

## Directory Structure

### Site-Grouped Mode (`--crawl`)

```
jobs/
└── <domain.com>/
    ├── site.json                    # Aggregated metadata for all pages
    ├── hashes.json                  # SHA-256 cache for incremental crawls
    └── pages/
        ├── _root/                   # The "/" homepage
        │   ├── page.json            # Page-level metadata
        │   ├── input/
        │   │   ├── raw.html         # Original HTTP response body
        │   │   ├── rendered.html    # Fully rendered DOM after JS execution
        │   │   └── screenshot.png   # Full-page screenshot
        │   ├── processing/
        │   │   ├── extracted.md     # Raw extracted markdown (before polishing)
        │   │   └── log.txt          # Step-by-step conversion log
        │   └── output/
        │       ├── page.md          # ✅ FINAL clean Markdown (read this!)
        │       └── assets/          # Downloaded images and media
        │           └── manifest.json
        ├── about/
        │   ├── page.json
        │   ├── input/...
        │   ├── processing/...
        │   └── output/...
        └── docs--getting-started/   # Nested paths use -- as separator
            └── ...
```

### Standalone Mode (no `--crawl`)

```
jobs/
└── <domain-com-slug>/
    ├── job.json
    ├── input/...
    ├── processing/...
    └── output/
        └── page.md
```

---

## site.json Schema

The `site.json` is the single source of truth after a crawl. Located at `jobs/<domain>/site.json`.

```json
{
  "hostname": "example.com",
  "createdAt": "2026-03-03T14:50:47.267Z",
  "lastCrawledAt": "2026-03-03T14:50:47.271Z",
  "pageCount": 12,
  "tree": "/  # Homepage\n├── about  # About\n└── docs  # Docs\n",
  "depth": 3,
  "maxPages": 300,
  "files": [
    {
      "url": "https://example.com/",
      "slug": "_root",
      "files": {
        "raw": "input/raw.html",
        "rendered": "input/rendered.html",
        "screenshot": "input/screenshot.png",
        "extracted": "processing/extracted.md",
        "log": "processing/log.txt",
        "markdown": "output/page.md",
        "assets": ["output/assets/manifest.json"]
      },
      "htmlHash": "ee696f7b468eac4596e28378c675c67f...",
      "lastFetched": null,
      "lastConverted": "2026-03-03T14:50:58.658Z",
      "status": "created",
      "steps": {},
      "metadata": {}
    }
  ]
}
```

### Key Fields

| Field       | Type   | Description                       |
| ----------- | ------ | --------------------------------- |
| `hostname`  | string | Domain name                       |
| `pageCount` | number | Total unique pages                |
| `tree`      | string | Visual ASCII tree of the site     |
| `files`     | array  | Array of page objects (see below) |

### Page Object Fields

| Field              | Type         | Description                                 |
| ------------------ | ------------ | ------------------------------------------- |
| `url`              | string       | Original URL                                |
| `slug`             | string       | Directory name under `pages/`               |
| `files.raw`        | string\|null | Path to raw HTTP HTML                       |
| `files.rendered`   | string\|null | Path to JS-rendered HTML                    |
| `files.screenshot` | string\|null | Path to full-page screenshot                |
| `files.extracted`  | string\|null | Path to raw extracted markdown              |
| `files.log`        | string\|null | Path to conversion log                      |
| `files.markdown`   | string\|null | Path to **final clean Markdown**            |
| `files.assets`     | array        | Paths to downloaded media files             |
| `htmlHash`         | string       | SHA-256 hash of rendered HTML (for caching) |

> **All file paths in `files` are relative** to the page directory (`pages/<slug>/`). To get the absolute path, join: `jobs/<domain>/pages/<slug>/<relative-path>`.

> **All keys are always present.** Missing files have `null` values. Empty asset arrays are `[]`. This guarantees a predictable schema without needing to check for key existence.

---

## page.json Schema

Each page directory contains a `page.json` with identical structure to the objects in `site.json.files[]`:

```json
{
  "url": "https://example.com/about",
  "slug": "about",
  "files": {
    "raw": "input/raw.html",
    "rendered": "input/rendered.html",
    "screenshot": "input/screenshot.png",
    "extracted": "processing/extracted.md",
    "log": "processing/log.txt",
    "markdown": "output/page.md",
    "assets": []
  },
  "htmlHash": "66ef9b8402097...",
  "lastFetched": null,
  "lastConverted": "2026-03-03T14:52:42.323Z",
  "status": "created",
  "steps": {},
  "metadata": {}
}
```

---

## URL-to-Slug Mapping

| URL Path                | Slug                    |
| ----------------------- | ----------------------- |
| `/`                     | `_root`                 |
| `/about`                | `about`                 |
| `/docs/getting-started` | `docs--getting-started` |
| `/api/v2/auth`          | `api--v2--auth`         |
| `/page?id=5`            | `page_id_5`             |

Rules: Forward slashes become `--`, query params become `_key_value`, special characters are stripped.
