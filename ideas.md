Here is a complete, production-ready batch downloader script with concurrency control, smart JS detection, retries, and progress reporting.

## Install

```bash
npm install puppeteer p-queue chalk
# optional but recommended for concurrency
npm install puppeteer-cluster
```

## `batch-fetch.ts` — full script

```ts
import puppeteer, { Browser, Page } from 'puppeteer'
import PQueue from 'p-queue'
import fs from 'fs/promises'
import path from 'path'
import { URL } from 'url'

// ── Config ─────────────────────────────────────────────────────────────────────
const CONFIG = {
  outputDir: './input',
  concurrency: 3,          // parallel tabs — keep low to avoid memory issues[web:131][web:132]
  timeout: 30_000,         // ms per page
  retries: 2,              // retry on failure[web:132]
  waitUntil: 'networkidle0' as const,  // wait until no network for 500ms[web:120][web:132]
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function slugify(url: string): string {
  const u = new URL(url)
  return `${u.hostname}${u.pathname}`
    .replace(/[^a-z0-9]/gi, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
}

function isJSHeavy(html: string): boolean {
  return (
    html.includes('__NEXT_DATA__') ||       // Next.js
    html.includes('ng-version') ||           // Angular
    html.includes('data-reactroot') ||       // React
    html.includes('id="__nuxt"') ||          // Nuxt/Vue
    html.includes('window.__remixContext') ||// Remix
    html.split(/<[^>]+>/).join('').trim().length < 300  // near-empty body
  )
}

// ── Result types ───────────────────────────────────────────────────────────────
interface FetchResult {
  url: string
  file: string | null
  strategy: 'static' | 'puppeteer'
  status: 'ok' | 'failed'
  error?: string
  durationMs: number
}

// ── Static fetch (no browser, fast) ───────────────────────────────────────────
async function fetchStatic(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': CONFIG.userAgent },
    signal: AbortSignal.timeout(CONFIG.timeout)
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

// ── Puppeteer fetch (JS-rendered) ──────────────────────────────────────────────
async function fetchWithPuppeteer(browser: Browser, url: string): Promise<string> {
  const page: Page = await browser.newPage()
  try {
    await page.setUserAgent(CONFIG.userAgent)
    await page.setViewport({ width: 1280, height: 800 })

    // Block images/fonts/media — speeds up fetch, we only need HTML[web:139]
    await page.setRequestInterception(true)
    page.on('request', (req) => {
      const type = req.resourceType()
      if (['image', 'font', 'media', 'stylesheet'].includes(type)) {
        req.abort()
      } else {
        req.continue()
      }
    })

    await page.goto(url, {
      waitUntil: CONFIG.waitUntil,
      timeout: CONFIG.timeout
    })

    return await page.content()   // full rendered DOM after JS execution[web:113][web:115][web:120]
  } finally {
    await page.close()            // always release the tab[web:134][web:137]
  }
}

// ── Smart fetch: try static first, fallback to Puppeteer ──────────────────────
async function smartFetch(
  browser: Browser,
  url: string,
  attempt = 1
): Promise<{ html: string; strategy: 'static' | 'puppeteer' }> {
  try {
    const html = await fetchStatic(url)
    if (isJSHeavy(html)) {
      console.log(`  ⚙️  JS-heavy → Puppeteer: ${url}`)
      return { html: await fetchWithPuppeteer(browser, url), strategy: 'puppeteer' }
    }
    return { html, strategy: 'static' }
  } catch (err) {
    if (attempt <= CONFIG.retries) {
      console.warn(`  ⚠️  Retry ${attempt}/${CONFIG.retries}: ${url}`)
      await new Promise(r => setTimeout(r, 1000 * attempt))  // exponential backoff
      return smartFetch(browser, url, attempt + 1)
    }
    throw err
  }
}

// ── Save HTML to input/ folder ─────────────────────────────────────────────────
async function saveHtml(url: string, html: string): Promise<string> {
  await fs.mkdir(CONFIG.outputDir, { recursive: true })
  const filename = `${slugify(url)}.html`
  const filepath = path.join(CONFIG.outputDir, filename)
  await fs.writeFile(filepath, html, 'utf-8')
  return filename
}

// ── Process a single URL ───────────────────────────────────────────────────────
async function processUrl(browser: Browser, url: string): Promise<FetchResult> {
  const start = Date.now()
  try {
    const { html, strategy } = await smartFetch(browser, url)
    const file = await saveHtml(url, html)
    const duration = Date.now() - start
    console.log(`  ✅ [${strategy}] ${file} (${duration}ms)`)
    return { url, file, strategy, status: 'ok', durationMs: duration }
  } catch (err: any) {
    const duration = Date.now() - start
    console.error(`  ❌ FAILED: ${url} — ${err.message}`)
    return { url, file: null, strategy: 'static', status: 'failed', error: err.message, durationMs: duration }
  }
}

// ── Main batch runner ──────────────────────────────────────────────────────────
async function batchFetch(urls: string[]): Promise<FetchResult[]> {
  console.log(`\n🚀 Batch downloading ${urls.length} URLs (concurrency: ${CONFIG.concurrency})\n`)

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',    // required in Docker/Linux[web:113][web:115]
      '--disable-gpu',
      '--no-first-run',
    ]
  })

  // One browser, multiple tabs — much cheaper than one browser per URL[web:134][web:137][web:140]
  const queue = new PQueue({ concurrency: CONFIG.concurrency })
  const results: FetchResult[] = []

  for (const url of urls) {
    queue.add(async () => {
      const result = await processUrl(browser, url)
      results.push(result)
    })
  }

  await queue.onIdle()
  await browser.close()

  // ── Summary report ─────────────────────────────────────────────────────────
  const ok     = results.filter(r => r.status === 'ok')
  const failed = results.filter(r => r.status === 'failed')
  const static_ = ok.filter(r => r.strategy === 'static')
  const puppet  = ok.filter(r => r.strategy === 'puppeteer')
  const avgMs   = Math.round(ok.reduce((s, r) => s + r.durationMs, 0) / (ok.length || 1))

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ✅  Success : ${ok.length}/${urls.length}
 ⚙️   Puppeteer: ${puppet.length}   Static: ${static_.length}
 ❌  Failed  : ${failed.length}
 ⏱  Avg time: ${avgMs}ms/page
 📁  Output  : ${path.resolve(CONFIG.outputDir)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)

  if (failed.length) {
    console.log('\nFailed URLs:')
    failed.forEach(r => console.log(`  - ${r.url}: ${r.error}`))
  }

  // Save results manifest
  await fs.writeFile(
    path.join(CONFIG.outputDir, 'manifest.json'),
    JSON.stringify(results, null, 2),
    'utf-8'
  )

  return results
}

// ── Input: read URLs from file or CLI args ─────────────────────────────────────
async function loadUrls(): Promise<string[]> {
  const arg = process.argv [stackoverflow](https://stackoverflow.com/questions/76181003/reusing-browser-and-page-instance-in-puppeteer)

  if (!arg) {
    console.error('Usage: ts-node batch-fetch.ts <urls.txt | url1 url2 ...>')
    process.exit(1)
  }

  // If arg is a .txt file, read URLs from it (one per line)
  if (arg.endsWith('.txt')) {
    const content = await fs.readFile(arg, 'utf-8')
    return content
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && l.startsWith('http'))
  }

  // Otherwise treat all args as URLs
  return process.argv.slice(2)
}

// ── Entry point ────────────────────────────────────────────────────────────────
const urls = await loadUrls()
await batchFetch(urls)
```


***

## Usage

```bash
# Single URL
ts-node batch-fetch.ts https://example.com

# Multiple URLs inline
ts-node batch-fetch.ts https://example.com https://github.com https://dev.to

# From a text file (one URL per line)
ts-node batch-fetch.ts urls.txt
```

**`urls.txt` example:**
```
https://example.com
https://dev.to/some-article
https://github.com/some/repo
https://reactapp.com   # JS-heavy → auto Puppeteer
```

***

## What the script does

- **One browser, N tabs** — never spawns one Chromium per URL, reuses the browser instance across all jobs (far less memory) [stackoverflow](https://stackoverflow.com/questions/47675081/concurrent-page-scraping-with-puppeteer)
- **Smart detection** — tries a fast static `fetch()` first; auto-promotes to Puppeteer if JS frameworks are detected [codestudy](https://www.codestudy.net/blog/crawling-multiple-urls-in-a-loop-using-puppeteer/)
- **Blocks images/fonts/CSS** during render — you only need the DOM, so no point downloading assets [webscraping](https://webscraping.ai/faq/puppeteer/how-to-optimize-puppeteer-for-better-performance)
- **`p-queue` concurrency** — processes 3 pages at a time by default, configurable [reddit](https://www.reddit.com/r/node/comments/1db3hjs/how_to_process_multiple_urls_concurrently_with/)
- **Retries with backoff** — 2 retries on failure, exponential delay [codestudy](https://www.codestudy.net/blog/crawling-multiple-urls-in-a-loop-using-puppeteer/)
- **`manifest.json`** — saves a full log of every URL, output file, strategy used, and timing to `input/manifest.json`, ready to feed into your next pipeline step


You have **4 strategies** for this, from fastest to most thorough. The key difference from scraping: you only fetch `<a href>` links per page, never the content.

## Strategy 1: sitemap.xml (instant, no crawling)

Most sites already have a complete URL tree. Check first — zero effort: [stackoverflow](https://stackoverflow.com/questions/29634157/is-it-possible-to-crawl-directly-through-a-site-tree-a-site-tree-remotely-or-loc)

```bash
# Check robots.txt for sitemap location
curl https://example.com/robots.txt | grep -i sitemap

# Try common sitemap paths
curl https://example.com/sitemap.xml
curl https://example.com/sitemap_index.xml
```

Node.js to parse it into a tree:

```ts
import { SiteMapper } from 'getsitemap'

const mapper = new SiteMapper()
mapper.map('example.com').then(stream => {
  stream.on('data', (url: any) => console.log(url.url))
})
```


***

## Strategy 2: `web-tree-crawler` (ready-made, CLI)

Already does exactly what you want — crawls links, outputs a `tree`-like structure: [npmjs](https://www.npmjs.com/package/web-tree-crawler)

```bash
npm i -g web-tree-crawler

# Crawl and print tree to stdout
web-tree-crawler https://example.com

# Output:
# .com
#   .example
#     /about
#     /blog
#       /post-1
#       /post-2
#     /docs
#       /intro
#         /quickstart

# Save to file, max 60s, 5 parallel requests
t=60 n=5 o=./tree.txt web-tree-crawler https://example.com
```


***

## Strategy 3: Custom Node.js crawler — full control

This is the most flexible: BFS crawl, only same-domain links, no content, outputs like macOS `tree`. [capturekit](https://www.capturekit.dev/blog/how-to-extract-all-links-from-a-website-using-puppeteer)

```ts
// site-tree.ts
import fetch from 'node-fetch'
import { JSDOM } from 'jsdom'
import fs from 'fs/promises'

interface TreeNode {
  url: string
  path: string
  depth: number
  children: TreeNode[]
}

interface CrawlOptions {
  maxDepth?: number       // how deep to follow links (default: 3)
  maxPages?: number       // hard limit on total pages (default: 200)
  concurrency?: number    // parallel requests (default: 5)
  delay?: number          // ms between requests (default: 200)
  ignorePatterns?: RegExp[] // paths to skip
}

async function extractLinks(url: string, baseOrigin: string): Promise<string[]> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 SiteTreeCrawler' },
      signal: AbortSignal.timeout(8000)
    })
    if (!res.ok) return []
    const html = await res.text()
    const dom = new JSDOM(html, { url })

    return Array.from(dom.window.document.querySelectorAll('a[href]'))
      .map((a: any) => {
        try { return new URL(a.href, url).href } catch { return null }
      })
      .filter((href): href is string =>
        !!href &&
        new URL(href).origin === baseOrigin &&   // same domain only[web:147]
        !href.includes('#') &&                    // skip anchors
        !href.match(/\.(pdf|zip|png|jpg|gif|svg|css|js|xml|json)$/i) // skip assets
      )
  } catch {
    return []
  }
}

async function buildTree(
  startUrl: string,
  opts: CrawlOptions = {}
): Promise<TreeNode> {
  const {
    maxDepth = 3,
    maxPages = 200,
    concurrency = 5,
    delay = 200,
    ignorePatterns = []
  } = opts

  const base = new URL(startUrl)
  const visited = new Set<string>()
  const nodeMap = new Map<string, TreeNode>()

  // BFS queue: [url, depth, parentPath]
  const queue: Array<[string, number, string]> = [[startUrl, 0, '']]

  const root: TreeNode = {
    url: startUrl,
    path: base.pathname || '/',
    depth: 0,
    children: []
  }
  nodeMap.set(base.pathname, root)
  visited.add(startUrl)

  while (queue.length > 0 && visited.size <= maxPages) {
    // Process `concurrency` URLs at a time[web:131]
    const batch = queue.splice(0, concurrency)

    await Promise.all(batch.map(async ([url, depth, parentPath]) => {
      if (depth >= maxDepth) return

      const links = await extractLinks(url, base.origin)
      await new Promise(r => setTimeout(r, delay))

      for (const link of links) {
        const linkUrl = new URL(link)
        const path = linkUrl.pathname

        // Skip already visited, ignored patterns
        if (visited.has(link)) continue
        if (ignorePatterns.some(p => p.test(path))) continue

        visited.add(link)

        const node: TreeNode = {
          url: link,
          path,
          depth: depth + 1,
          children: []
        }

        // Attach to parent
        const parent = nodeMap.get(parentPath) || root
        parent.children.push(node)
        nodeMap.set(path, node)

        queue.push([link, depth + 1, path])
      }
    }))
  }

  console.log(`\n📊 Crawled ${visited.size} pages`)
  return root
}

// ── Render like macOS tree command ─────────────────────────────────────────────
function renderTree(node: TreeNode, prefix = '', isLast = true): string {
  const connector = isLast ? '└── ' : '├── '
  const line = prefix === ''
    ? `${node.path}\n`
    : `${prefix}${connector}${node.path}\n`

  const childPrefix = prefix + (isLast ? '    ' : '│   ')
  const children = node.children
    .sort((a, b) => a.path.localeCompare(b.path))

  return line + children
    .map((child, i) => renderTree(child, childPrefix, i === children.length - 1))
    .join('')
}

// ── JSON export (for further processing) ──────────────────────────────────────
function flatList(node: TreeNode, acc: string[] = []): string[] {
  acc.push(node.url)
  node.children.forEach(c => flatList(c, acc))
  return acc
}

// ── CLI entry point ────────────────────────────────────────────────────────────
const url   = process.argv [github](https://github.com/sunnypurewal/getsitemap)
const depth = parseInt(process.argv [npmjs](https://www.npmjs.com/package/web-tree-crawler) || '3')

if (!url) {
  console.error('Usage: ts-node site-tree.ts <url> [maxDepth]')
  process.exit(1)
}

const tree = await buildTree(url, {
  maxDepth: depth,
  maxPages: 500,
  ignorePatterns: [/\/tag\//, /\/page\/\d+/, /\?/]  // skip tag pages, pagination, query strings
})

// Print tree
const treeOutput = renderTree(tree)
console.log('\n' + treeOutput)

// Save outputs
await fs.mkdir('./output', { recursive: true })
await fs.writeFile('./output/tree.txt', treeOutput)
await fs.writeFile('./output/urls.json', JSON.stringify(flatList(tree), null, 2))
await fs.writeFile('./output/tree.json', JSON.stringify(tree, null, 2))

console.log('✅ Saved: output/tree.txt, output/urls.json, output/tree.json')
```


***

## Usage

```bash
npm install node-fetch jsdom
ts-node site-tree.ts https://example.com 3

# Output (like macOS tree):
# /
#     ├── /about
#     ├── /blog
#     │   ├── /blog/post-1
#     │   ├── /blog/post-2
#     │   └── /blog/post-3
#     └── /docs
#         ├── /docs/intro
#         │   └── /docs/intro/quickstart
#         └── /docs/api
```

***

## Which strategy to use

| Scenario                               | Best tool                                                                                                                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Site has `sitemap.xml`                 | Strategy 1 — instant, zero requests [stackoverflow](https://stackoverflow.com/questions/29634157/is-it-possible-to-crawl-directly-through-a-site-tree-a-site-tree-remotely-or-loc) |
| Quick CLI one-off                      | `web-tree-crawler` — zero code [npmjs](https://www.npmjs.com/package/web-tree-crawler)                                                                                             |
| Custom depth/filters/export            | Strategy 3 custom script [capturekit](https://www.capturekit.dev/blog/how-to-extract-all-links-from-a-website-using-puppeteer)                                                     |
| JS-heavy SPA (no links in static HTML) | Add Puppeteer to Strategy 3 for link extraction [capturekit](https://www.capturekit.dev/blog/how-to-extract-all-links-from-a-website-using-puppeteer)                              |

The `urls.json` output feeds directly into your `batch-fetch.ts` script from the previous step — giving you a complete pipeline: **map site tree → batch download pages → convert to Markdown**.








Here is a complete Puppeteer site-tree crawler — no content extracted, only links, rendered with a `tree`-style output.

## Install

```bash
npm install puppeteer p-queue
npm install -D tsx @types/node
```

## `site-tree.ts` — full script

```ts
import puppeteer, { Browser } from 'puppeteer'
import PQueue from 'p-queue'
import fs from 'fs/promises'
import path from 'path'

// ── Config ─────────────────────────────────────────────────────────────────────
const CONFIG = {
  maxDepth:    3,      // how deep to follow links
  maxPages:    300,    // hard stop
  concurrency: 4,      // parallel tabs[web:128][web:134]
  timeout:     15_000, // ms per page
  delay:       300,    // ms between requests (polite crawling)
  outputDir:   './output',
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface LinkNode {
  url:      string
  path:     string
  title:    string
  depth:    number
  status:   number | 'error'
  children: LinkNode[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function normalizePath(url: string): string {
  try {
    const u = new URL(url)
    return u.pathname.replace(/\/$/, '') || '/'
  } catch { return '/' }
}

function shouldSkip(href: string, origin: string, visited: Set<string>): boolean {
  try {
    const u = new URL(href)
    return (
      u.origin !== origin ||                                          // external domain
      visited.has(u.href) ||                                          // already seen
      /\.(pdf|zip|png|jpg|gif|svg|css|js|xml|json|mp4|woff2?)$/i     // static assets
        .test(u.pathname) ||
      u.pathname.includes('/tag/') ||                                 // tag pages
      u.pathname.match(/\/page\/\d+/) !== null ||                     // pagination
      !!u.hash                                                        // anchors
    )
  } catch { return true }
}

// ── Extract all same-domain links from a page ──────────────────────────────────
async function extractLinks(
  browser: Browser,
  url: string,
  origin: string,
  visited: Set<string>
): Promise<{ links: string[]; title: string; status: number | 'error' }> {
  const page = await browser.newPage()

  try {
    // Block images, fonts, media — only need DOM[web:139]
    await page.setRequestInterception(true)
    page.on('request', req => {
      const t = req.resourceType()
      ;['image', 'font', 'media', 'stylesheet'].includes(t)
        ? req.abort()
        : req.continue()
    })

    await page.setUserAgent('Mozilla/5.0 SiteTreeCrawler/1.0')

    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',   // faster than networkidle0 for link-only crawl[web:159][web:161]
      timeout: CONFIG.timeout,
    })

    const status = response?.status() ?? 'error'
    const title  = await page.title()

    // Extract all <a href> links[web:149][web:158][web:161]
    const rawLinks: string[] = await page.$$eval('a[href]', anchors =>
      anchors.map((a: any) => {
        try { return new URL(a.href, window.location.href).href }
        catch { return '' }
      }).filter(Boolean)
    )

    const links = [...new Set(rawLinks)]
      .filter(href => !shouldSkip(href, origin, visited))

    return { links, title, status }

  } catch (err: any) {
    return { links: [], title: '', status: 'error' }
  } finally {
    await page.close()   // always release tab[web:134][web:137]
  }
}

// ── BFS tree builder ───────────────────────────────────────────────────────────
async function buildTree(startUrl: string): Promise<LinkNode> {
  const base   = new URL(startUrl)
  const origin = base.origin
  const visited = new Set<string>([startUrl])
  const nodeMap = new Map<string, LinkNode>()

  const root: LinkNode = {
    url: startUrl, path: normalizePath(startUrl),
    title: '', depth: 0, status: 0, children: []
  }
  nodeMap.set(startUrl, root)

  // BFS queue: [url, parentUrl, depth]
  const bfsQueue: Array<[string, string, number]> = [[startUrl, '', 0]]
  const queue = new PQueue({ concurrency: CONFIG.concurrency })

  let pageCount = 0

  const processUrl = async (url: string, parentUrl: string, depth: number) => {
    if (depth > CONFIG.maxDepth || pageCount >= CONFIG.maxPages) return

    await new Promise(r => setTimeout(r, CONFIG.delay))
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    })

    try {
      const { links, title, status } = await extractLinks(browser, url, origin, visited)
      pageCount++

      // Update node metadata
      const node = nodeMap.get(url)!
      node.title  = title
      node.status = status

      const statusIcon = status === 200 ? '✅' : status === 'error' ? '❌' : `⚠️ ${status}`
      console.log(`${'  '.repeat(depth)}${statusIcon} [${depth}] ${normalizePath(url)} — "${title}"`)

      // Attach new links as children
      for (const link of links) {
        if (visited.has(link)) continue
        visited.add(link)

        const child: LinkNode = {
          url: link, path: normalizePath(link),
          title: '', depth: depth + 1, status: 0, children: []
        }
        nodeMap.get(url)!.children.push(child)
        nodeMap.set(link, child)

        // Enqueue next level[web:128][web:159][web:161]
        if (depth + 1 <= CONFIG.maxDepth && pageCount < CONFIG.maxPages) {
          queue.add(() => processUrl(link, url, depth + 1))
        }
      }
    } finally {
      await browser.close()
    }
  }

  // Kick off root
  await queue.add(() => processUrl(startUrl, '', 0))
  await queue.onIdle()

  return root
}

// ── Render tree like macOS `tree` command ──────────────────────────────────────
function renderTree(node: LinkNode, prefix = '', isLast = true): string {
  const connector = prefix === '' ? '' : isLast ? '└── ' : '├── '
  const sorted    = [...node.children].sort((a, b) => a.path.localeCompare(b.path))
  const statusBadge = node.status === 200 ? '' : node.status === 'error' ? ' [ERR]' : ` [${node.status}]`
  const titleHint = node.title ? `  # ${node.title}` : ''

  const line = `${prefix}${connector}${node.path || '/'}${statusBadge}${titleHint}\n`
  const childPrefix = prefix + (prefix === '' ? '' : isLast ? '    ' : '│   ')

  return line + sorted
    .map((child, i) => renderTree(child, childPrefix, i === sorted.length - 1))
    .join('')
}

// ── Flatten to URL list ────────────────────────────────────────────────────────
function flatUrls(node: LinkNode, list: string[] = []): string[] {
  list.push(node.url)
  node.children.forEach(c => flatUrls(c, list))
  return list
}

// ── Stats ──────────────────────────────────────────────────────────────────────
function stats(node: LinkNode, acc = { total: 0, errors: 0, maxDepth: 0 }) {
  acc.total++
  if (node.status === 'error' || (typeof node.status === 'number' && node.status >= 400)) acc.errors++
  if (node.depth > acc.maxDepth) acc.maxDepth = node.depth
  node.children.forEach(c => stats(c, acc))
  return acc
}

// ── Entry point ────────────────────────────────────────────────────────────────
const startUrl = process.argv [docs.apify](https://docs.apify.com/sdk/js/docs/3.1/examples/puppeteer-recursive-crawl)
const depth    = parseInt(process.argv [stackoverflow](https://stackoverflow.com/questions/46293216/crawling-multiple-urls-in-a-loop-using-puppeteer) ?? String(CONFIG.maxDepth))

if (!startUrl) {
  console.error('Usage: tsx site-tree.ts <url> [maxDepth]')
  console.error('       tsx site-tree.ts https://example.com 3')
  process.exit(1)
}

CONFIG.maxDepth = depth

console.log(`\n🌐 Crawling: ${startUrl}  (maxDepth: ${depth})\n`)

const tree = await buildTree(startUrl)
const treeText = renderTree(tree)
const urls = flatUrls(tree)
const s = stats(tree)

// ── Output ─────────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(60))
console.log(treeText)
console.log(`📊  Pages: ${s.total}  |  Errors: ${s.errors}  |  Max depth: ${s.maxDepth}`)
console.log('─'.repeat(60))

await fs.mkdir(CONFIG.outputDir, { recursive: true })
await fs.writeFile(path.join(CONFIG.outputDir, 'tree.txt'),  treeText,                    'utf-8')
await fs.writeFile(path.join(CONFIG.outputDir, 'urls.json'), JSON.stringify(urls, null, 2), 'utf-8')
await fs.writeFile(path.join(CONFIG.outputDir, 'tree.json'), JSON.stringify(tree, null, 2), 'utf-8')

console.log('\n✅  Saved:')
console.log(`   output/tree.txt   — human-readable tree`)
console.log(`   output/urls.json  — flat URL list (pipe to batch-fetch.ts)`)
console.log(`   output/tree.json  — full tree with metadata\n`)
```


***

## Usage

```bash
# Basic — depth 3
tsx site-tree.ts https://example.com

# Deeper crawl
tsx site-tree.ts https://docs.example.com 5

# Docs site (usually shallow + well-structured)
tsx site-tree.ts https://docs.stripe.com 2
```

## Console output

```
🌐 Crawling: https://example.com  (maxDepth: 3)

✅ [0] /  # Example Domain
  ✅  [crawlee](https://crawlee.dev/js/docs/examples/puppeteer-recursive-crawl) /about  # About Us
  ✅  [crawlee](https://crawlee.dev/js/docs/examples/puppeteer-recursive-crawl) /blog   # Blog
    ✅  [docs.apify](https://docs.apify.com/sdk/js/docs/3.1/examples/puppeteer-recursive-crawl) /blog/post-1  # Getting Started
    ✅  [docs.apify](https://docs.apify.com/sdk/js/docs/3.1/examples/puppeteer-recursive-crawl) /blog/post-2  # Advanced Guide
    ✅  [docs.apify](https://docs.apify.com/sdk/js/docs/3.1/examples/puppeteer-recursive-crawl) /blog/post-3  # Release Notes
  ✅  [crawlee](https://crawlee.dev/js/docs/examples/puppeteer-recursive-crawl) /docs   # Documentation
    ✅  [docs.apify](https://docs.apify.com/sdk/js/docs/3.1/examples/puppeteer-recursive-crawl) /docs/api      # API Reference
    ✅  [docs.apify](https://docs.apify.com/sdk/js/docs/3.1/examples/puppeteer-recursive-crawl) /docs/intro    # Introduction
      ✅  [stackoverflow](https://stackoverflow.com/questions/46293216/crawling-multiple-urls-in-a-loop-using-puppeteer) /docs/intro/quickstart  # Quickstart

────────────────────────────────────────────────
/
├── /about  # About Us
├── /blog   # Blog
│   ├── /blog/post-1  # Getting Started
│   ├── /blog/post-2  # Advanced Guide
│   └── /blog/post-3  # Release Notes
└── /docs   # Documentation
    ├── /docs/api     # API Reference
    └── /docs/intro   # Introduction
        └── /docs/intro/quickstart  # Quickstart

📊  Pages: 9  |  Errors: 0  |  Max depth: 3
```

## Pipe directly into your batch downloader

The `urls.json` output feeds directly into your `batch-fetch.ts` from the previous step: [crawlee](https://crawlee.dev/js/docs/examples/puppeteer-recursive-crawl)

```bash
# Step 1: build tree → urls.json
tsx site-tree.ts https://example.com 3

# Step 2: batch download all discovered pages
tsx batch-fetch.ts output/urls.json

# Step 3: convert to Markdown (your pipeline)
tsx convert.ts ./input
```


The previous script already has `maxDepth` built in, but here is a focused deep-dive on every depth-limiting pattern you can use — from simple to advanced.

## The core concept

Every recursive crawler needs **two things** to limit depth: [crawlee](https://crawlee.dev/js/docs/examples/puppeteer-recursive-crawl)

1. A `depth` counter passed down with every URL
2. A guard check **before** processing, not after

```ts
// ❌ Wrong — checks too late, already fetched the page
async function crawl(url: string, depth: number) {
  const links = await fetchLinks(url)
  if (depth >= maxDepth) return   // wasted a request
  links.forEach(link => crawl(link, depth + 1))
}

// ✅ Correct — checks before fetching
async function crawl(url: string, depth: number) {
  if (depth >= maxDepth) return   // stop here, no request made
  const links = await fetchLinks(url)
  links.forEach(link => crawl(link, depth + 1))
}
```

***

## Pattern 1: Simple recursion with depth guard

Cleanest for small sites. [gist.github](https://gist.github.com/defx/03c967b9d632c59dd2376ed9da929c27)

```ts
import puppeteer, { Browser } from 'puppeteer'

const visited = new Set<string>()

async function crawl(
  browser: Browser,
  url: string,
  depth: number,
  maxDepth: number
): Promise<void> {
  // ── Guards ─────────────────────────────────────────────────
  if (depth > maxDepth) return          // depth limit hit[web:159][web:161]
  if (visited.has(url)) return          // already crawled
  visited.add(url)

  const page = await browser.newPage()
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 })

    const links: string[] = await page.$$eval('a[href]', (anchors, base) =>
      anchors
        .map((a: any) => { try { return new URL(a.href, base).href } catch { return '' } })
        .filter(Boolean),
      url  // pass base URL into browser context
    )

    const origin = new URL(url).origin
    const sameDomainLinks = [...new Set(links)]
      .filter(l => { try { return new URL(l).origin === origin } catch { return false } })

    console.log(`${'  '.repeat(depth)}[${depth}] ${new URL(url).pathname} → ${sameDomainLinks.length} links`)

    // ── Recurse one level deeper ────────────────────────────
    for (const link of sameDomainLinks) {
      await crawl(browser, link, depth + 1, maxDepth)  // depth + 1 each step[web:162]
    }

  } finally {
    await page.close()
  }
}

// Run
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] })
await crawl(browser, 'https://example.com', 0, 3)  // start at depth 0, max depth 3
await browser.close()
```


***

## Pattern 2: BFS queue with depth tracking (recommended for large sites)

Recursion can hit Node.js call stack limits on deep/wide sites. BFS queue is safer and easier to control. [stackoverflow](https://stackoverflow.com/questions/46293216/crawling-multiple-urls-in-a-loop-using-puppeteer)

```ts
interface QueueItem {
  url:   string
  depth: number
}

async function crawlBFS(startUrl: string, maxDepth: number): Promise<Map<string, number>> {
  const browser  = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] })
  const visited  = new Map<string, number>()  // url → depth
  const queue: QueueItem[] = [{ url: startUrl, depth: 0 }]
  const origin   = new URL(startUrl).origin

  while (queue.length > 0) {
    const { url, depth } = queue.shift()!   // FIFO = BFS

    if (visited.has(url)) continue
    if (depth > maxDepth) continue          // ← depth guard[web:128][web:159]
    visited.set(url, depth)

    const page = await browser.newPage()
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 })

      // Only extract links if we haven't hit the depth limit yet[web:159]
      if (depth < maxDepth) {
        const links: string[] = await page.$$eval('a[href]', anchors =>
          anchors.map((a: any) => a.href).filter(Boolean)
        )

        for (const link of links) {
          try {
            const u = new URL(link)
            if (u.origin === origin && !visited.has(link)) {
              queue.push({ url: link, depth: depth + 1 })  // enqueue with depth + 1[web:128]
            }
          } catch { /* invalid URL */ }
        }
      }

      console.log(`[depth ${depth}/${maxDepth}] ${new URL(url).pathname}`)

    } finally {
      await page.close()
    }
  }

  await browser.close()
  return visited
}

const pages = await crawlBFS('https://example.com', 3)
console.log(`\nTotal pages found: ${pages.size}`)
pages.forEach((depth, url) => console.log(`  [${depth}] ${url}`))
```


***

## Pattern 3: Depth + page count + domain filters combined

Production-grade guard combining all limits at once. [docs.apify](https://docs.apify.com/sdk/js/docs/3.1/examples/puppeteer-recursive-crawl)

```ts
interface CrawlGuards {
  maxDepth:    number   // max link depth from root
  maxPages:    number   // hard stop on total pages crawled
  allowedPath: string   // only crawl under this path prefix e.g. '/docs'
  blocklist:   RegExp[] // skip matching paths
}

function shouldCrawl(
  url: string,
  depth: number,
  visited: Set<string>,
  guards: CrawlGuards,
  origin: string
): boolean {
  try {
    const u = new URL(url)
    return (
      u.origin === origin &&                          // same domain[web:159]
      !visited.has(url) &&                            // not seen yet
      depth <= guards.maxDepth &&                     // within depth limit[web:159][web:161]
      visited.size < guards.maxPages &&               // under page cap
      u.pathname.startsWith(guards.allowedPath) &&    // within allowed subtree
      !guards.blocklist.some(r => r.test(u.pathname)) // not blocked
    )
  } catch { return false }
}

// Usage:
const guards: CrawlGuards = {
  maxDepth:    4,
  maxPages:    500,
  allowedPath: '/docs',            // only crawl /docs/* subtree
  blocklist: [
    /\/tag\//,
    /\/page\/\d+/,
    /\?/,                          // no query strings
    /\.(pdf|zip)$/i,
  ]
}
```


***

## Pattern 4: Depth-aware tree builder (outputs visual tree)

Tracks parent-child relationships by depth for rendering. [stackoverflow](https://stackoverflow.com/questions/48864589/how-to-scrape-multi-level-links-using-puppeteer-js)

```ts
interface TreeNode {
  url:      string
  depth:    number
  children: TreeNode[]
}

// Build tree while crawling
async function buildDepthTree(
  browser: Browser,
  url: string,
  depth: number,
  maxDepth: number,
  visited: Set<string>,
  origin: string
): Promise<TreeNode> {
  visited.add(url)

  const node: TreeNode = { url, depth, children: [] }

  if (depth >= maxDepth) return node  // leaf node — stop here, no more requests[web:162]

  const page = await browser.newPage()
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 })

    const links: string[] = await page.$$eval('a[href]', a => a.map((el: any) => el.href))
    const children = [...new Set(links)].filter(l => {
      try { return new URL(l).origin === origin && !visited.has(l) }
      catch { return false }
    })

    // Process children in parallel at each level[web:134][web:136]
    const childNodes = await Promise.all(
      children.map(link => buildDepthTree(browser, link, depth + 1, maxDepth, visited, origin))
    )
    node.children = childNodes.filter(n => n !== null)

  } finally {
    await page.close()
  }

  return node
}

// Render tree with depth visualisation
function printTree(node: TreeNode, prefix = '', isLast = true): void {
  const indent    = prefix === '' ? '' : isLast ? '└── ' : '├── '
  const depthTag  = `[${node.depth}]`
  const pathname  = new URL(node.url).pathname || '/'

  console.log(`${prefix}${indent}${depthTag} ${pathname}`)

  const childPrefix = prefix + (prefix === '' ? '' : isLast ? '    ' : '│   ')
  node.children.forEach((child, i) =>
    printTree(child, childPrefix, i === node.children.length - 1)
  )
}

// Run
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] })
const visited  = new Set<string>()
const origin   = 'https://example.com'
const tree     = await buildDepthTree(browser, origin, 0, 3, visited, origin)
await browser.close()

printTree(tree)
// [0] /
// ├──  [crawlee](https://crawlee.dev/js/docs/examples/puppeteer-recursive-crawl) /about
// ├──  [crawlee](https://crawlee.dev/js/docs/examples/puppeteer-recursive-crawl) /blog
// │   ├──  [gist.github](https://gist.github.com/defx/03c967b9d632c59dd2376ed9da929c27) /blog/post-1
// │   └──  [gist.github](https://gist.github.com/defx/03c967b9d632c59dd2376ed9da929c27) /blog/post-2
// └──  [crawlee](https://crawlee.dev/js/docs/examples/puppeteer-recursive-crawl) /docs
//     ├──  [gist.github](https://gist.github.com/defx/03c967b9d632c59dd2376ed9da929c27) /docs/api
//     │   └──  [stackoverflow](https://stackoverflow.com/questions/48864589/how-to-scrape-multi-level-links-using-puppeteer-js) /docs/api/reference
//     └──  [gist.github](https://gist.github.com/defx/03c967b9d632c59dd2376ed9da929c27) /docs/intro
```


***

## Depth strategy cheatsheet

| Site type        | Recommended `maxDepth` | Why                                                                                                                                                                            |
| ---------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Landing page     | `1`                    | Only direct links matter                                                                                                                                                       |
| Blog / news      | `2`                    | Home → category → post                                                                                                                                                         |
| Docs site        | `3–4`                  | Home → section → page → subpage                                                                                                                                                |
| Full site map    | `5+`                   | Combined with `maxPages` cap                                                                                                                                                   |
| SPA (React/Next) | `2` + `networkidle0`   | JS must finish before links appear [stackoverflow](https://stackoverflow.com/questions/54563410/how-to-get-all-html-data-after-all-scripts-and-page-loading-is-done-puppeteer) |

The BFS queue pattern (Pattern 2) is the safest for production — no recursion depth issues, easy to pause/resume, and `depth` is always explicit on every queue item. [stackoverflow](https://stackoverflow.com/questions/46293216/crawling-multiple-urls-in-a-loop-using-puppeteer)