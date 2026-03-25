#!/usr/bin/env node

/**
 * fetch.js — Step 1: Render a web page and save the HTML
 *
 * Uses Puppeteer (headless Chrome) to fully render JavaScript-heavy pages.
 * Falls back to a simple HTTP fetch if Puppeteer fails or is not available.
 *
 * Usage: node scripts/fetch.js <url> <job_dir>
 *
 * Outputs:
 *   <job_dir>/input/raw.html         — HTTP response body (before JS)
 *   <job_dir>/input/rendered.html    — Fully rendered DOM (after JS)
 *   <job_dir>/input/screenshot.png   — Full-page screenshot
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const { isAdDomain } = require('../lib/adBlockList');
const { getRandomUA } = require('../lib/userAgents');
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const url = process.argv[2];
const jobDir = process.argv[3];
const waitTime = parseInt(process.argv[4] || "10000", 10);
const takeScreenshot = process.argv.includes('--screenshot');

if (!url || !jobDir) {
  console.error("Usage: node scripts/fetch.js <url> <job_dir> [wait_ms]");
  process.exit(1);
}

const inputDir = path.join(jobDir, "input");
fs.mkdirSync(inputDir, { recursive: true });

async function fetchWithPuppeteer() {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();

    // Block heavy resources we don't need (images, fonts, media, stylesheets)
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

    // Capture the raw HTTP response
    let rawHtml = "";
    page.on("response", async (response) => {
      if (response.url() === url || response.url() === url + "/") {
        try {
          rawHtml = await response.text();
        } catch (_e) {
          // ignore - some responses can't be read
        }
      }
    });

    // domcontentloaded fires as soon as HTML is parsed — no waiting for all
    // network requests to stop. For SPAs, we then wait a fixed time for JS to
    // render visible content. Much faster and more reliable than networkidle2.
    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: waitTime + 20000,
      });
    } catch (gotoErr) {
      // If domcontentloaded itself timed out, re-throw to trigger static fallback
      if (!(gotoErr.message.includes('timeout') || gotoErr.message.includes('Timeout'))) {
        throw gotoErr;
      }
      // Still attempt to get whatever content loaded
    }

    // Smart wait: only wait for JS hydration if the page actually uses a JS framework
    const needsJsWait = await page.evaluate(() => {
      return !!(window.__NEXT_DATA__ || window.__NUXT__ || document.querySelector('[id="__next"]') ||
        document.querySelector('[id="app"]') || document.querySelector('[id="root"]') ||
        document.querySelector('script[src*="react"]') || document.querySelector('script[src*="vue"]') ||
        document.querySelector('script[src*="angular"]'));
    });
    if (needsJsWait) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(waitTime, 3000)));
    }

    // Save raw HTML (HTTP response)
    if (rawHtml) {
      fs.writeFileSync(path.join(inputDir, "raw.html"), rawHtml, "utf8");
    }

    // Save rendered HTML (full DOM after JS execution)
    const renderedHtml = await page.content();
    fs.writeFileSync(path.join(inputDir, "rendered.html"), renderedHtml, "utf8");

    // Take a screenshot only if explicitly requested
    if (takeScreenshot) {
      try {
        const screenshotPromise = page.screenshot({
          path: path.join(inputDir, "screenshot.png"),
          fullPage: true,
        });
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Screenshot timed out')), 15000)
        );
        await Promise.race([screenshotPromise, timeoutPromise]);
      } catch (_e) {
        // screenshot might fail on very long pages, non-critical
      }
    }

    // Extract metadata
    const metadata = await page.evaluate(() => {
      const getMeta = (selector) => {
        const el = document.querySelector(selector);
        return el ? el.getAttribute("content") || el.textContent : null;
      };

      return {
        title: document.title || null,
        description: getMeta('meta[name="description"]'),
        ogTitle: getMeta('meta[property="og:title"]'),
        ogDescription: getMeta('meta[property="og:description"]'),
        ogImage: getMeta('meta[property="og:image"]'),
        ogUrl: getMeta('meta[property="og:url"]'),
        canonical:
          document.querySelector('link[rel="canonical"]')?.href || null,
      };
    });

    // Write metadata to stdout as JSON (orchestrator reads this)
    const result = {
      success: true,
      method: "puppeteer",
      url: url,
      rawSize: rawHtml.length,
      renderedSize: renderedHtml.length,
      metadata: metadata,
      hasScreenshot: takeScreenshot,
    };

    console.log(JSON.stringify(result));

    await browser.close();
    process.exit(0);
  } catch (error) {
    if (browser) await browser.close();
    throw error;
  }
}

function fetchStatic(targetUrl) {
  return new Promise((resolve, reject) => {
    const client = targetUrl.startsWith("https") ? https : http;
    client.get(targetUrl, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchStatic(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

async function main() {
  try {
    await fetchWithPuppeteer();
  } catch (puppeteerError) {
    // Fallback to static fetch
    console.error(`Puppeteer failed: ${puppeteerError.message}, falling back to static fetch`);
    try {
      const html = await fetchStatic(url);
      fs.writeFileSync(path.join(inputDir, "raw.html"), html, "utf8");
      fs.writeFileSync(path.join(inputDir, "rendered.html"), html, "utf8");

      const result = {
        success: true,
        method: "static",
        url: url,
        rawSize: html.length,
        renderedSize: html.length,
        metadata: {},
        hasScreenshot: false,
      };
      console.log(JSON.stringify(result));
      process.exit(0);
    } catch (staticError) {
      const result = {
        success: false,
        method: "none",
        url: url,
        error: staticError.message,
      };
      console.log(JSON.stringify(result));
      process.exit(1);
    }
  }
}

main();
