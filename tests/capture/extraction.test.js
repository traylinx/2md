import { it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { extract } = require('../../lib/capture/extract');
const { buildResult } = require('../../lib/capture/result');
const { assertPageState } = require('../../lib/capture/publicPageState');
const { redactText, safeUrl } = require('../../lib/capture/redact');

it('retains normal GFM tables, links and code', () => {
  const output = extract('<html><title>Owned</title><body><h1>Owned report</h1><p>Read the <a href="/source">source</a> for details.</p>' +
    '<table><tr><th>Name</th><th>Value</th></tr><tr><td>A</td><td>2</td></tr></table>' +
    '<pre><code class="language-js">const count = 2;</code></pre></body></html>', 'https://example.com');
  expect(output.markdown).toContain('| Name | Value |');
  expect(output.markdown).toContain('[source](https://example.com/source)');
  expect(output.markdown).toContain('```js');
  expect(output.warnings).toEqual([]);
});
it('does not invent rectangular cells for a malformed table', () => {
  const output = extract('<body><h1>Report</h1><table><tr><th>Name</th><th>Value</th></tr><tr><td>Only name</td></tr></table></body>', 'https://example.com');
  expect(output.warnings).toContain('MALFORMED_TABLE_TEXT_FALLBACK');
  expect(output.markdown).toContain('Only name');
  expect(output.markdown).not.toContain('| Only name |');
});
it('fails empty pages and HTML limits', () => {
  expect(() => extract('<body></body>', 'https://example.com')).toThrow();
  expect(() => extract('a'.repeat(5 * 1024 * 1024 + 1), 'https://example.com')).toThrow();
});
it('hashes the exact returned redacted Markdown', () => {
  const result = buildResult({ url: 'https://example.com', finalUrl: 'https://example.com/report', html: '<body>report</body>',
    extracted: { markdown: 'Report synthetic-password-42', title: 'Report', warnings: [] }, secrets: ['synthetic-password-42'] });
  expect(result.markdown).not.toContain('synthetic-password-42');
  expect(result.metadata.contentSha256).toBe(createHash('sha256').update(result.markdown).digest('hex'));
  expect(result.cache).toBe('miss');
  expect(result.quality.status).toBe('degraded');
});
it('redacts credential URL parameters and bearer material', () => {
  expect(safeUrl('https://user:pw@example.com/a?token=secret&report=1#fragment')).toBe('https://example.com/a?report=1');
  expect(redactText('Bearer abcdef password=super-secret')).not.toMatch(/abcdef|super-secret/);
});
it('redacts common secret encodings and secret-bearing returned paths', () => {
  const secret = 'synthetic secret & value';
  const encoded = new URLSearchParams({ value: secret }).toString();
  expect(redactText(encoded, [secret])).not.toContain('synthetic+secret');
  expect(redactText(Buffer.from(secret).toString('base64'), [secret])).toBe('[REDACTED]');
  const result = buildResult({ url: 'https://example.com/secret-canary', finalUrl: 'https://example.com/secret-canary',
    html: 'text', extracted: { markdown: 'A readable report', title: null, warnings: [] }, secrets: ['secret-canary'] });
  expect(JSON.stringify(result)).not.toContain('secret-canary');
});
it('enforces the output limit after redaction expansion', () => {
  expect(() => buildResult({ url: 'https://example.com', finalUrl: 'https://example.com', html: 'text',
    extracted: { markdown: 'a'.repeat(300000), title: null, warnings: [] }, secrets: ['a'] })).toThrow('Capture limit exceeded');
});
it.each(['s3cr*tX9', 's3cr_tX9', 's3cr[t]X9', 'space  double  space-pass', 'entity<&>pass'])
('redacts reflected secret %s before Markdown transformation', secret => {
  const escaped = secret.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const html = `<html><title>Report ${escaped}</title><body><p>Visible ${escaped} report</p><a href="/report" title="${escaped}">source</a><pre><code>${escaped}</code></pre></body></html>`;
  const extracted = extract(html, 'https://example.com', '', [secret]);
  const result = buildResult({ url: 'https://example.com', finalUrl: 'https://example.com', html, extracted, secrets: [secret] });
  expect(result.warnings).toContain('SENSITIVE_TEXT_REDACTED');
  expect(result.markdown).toContain('REDACTED');
  expect(JSON.stringify(result).replace(/\\/g, '')).not.toContain(secret.replace(/\\/g, ''));
  expect(result.markdown).not.toContain(secret.replace(/\s+/g, ' '));
  expect(result.metadata.title).not.toContain(secret);
});
it('redacts visible-text fallback before returning private content', () => {
  const secret = 'fallback  password_*';
  const result = extract('<body></body>', 'https://example.com', `Report ${secret} here`, [secret]);
  expect(result.markdown).toBe('Report [REDACTED] here');
  expect(result.warnings).toContain('SENSITIVE_TEXT_REDACTED');
});
it('classifies login, challenge and empty shells without claiming success', () => {
  expect(() => assertPageState({ password: true, text: 'Sign in' })).toThrow('Website login required');
  expect(() => assertPageState({ challenge: true, text: 'Check' })).toThrow('Human interaction required');
  expect(() => assertPageState({ text: 'Loading...' })).toThrow('No usable page content');
  expect(() => assertPageState({ text: 'This is a useful article with several visible words.' })).not.toThrow();
});
it('full rendered document is opt-in and preserves supplementary session content', () => {
  const html='<body><main><h1>Plan</h1><p>'+('Detailed article content. '.repeat(40))+'</p></main><aside><p>Supplementary session result</p></aside></body>';
  const legacy=extract(html,'https://example.com');
  expect(extract(html,'https://example.com','',[],{fullDocument:false})).toEqual(legacy);
  expect(extract(html,'https://example.com','',[],{fullDocument:true}).markdown).toContain('Supplementary session result');
});
