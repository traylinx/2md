'use strict';
const { JSDOM } = require('jsdom');
const { extractStatic } = require('../pipeline/extractStatic');
const { CaptureError } = require('./errors');
const { redactText } = require('./redact');

function malformedTable(table) {
  const rows = [...table.rows];
  if (!rows.length) return true;
  const widths = rows.map(row => row.cells.length);
  return widths.some(size => !size || size !== widths[0]) ||
    !!table.querySelector('[colspan]:not([colspan="1"]), [rowspan]:not([rowspan="1"]), table');
}

function extract(html, url, visibleText = '', secrets = []) {
  if (Buffer.byteLength(html) > 5 * 1024 * 1024) throw new CaptureError('LIMIT_EXCEEDED');
  const dom = new JSDOM(html, { url });
  const warnings = [];
  require('./semanticContent').preserveSemantics(dom.window.document);
  try {
    const doc = dom.window.document;
    // Redact decoded DOM values BEFORE Readability/Turndown can normalize
    // whitespace or escape Markdown. Output-only matching misses those changes.
    const scrub = value => {
      const clean = redactText(value, secrets);
      if (clean !== value) warnings.push('SENSITIVE_TEXT_REDACTED');
      return clean;
    };
    const walker = doc.createTreeWalker(doc, dom.window.NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) node.nodeValue = scrub(node.nodeValue);
    for (const element of doc.querySelectorAll('*')) {
      for (const attr of [...element.attributes]) element.setAttribute(attr.name, scrub(attr.value));
    }
    visibleText = scrub(visibleText);
    for (const table of doc.querySelectorAll('table')) {
      if (!malformedTable(table)) continue;
      const replacement = doc.createElement('pre');
      replacement.textContent = [...table.rows].map(row => [...row.cells]
        .map(cell => cell.textContent.trim()).join(' ')).join('\n') || table.textContent;
      table.replaceWith(replacement);
      warnings.push('MALFORMED_TABLE_TEXT_FALLBACK');
    }
    let result = extractStatic(dom.serialize(), url);
    // Readability strips classes. Restore only exact code blocks from this DOM;
    // do not change the legacy extractor or guess a language from code text.
    for (const code of doc.querySelectorAll('pre > code')) {
      const language = code.className.match(/(?:language-|lang-)(\w+)/)?.[1];
      if (!language) continue;
      const contents = code.textContent.replace(/\n$/, '');
      result.markdown = result.markdown.replace(`\`\`\`\n${contents}\n\`\`\``, `\`\`\`${language}\n${contents}\n\`\`\``);
    }
    if (!result.markdown.trim() && visibleText.trim()) {
      result = { markdown: visibleText.trim(), metadata: { title: doc.title || null } };
      warnings.push('VISIBLE_TEXT_FALLBACK');
    }
    if (!result.markdown.trim()) throw new CaptureError('EMPTY_CONTENT');
    if (Buffer.byteLength(result.markdown) > 2 * 1024 * 1024) throw new CaptureError('LIMIT_EXCEEDED');
    return { markdown: result.markdown, title: result.metadata?.title || doc.title || null,
      warnings: [...new Set(warnings)] };
  } finally { dom.window.close(); }
}

module.exports = { extract, malformedTable };
