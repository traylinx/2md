#!/usr/bin/env node

/**
 * Cache Cleanup Script
 * Runs periodically to remove cached pages older than 7 days (by default)
 * to prevent disk exhaustion.
 */

const fs = require('fs');
const path = require('path');
const { JOBS_DIR } = require('../lib/config');

// Default is 7 days in milliseconds
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const now = Date.now();

let deletedCount = 0;
let keptCount = 0;
let errorCount = 0;

console.log(`[Cache Cleanup] Starting scan of ${JOBS_DIR}`);

if (!fs.existsSync(JOBS_DIR)) {
  console.log('[Cache Cleanup] No JOBS_DIR found, exiting.');
  process.exit(0);
}

const siteDirs = fs.readdirSync(JOBS_DIR);

for (const host of siteDirs) {
  const pagesDir = path.join(JOBS_DIR, host, 'pages');
  if (!fs.existsSync(pagesDir)) continue;

  try {
    const slugDirs = fs.readdirSync(pagesDir);
    
    for (const slug of slugDirs) {
      const pageDir = path.join(pagesDir, slug);
      const metaPath = path.join(pageDir, 'output', 'meta.json');
      
      let isOld = false;

      // Check meta.json crawledAt
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          const crawledTime = new Date(meta.crawledAt).getTime();
          if (now - crawledTime > MAX_AGE_MS) {
            isOld = true;
          }
        } catch (e) {
          // Meta corrupt -> better to just delete it
          isOld = true;
        }
      } else {
        // Fallback to directory creation stat if meta.json doesn't exist (legacy cache)
        try {
          const stats = fs.statSync(pageDir);
          if (now - stats.mtime.getTime() > MAX_AGE_MS) {
            isOld = true;
          }
        } catch (e) {}
      }

      if (isOld) {
        try {
          fs.rmSync(pageDir, { recursive: true, force: true });
          deletedCount++;
        } catch (e) {
          console.error(`[Cache Cleanup] Failed to delete ${pageDir}`, e.message);
          errorCount++;
        }
      } else {
        keptCount++;
      }
    }
  } catch (err) {
    console.error(`[Cache Cleanup] Failed scanning site ${host}:`, err.message);
  }
}

console.log(`[Cache Cleanup] Complete.`);
console.log(`- Deleted stale pages: ${deletedCount}`);
console.log(`- Kept fresh pages: ${keptCount}`);
console.log(`- Errors: ${errorCount}`);
