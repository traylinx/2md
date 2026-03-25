#!/usr/bin/env node

/**
 * extract.js — Step 2: Extract main content from rendered HTML
 *
 * Uses Mozilla's Readability.js (same algorithm as Firefox Reader View)
 * to strip navigation, ads, footers, and other boilerplate — leaving
 * only the article/main content.
 *
 * Usage: node scripts/extract.js <job_dir>
 *
 * Reads:  <job_dir>/input/rendered.html
 * Writes: <job_dir>/processing/extracted.html
 */

const { Readability } = require("@mozilla/readability");
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const jobDir = process.argv[2];

if (!jobDir) {
  console.error("Usage: node scripts/extract.js <job_dir>");
  process.exit(1);
}

const inputFile = path.join(jobDir, "input", "rendered.html");
const processingDir = path.join(jobDir, "processing");
fs.mkdirSync(processingDir, { recursive: true });

if (!fs.existsSync(inputFile)) {
  console.error(`Input file not found: ${inputFile}`);
  process.exit(1);
}

const html = fs.readFileSync(inputFile, "utf8");

// Read the source URL from job.json if available
let sourceUrl = "https://example.com";
const jobJsonPath = path.join(jobDir, "job.json");
if (fs.existsSync(jobJsonPath)) {
  try {
    const jobData = JSON.parse(fs.readFileSync(jobJsonPath, "utf8"));
    sourceUrl = jobData.url || sourceUrl;
  } catch (_e) {
    // ignore
  }
}

// Parse with JSDOM
const dom = new JSDOM(html, { url: sourceUrl });
const document = dom.window.document;

// Try Readability extraction
const reader = new Readability(document, {
  charThreshold: 50,
  keepClasses: false,
});
const article = reader.parse();

// Count structural elements in original HTML for quality comparison
function countStructure(htmlStr) {
  const tmpDom = new JSDOM(htmlStr);
  const doc = tmpDom.window.document;
  return {
    headings: doc.querySelectorAll("h1, h2, h3, h4, h5, h6").length,
    tables: doc.querySelectorAll("table").length,
    images: doc.querySelectorAll("img").length,
    lists: doc.querySelectorAll("ul, ol").length,
    codeBlocks: doc.querySelectorAll("pre, code").length,
    links: doc.querySelectorAll("a[href]").length,
  };
}

const originalStructure = countStructure(html);

// Decide whether Readability result is good enough
let useReadability = false;

if (article && article.content && article.content.length > 100) {
  const extractedStructure = countStructure(article.content);

  // Check if Readability preserved enough structure
  const preservedHeadings =
    originalStructure.headings === 0 ||
    extractedStructure.headings >= originalStructure.headings * 0.3;
  const preservedTables =
    originalStructure.tables === 0 ||
    extractedStructure.tables >= originalStructure.tables * 0.5;
  const preservedImages =
    originalStructure.images === 0 ||
    extractedStructure.images >= originalStructure.images * 0.3;
  const preservedLists =
    originalStructure.lists === 0 ||
    extractedStructure.lists >= originalStructure.lists * 0.3;

  useReadability =
    preservedHeadings && preservedTables && preservedImages && preservedLists;

  if (!useReadability) {
    // Readability stripped too much — log what was lost
    console.error(
      `Readability stripped structure: headings ${originalStructure.headings}→${extractedStructure.headings}, ` +
        `tables ${originalStructure.tables}→${extractedStructure.tables}, ` +
        `images ${originalStructure.images}→${extractedStructure.images}, ` +
        `lists ${originalStructure.lists}→${extractedStructure.lists}. Using fallback.`
    );
  }
}

if (useReadability) {
  // Readability succeeded and preserved structure
  const extractedHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(article.title || "")}</title>
</head>
<body>
  ${article.content}
</body>
</html>`;

  fs.writeFileSync(
    path.join(processingDir, "extracted.html"),
    extractedHtml,
    "utf8"
  );

  const result = {
    success: true,
    method: "readability",
    title: article.title || null,
    byline: article.byline || null,
    excerpt: article.excerpt || null,
    length: article.length || 0,
    extractedSize: extractedHtml.length,
    originalSize: html.length,
  };

  console.log(JSON.stringify(result));
} else {
  // Readability failed — fallback A: Trafilatura
  let trafilaturaSuccess = false;
  try {
    const pythonExe = path.join(__dirname, '..', 'venv', 'bin', 'python3');
    const trafilaturaScript = path.join(__dirname, 'extract_trafilatura.py');
    
    if (fs.existsSync(pythonExe)) {
      const output = execSync(`${pythonExe} ${trafilaturaScript} "${jobDir}"`, { encoding: 'utf8' });
      // Parsed result is the last line
      const lines = output.trim().split('\n');
      const tResult = JSON.parse(lines[lines.length - 1]);
      if (tResult.success) {
        trafilaturaSuccess = true;
        console.log(JSON.stringify(tResult));
      }
    }
  } catch (e) {
    // Fall back to manual strip
    console.error("Trafilatura fallback failed or not available:", e.message);
  }

  if (!trafilaturaSuccess) {
    // Readability failed and Trafilatura failed — fallback B: strip script/style/nav/footer manually
    const fallbackDom = new JSDOM(html, { url: sourceUrl });
    const doc = fallbackDom.window.document;

    const removeSelectors = [
      "script",
      "style",
      "noscript",
      "nav",
      "footer",
      "header",
      "aside",
      ".advertisement",
      ".ad",
      ".ads",
      "#cookie-banner",
      ".cookie-consent",
      '[role="navigation"]',
      '[role="banner"]',
      '[role="contentinfo"]',
      '[aria-hidden="true"]',
    ];

    removeSelectors.forEach((selector) => {
      try {
        doc.querySelectorAll(selector).forEach((el) => el.remove());
      } catch (_e) {
        // invalid selector, skip
      }
    });

    // Remove hidden elements
    doc.querySelectorAll("[style]").forEach((el) => {
      const style = el.getAttribute("style") || "";
      if (
        style.includes("display:none") ||
        style.includes("display: none") ||
        style.includes("visibility:hidden") ||
        style.includes("visibility: hidden")
      ) {
        el.remove();
      }
    });

    const title = doc.title || "";
    const bodyHtml = doc.body ? doc.body.innerHTML : html;

    const fallbackHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;

    fs.writeFileSync(
      path.join(processingDir, "extracted.html"),
      fallbackHtml,
      "utf8"
    );

    const result = {
      success: true,
      method: "fallback",
      title: title || null,
      byline: null,
      excerpt: null,
      length: bodyHtml.length,
      extractedSize: fallbackHtml.length,
      originalSize: html.length,
    };

    console.log(JSON.stringify(result));
  }
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
