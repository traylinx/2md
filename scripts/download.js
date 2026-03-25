#!/usr/bin/env node

/**
 * download.js — Step 4: Download images and rewrite paths in Markdown
 * 
 * Usage: node scripts/download.js <job_dir> [max_size_mb]
 * 
 * Reads:  <job_dir>/output/page.md
 * Writes: <job_dir>/output/assets/* + updated page.md
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function main() {
  const jobDir = process.argv[2];
  const maxSizeMb = parseInt(process.argv[3] || '10', 10);

  if (!jobDir) {
    console.error('Usage: node scripts/download.js <job_dir> [max_size_mb]');
    process.exit(1);
  }

  const mdPath = path.join(jobDir, 'output', 'page.md');
  const assetsDir = path.join(jobDir, 'output', 'assets');

  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  if (!fs.existsSync(mdPath)) {
    console.error(`Markdown file not found: ${mdPath}`);
    process.exit(1);
  }

  let markdown = fs.readFileSync(mdPath, 'utf-8');

  // Find all image references: ![alt](url)
  // GFM could have spaces in url occasionally, but assuming standard format here.
  const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const images = [...markdown.matchAll(imagePattern)];

  if (images.length === 0) {
    console.log(JSON.stringify({ success: true, downloaded: 0, failed: 0, skipped: 0, total: 0 }));
    process.exit(0);
  }

  const manifest = {};
  let downloaded = 0;
  let failed = 0;
  let skipped = 0;
  let counter = 0;

  // Separate inline base64 images (must process synchronously for markdown rewrites)
  const inlineImages = [];
  const httpImages = [];

  for (const match of images) {
    const url = match[2];
    if (url.startsWith('data:image/')) {
      inlineImages.push(match);
    } else if (url.startsWith('assets/') || url.startsWith('./assets/')) {
      // already local, skip
    } else if (url.startsWith('http')) {
      httpImages.push(match);
    } else {
      skipped += 1;
    }
  }

  // Process inline base64 images synchronously
  for (const match of inlineImages) {
    const fullMatch = match[0];
    const alt = match[1];
    const url = match[2];
    const b64Match = url.match(/data:image\/(\w+[-+A-Za-z]*);base64,(.+)/);
    if (b64Match) {
      let ext = b64Match[1];
      if (ext === 'svg+xml') ext = 'svg';
      const data = b64Match[2];
      counter += 1;
      const filename = `img_${counter.toString().padStart(3, '0')}_inline.${ext}`;
      const buffer = Buffer.from(data, 'base64');
      fs.writeFileSync(path.join(assetsDir, filename), buffer);
      markdown = markdown.split(fullMatch).join(`![${alt}](assets/${filename})`);
      const shortUrl = url.substring(0, 50) + '...';
      manifest[shortUrl] = `assets/${filename}`;
      downloaded += 1;
    }
  }

  // Download HTTP images in parallel (concurrency: 5)
  const CONCURRENCY = 5;
  const downloadTasks = httpImages.map((match) => {
    counter += 1;
    const idx = counter;
    const url = match[2];
    return { idx, url };
  });

  for (let i = 0; i < downloadTasks.length; i += CONCURRENCY) {
    const batch = downloadTasks.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(async ({ idx, url }) => {
      const parsedUrl = new URL(url);
      let originalName = path.basename(parsedUrl.pathname).replace(/[^a-zA-Z0-9._-]/g, '_');
      if (!originalName || originalName === '_') originalName = 'image';
      if (!/\.\w{2,5}$/.test(originalName)) originalName += '.jpg';

      const hashPrefix = crypto.createHash('md5').update(url).digest('hex').substring(0, 6);
      let filename = `img_${idx.toString().padStart(3, '0')}_${hashPrefix}_${originalName}`;
      if (filename.length > 100) {
        const ext = path.extname(filename);
        filename = filename.substring(0, 96) + ext;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => { controller.abort(); }, 10000);

      const response = await fetch(url, {
        headers: { 'User-Agent': 'html2md/1.0' },
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > maxSizeMb * 1024 * 1024) {
        throw new Error(`Image too large: ${(parseInt(contentLength, 10) / 1024 / 1024).toFixed(1)} MB`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > maxSizeMb * 1024 * 1024) {
        throw new Error(`Image too large after download: ${(buffer.length / 1024 / 1024).toFixed(1)} MB`);
      }

      fs.writeFileSync(path.join(assetsDir, filename), buffer);
      return { url, filename };
    }));

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { url, filename } = result.value;
        markdown = markdown.split(`](${url})`).join(`](assets/${filename})`);
        manifest[url] = `assets/${filename}`;
        downloaded += 1;
      } else {
        console.warn(`  ⚠ Failed to download image: ${result.reason.message}`);
        failed += 1;
      }
    }
  }

  // Write updated Markdown
  fs.writeFileSync(mdPath, markdown);
  
  // Write manifest
  fs.writeFileSync(path.join(assetsDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  const result = {
    success: true,
    downloaded,
    failed,
    skipped,
    total: images.length
  };

  console.log(JSON.stringify(result));
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
