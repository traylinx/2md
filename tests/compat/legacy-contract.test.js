import { describe, test, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const lab = require('./support/lab.cjs');
const { resolveFormat } = require('../../lib/pipeline/resolveFormat');
const { extractStatic } = require('../../lib/pipeline/extractStatic');
const native = fs.readFileSync(path.join(lab.fixtures, 'native.md'), 'utf8');
beforeAll(() => lab.start());
const url = p => lab.origin(lab.target) + p;
const convert = (body, query = '', headers = {}) => lab.request('POST', `/api/convert${query}`, body, headers);

describe('legacy HTTP contract, real serializers and static/native extraction', () => {
  test.each(['native', 'auto'])('%s retains exact native envelope', async method => {
    const r = await convert({ url: url('/native'), method });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ success: true, url: url('/native'), markdown: native, cache: 'miss', method: 'native',
      tokens: { html: 0, md: Math.ceil(native.length / 3.7) }, metadata: {},
      quality: { wordCount: native.split(/\s+/).length }, fallbackReason: null });
    expect(r.headers).toMatchObject({ 'x-cache': 'MISS', 'x-conversion-method': 'native', 'x-native-markdown': 'true', vary: 'Accept' });
    expect(r.headers['x-job-id']).toMatch(/^j_/);
    expect(r.headers['x-request-id']).toBeTruthy();
    expect(lab.state.requests[0].headers.authorization).toBeUndefined();
  });
  test('static extraction matches frozen baseline bytes and structure', async () => {
    const input = fs.readFileSync(path.join(lab.fixtures, 'article.html'), 'utf8');
    const frozen = JSON.parse(fs.readFileSync(path.join(lab.fixtures, 'static-golden.json'), 'utf8'));
    expect(extractStatic(input, 'https://owned.invalid/article')).toEqual(frozen);
    const r = await convert({ url: url('/article'), method: 'static' });
    expect(r.json.markdown).toBe(frozen.markdown.replaceAll('https://owned.invalid', lab.origin(lab.target)));
    expect(r.json.method).toBe('static'); expect(r.json.fallbackReason).toBeNull();
  });
  test.each(['json', 'markdown', 'stream'])('cache hit %s preserves framing and omission', async format => {
    const target = url('/native'); await convert({ url: target, method: 'native' });
    const r = await convert({ url: target, method: 'browser' }, `?format=${format}`);
    expect(r.status).toBe(200); expect(r.headers['x-cache']).toBe('HIT');
    expect(lab.workers.state.calls).toHaveLength(0);
    if (format === 'markdown') expect(r.text).toBe(native);
    else {
      const data = format === 'json' ? r.json : JSON.parse(r.text.split('__JSON__')[1]);
      expect(data.method).toBe('local_cache'); expect(data.cache).toBe('hit');
      expect(data).not.toHaveProperty('fallbackReason'); expect(data.metadata).toEqual({});
    }
    if (format === 'stream') expect(r.text).toBe(`[Cache Hit] Served instantly from local storage.\n\n__JSON__${JSON.stringify(JSON.parse(r.text.split('__JSON__')[1]))}`);
  });
  test.each(['true', 'false', '1'])('force=%s retains existing bypass semantics', async force => {
    const target = url('/native'); await convert({ url: target, method: 'native' });
    const r = await convert({ url: target, method: 'native' }, `?force=${force}`);
    expect(r.json.cache).toBe(force === 'true' ? 'miss' : 'hit');
  });
  test('maxAge is hours; query-independent key remains characterized, not endorsed', () => {
    const meta = { crawledAt: new Date(Date.now() - 30 * 60 * 1000).toISOString() };
    expect(lab.cache.isFresh(meta, 1)).toBe(true); expect(lab.cache.isFresh(meta, 0.1)).toBe(false);
    expect(lab.cache.getSlug('https://owned.invalid/a?x=1')).toBe(lab.cache.getSlug('https://owned.invalid/a?x=2'));
  });
  test.each([['missing', {}, 400], ['invalid', { url: 'https://owned.invalid', method: 'bogus' }, 400],
    ['native unsupported', { method: 'native', page: '/article' }, 422], ['static failure', { method: 'static', page: '/error' }, 502]])('%s error', async (_, body, status) => {
    if (body.page) { body.url = url(body.page); delete body.page; }
    const r = await convert(body); expect(r.status).toBe(status);
    expect(r.json).toMatchObject({ success: false, error: expect.any(String), code: expect.any(String) });
    expect(r.json).not.toHaveProperty('result');
  });
  test('native failure stream keeps legacy 200 text, without JSON marker', async () => {
    const r = await convert({ url: url('/article'), method: 'native' }, '?format=stream');
    expect(r.status).toBe(200); expect(r.text).toMatch(/^Error:/); expect(r.text).not.toContain('__JSON__');
  });
  test('relative redirect still negotiates native Markdown', async () => {
    const r = await convert({ url: url('/redirect'), method: 'native' });
    expect(r.json.markdown).toBe(native); expect(r.json.url).toBe(url('/redirect'));
  });
});

test.each([
  [{ query: { format: 'markdown' }, body: { format: 'json' } }, 'markdown'],
  [{ body: { format: 'stream' } }, 'stream'],
  [{ headers: { 'x-html2md-client': 'web-ui', accept: 'application/json' } }, 'stream'],
  [{ headers: { referer: 'https://owned.invalid/app' } }, 'stream'],
  [{ headers: { accept: 'text/markdown, application/json' } }, 'markdown'],
  [{ headers: { accept: 'text/html' } }, 'json'],
  [{ query: { format: 'bogus' }, headers: { 'x-html2md-client': 'web-ui' } }, 'json'],
])('format precedence %#', (parts, expected) => {
  expect(resolveFormat({ query: {}, body: {}, headers: {}, get: () => 'owned.invalid', ...parts })).toBe(expected);
});
