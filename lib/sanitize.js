/**
 * sanitize.js — Universal HTML & Markdown sanitization
 *
 * Provides two functions:
 *   sanitizeHtml(html)     — Strip non-content elements from raw HTML before Turndown
 *   sanitizeMarkdown(md)   — Regex-cleanup of CSS/JS patterns that leaked into Markdown
 *
 * Used by both the in-process path (extractStatic.js) and the CLI path (convert.js/polish.js).
 */

const { JSDOM } = require("jsdom");

// ── HTML Sanitization ──────────────────────────────────────────────────────

/**
 * Remove non-content DOM elements from HTML string.
 * Call this BEFORE passing HTML to Turndown.
 */
function sanitizeHtml(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  // 1. Remove non-content elements by selector
  const removeSelectors = [
    "script",
    "style",
    "noscript",
    "link[rel='stylesheet']",
    "link[rel='preload']",
    "link[rel='prefetch']",
    "meta",
    // Navigation & chrome
    '[role="navigation"]',
    '[role="banner"]',
    '[role="contentinfo"]',
    // Hidden / screen-reader-only
    '[aria-hidden="true"]',
    ".sr-only",
    '[class*="visually-hidden"]',
    '[class*="screen-reader"]',
    // Ads & cookie banners
    ".cookie-consent",
    "#cookie-banner",
    ".cookie-banner",
    ".advertisement",
    ".ad-container",
    ".ads",
    // Dev tools
    ".dev-tools",
  ];

  removeSelectors.forEach((selector) => {
    try {
      doc.querySelectorAll(selector).forEach((el) => el.remove());
    } catch (_e) {
      // invalid selector, skip
    }
  });

  // 2. Remove elements with display:none or visibility:hidden
  doc.querySelectorAll("[style]").forEach((el) => {
    const style = el.getAttribute("style") || "";
    if (
      style.includes("display:none") ||
      style.includes("display: none") ||
      style.includes("visibility:hidden") ||
      style.includes("visibility: hidden")
    ) {
      el.remove();
      return;
    }
    // Strip inline style attribute (adds no value to markdown)
    el.removeAttribute("style");
  });

  // 3. Remove [hidden] elements
  doc.querySelectorAll("[hidden]").forEach((el) => el.remove());

  // 4. Strip class attributes (they add no value to markdown and can leak CSS class names)
  doc.querySelectorAll("[class]").forEach((el) =>
    el.removeAttribute("class")
  );

  // 5. Remove empty SVGs (decorative icons, not meaningful content)
  doc.querySelectorAll("svg").forEach((el) => {
    // Keep SVGs that are inside <img> tags (already handled as images)
    if (el.closest("img")) return;
    el.remove();
  });

  return doc.body ? doc.body.innerHTML : html;
}

// ── Markdown Sanitization ──────────────────────────────────────────────────

/**
 * Remove CSS/JS patterns that leaked into the Markdown output.
 * Call this AFTER Turndown conversion, typically in the polish step.
 */
function sanitizeMarkdown(markdown) {
  let md = markdown;

  // 1. @font-face, @media, @keyframes, @import blocks (including nested braces)
  md = md.replace(
    /@(?:font-face|media|keyframes|import|charset|supports|layer|property|page)\s*[^{]*\{[^}]*(?:\{[^}]*\}[^}]*)*\}/g,
    ""
  );

  // 2. CSS class/id/element definitions: .className { ... } or #id { ... }
  md = md.replace(
    /(?:^|\n)[.#][\w[\]\\:>~+*=,"'()\-\s]+\{[^}]*\}/g,
    ""
  );

  // 3. CSS selector blocks: element, element { ... }
  md = md.replace(
    /(?:^|\n)[\w*:,\s[\]>~+.#\\="'-]+\{(?:\s*[\w-]+\s*:[^;}{]*;\s*)+\}/g,
    ""
  );

  // 4. CSS variable definition lines: --tw-xxx: value;
  md = md.replace(/(?:^|\n)(?:\s*--[\w-]+:[^;\n]*;?\s*)+(?=\n|$)/g, "\n");

  // 5. Lines that are >500 chars and have no spaces in the first 200 chars (minified code)
  md = md
    .split("\n")
    .map((line) => {
      if (line.length > 500 && !/\s/.test(line.substring(0, 200))) {
        return "";
      }
      return line;
    })
    .join("\n");

  // 6. Escaped CSS-like class names that appear as text: .\\!container, .\\[--full-bleed etc.
  md = md.replace(
    /(?:^|\n)\.\\[\\![\w[\]():,>~+*=\-\s.#%'"]*(?:\{[^}]*\})?/g,
    ""
  );

  // 7. Collapse excessive blank lines created by removals (4+ → 2)
  md = md.replace(/\n{4,}/g, "\n\n\n");

  return md;
}

module.exports = { sanitizeHtml, sanitizeMarkdown };
