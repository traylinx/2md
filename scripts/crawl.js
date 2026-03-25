#!/usr/bin/env node

/**
 * crawl.js — Puppeteer-based Site-Tree Crawler
 *
 * Renders each page with headless Chrome, extracts real links from the 
 * rendered DOM, and builds a verified site tree via BFS.
 *
 * This handles SPAs (React, Next.js, Angular) where links only exist
 * after JavaScript execution.
 *
 * Usage: node scripts/crawl.js <url> [maxDepth] [maxPages]
 * Output: JSON to stdout { urls: [...], tree: "...", stats: {...} }
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const { isAdDomain } = require('../lib/adBlockList');
const { getRandomUA } = require('../lib/userAgents');
const { isUrlAllowed, getCrawlDelay } = require('../lib/robotsChecker');
const { normalizeForDedup, generateUrlPermutations } = require('../lib/urlNormalize');

const startUrl = process.argv[2];
const maxDepth = parseInt(process.argv[3] || '3', 10);
const maxPages = parseInt(process.argv[4] || '300', 10);

// Optional: --seed-urls <file> to pre-populate BFS queue
let seedUrls = [];
const seedIdx = process.argv.indexOf('--seed-urls');
if (seedIdx !== -1 && process.argv[seedIdx + 1]) {
  try {
    const fs = require('fs');
    const seedContent = fs.readFileSync(process.argv[seedIdx + 1], 'utf8');
    seedUrls = seedContent.split('\n').map(l => l.trim()).filter(l => l.startsWith('http'));
  } catch(e) { /* ignore seed file errors */ }
}

const ignoreRobots = process.argv.includes('--ignore-robots');

if (!startUrl) {
  console.error('Usage: node scripts/crawl.js <url> [maxDepth] [maxPages] [--seed-urls <file>]');
  process.exit(1);
}

const SKIP_EXTENSIONS = /\.(pdf|zip|tar|gz|png|jpg|jpeg|gif|svg|ico|css|js|xml|json|mp4|mp3|woff2?|ttf|eot)$/i;
const SKIP_PATTERNS = ['/tag/', '/page/', '#', 'mailto:', 'tel:', 'javascript:'];

function shouldSkip(href, startUrlObj) {
  try {
    const u = new URL(href);
    
    // Normalize hostnames (strip www. for comparison)
    const host1 = u.hostname.replace(/^www\./, '');
    const host2 = startUrlObj.hostname.replace(/^www\./, '');
    
    // Must be same base domain
    if (host1 !== host2) return true;
    
    if (SKIP_EXTENSIONS.test(u.pathname)) return true;
    if (SKIP_PATTERNS.some(p => href.includes(p))) return true;
    return false;
  } catch { return true; }
}

function normalizePath(url) {
  try {
    return new URL(url).pathname.replace(/\/+$/, '') || '/';
  } catch { return '/'; }
}

function normalizeUrl(href) {
  return normalizeForDedup(href);
}

function getBasename(p) {
  if (p === '/') return '/';
  const parts = p.split('/');
  return parts[parts.length - 1];
}

function renderTree(node, prefix = '', isLast = true) {
  let line = '';
  if (node.path !== '/') {
    const connector = isLast ? '└── ' : '├── ';
    const titleHint = node.title ? `  # ${node.title}` : '';
    line = `${prefix}${connector}${getBasename(node.path)}${titleHint}\n`;
  } else {
    const titleHint = node.title ? `  # ${node.title}` : '';
    line = `/${titleHint}\n`;
  }

  const childPrefix = node.path === '/' ? '' : (prefix + (isLast ? '    ' : '│   '));
  const sorted = [...node.children].sort((a, b) => a.path.localeCompare(b.path));

  line += sorted
    .map((child, i) => renderTree(child, childPrefix, i === sorted.length - 1))
    .join('');

  return line;
}

function buildTreeFromEntries(entries) {
  const root = { path: '/', title: '', children: [] };
  const nodeMap = new Map();
  nodeMap.set('/', root);

  // Set root title
  const rootEntry = entries.find(e => normalizePath(e.url) === '/');
  if (rootEntry) root.title = rootEntry.title;

  for (const entry of entries) {
    const p = normalizePath(entry.url);
    if (p === '/') continue;

    const parts = p.split('/').filter(Boolean);
    let currentPath = '/';
    let currentNode = root;

    for (let i = 0; i < parts.length; i++) {
      currentPath = currentPath === '/' ? `/${parts[i]}` : `${currentPath}/${parts[i]}`;

      if (!nodeMap.has(currentPath)) {
        const newNode = { path: currentPath, title: '', children: [] };
        currentNode.children.push(newNode);
        nodeMap.set(currentPath, newNode);
      }
      currentNode = nodeMap.get(currentPath);
    }
    currentNode.title = entry.title;
  }
  return root;
}

async function crawlBFS(startUrl, seeds = []) {
  const base = new URL(startUrl);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  const visited = new Set();
  const entries = []; // { url, title, depth }
  let queuedCount = 0; // Track actual pages queued (visited set is inflated by permutations)
  const startNorm = normalizeUrl(startUrl);
  const queue = [[startNorm, 0]];
  visited.add(startNorm);
  queuedCount++;
  // Also mark all permutations as visited to prevent revisiting under different URL forms
  for (const perm of generateUrlPermutations(startUrl)) visited.add(perm);

  // Add seed URLs to queue at depth 0
  for (const seed of seeds) {
    const normalized = normalizeUrl(seed);
    if (normalized && !visited.has(normalized) && !shouldSkip(normalized, base)) {
      visited.add(normalized);
      for (const perm of generateUrlPermutations(normalized)) visited.add(perm);
      queuedCount++;
      queue.push([normalized, 0]);
    }
  }

  process.stderr.write(`\n`);

  try {
    const page = await browser.newPage();
    
    const ua = getRandomUA();
    await page.setUserAgent(ua);
    
    // Extra headers to look exactly like a real user
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1'
    });

    // Mask webdriver
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
    });

    await page.setViewport({ width: 1280, height: 800 });

    // Block heavy resources — we only need links and titles from the DOM
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['image', 'font', 'media', 'stylesheet'].includes(type)) {
        return req.abort();
      }
      try {
        const hostname = new URL(req.url()).hostname;
        if (isAdDomain(hostname)) return req.abort();
      } catch (_e) { /* invalid URL, let it through */ }
      req.continue();
    });

    // Fetch robots.txt crawl delay once
    let crawlDelayMs = 0;
    if (!ignoreRobots) {
      const delay = await getCrawlDelay(startUrl);
      crawlDelayMs = Math.min(delay * 1000, 10000); // cap at 10s
      if (crawlDelayMs > 0) process.stderr.write(`  🤖 robots.txt crawl-delay: ${delay}s\n`);
    }

    while (queue.length > 0 && entries.length < maxPages) {
      const [url, depth] = queue.shift();
      if (depth > maxDepth) continue;

      // robots.txt check
      if (!ignoreRobots) {
        const allowed = await isUrlAllowed(url);
        if (!allowed) {
          process.stderr.write(`  [${entries.length + 1}] 🚫 Blocked by robots.txt: ${normalizePath(url)}\n`);
          continue;
        }
      }

      // Respect crawl-delay
      if (crawlDelayMs > 0 && entries.length > 0) {
        await new Promise(resolve => setTimeout(resolve, crawlDelayMs));
      }

      process.stderr.write(`  [${entries.length + 1}] depth:${depth} ${normalizePath(url)}\n`);

      try {
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        } catch (gotoErr) {
          if (!(gotoErr.message.includes('timeout') || gotoErr.message.includes('Timeout'))) {
            throw gotoErr;
          }
        }
        // Brief wait for JS frameworks to render links
        await new Promise(resolve => setTimeout(resolve, 1500));
        await page.waitForSelector('body', { timeout: 2000 }).catch(() => {});

        // Get page title and all links from the RENDERED DOM
        const pageData = await page.evaluate(() => {
          const title = document.title || '';
          const bodyText = (document.body && document.body.innerText) || '';
          const links = Array.from(document.querySelectorAll('a[href]'))
            .map(a => a.href)
            .filter(h => h.startsWith('http'));
          return { title, links, contentLength: bodyText.length };
        });

        // Only add pages that have real content (not empty SPA shells)
        if (pageData.contentLength > 50 && pageData.title !== '403 - Forbidden' && pageData.title !== 'Access Denied') {
          entries.push({ url, title: pageData.title, depth });
        } else {
          process.stderr.write(`     ⚠ Skipped (empty page)\n`);
          continue;
        }

        // Discover new links
        if (depth < maxDepth) {
          const normalizedLinks = pageData.links.map(normalizeUrl).filter(Boolean);
          const uniqueLinks = [...new Set(normalizedLinks)]
            .filter(href => !shouldSkip(href, base) && !visited.has(href));

          for (const link of uniqueLinks) {
            if (queuedCount >= maxPages) break;
            visited.add(link);
            // Mark all URL permutations as visited so we don't re-crawl under a different form
            for (const perm of generateUrlPermutations(link)) visited.add(perm);
            queuedCount++;
            queue.push([link, depth + 1]);
          }
        }
      } catch (err) {
        process.stderr.write(`     ❌ Error: ${err.message.substring(0, 60)}\n`);
      }
    }

    await page.close();
  } finally {
    await browser.close();
  }

  return entries;
}

async function main() {
  process.stderr.write(`  🌐 Discovering site structure...\n`);
  process.stderr.write(`  Depth: ${maxDepth} · Max pages: ${maxPages}\n`);
  if (seedUrls.length > 0) {
    process.stderr.write(`  📋 ${seedUrls.length} seed URLs from llms.txt\n`);
  }

  const entries = await crawlBFS(startUrl, seedUrls);

  process.stderr.write(`\n  ✅ Found ${entries.length} real pages\n`);

  const root = buildTreeFromEntries(entries);
  const treeStr = renderTree(root);

  const result = {
    urls: entries.map(e => e.url),
    tree: treeStr,
    stats: { total: entries.length, maxDepth, method: 'puppeteer-bfs' }
  };
  console.log(JSON.stringify(result));
}

main().catch(err => {
  console.error(`Crawl error: ${err.message}`);
  process.exit(1);
});
