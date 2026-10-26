'use strict';
const { createHash } = require('node:crypto');
const { safeUrl, redactText } = require('./redact');
const { CaptureError } = require('./errors');

function buildResult({ url, finalUrl, html, extracted, warnings = [], secrets = [] }) {
  const markdown = redactText(extracted.markdown, secrets);
  if (!markdown.trim()) throw new CaptureError('EMPTY_CONTENT');
  if (Buffer.byteLength(markdown) > 2 * 1024 * 1024) throw new CaptureError('LIMIT_EXCEEDED');
  const notices = [...new Set([...warnings, ...extracted.warnings,
    ...(markdown !== extracted.markdown ? ['SENSITIVE_TEXT_REDACTED'] : [])])];
  return { success: true, url: redactText(safeUrl(url), secrets), finalUrl: redactText(safeUrl(finalUrl), secrets), markdown,
    method: 'browser', cache: 'miss',
    tokens: { html: Math.ceil(html.length / 3.7), md: Math.ceil(markdown.length / 3.7) },
    metadata: { title: extracted.title ? redactText(extracted.title, secrets) : null,
      capturedAt: new Date().toISOString(), contentSha256: createHash('sha256').update(markdown).digest('hex') },
    quality: { status: notices.length ? 'degraded' : 'complete', wordCount: markdown.split(/\s+/).filter(Boolean).length },
    warnings: notices };
}

module.exports = { buildResult };
