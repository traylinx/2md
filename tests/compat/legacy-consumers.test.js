import { beforeAll, test, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const lab = require('./support/lab.cjs');
const consumers = require('./support/consumers.cjs');
beforeAll(() => lab.start());
const target = () => `${lab.origin(lab.target)}/native`;
test('unchanged Search adapter sends legacy defaults and parses real JSON', async () => {
  let sent;
  const Service = consumers.search((...args) => { sent = args; return fetch(...args); });
  const service = new Service('synthetic-compat-key', lab.origin(lab.server), 2000);
  const first = await service.scrapeUrl(target());
  expect(first).toMatchObject({ success: true, backend: 'native', cache: 'miss', format: 'markdown' });
  expect(JSON.parse(sent[1].body)).toEqual({ url: target(), method: 'auto', downloadImages: false, frontMatter: false, screenshot: false, waitMs: 10000 });
  expect(sent[1].headers).toMatchObject({ Authorization: 'Bearer synthetic-compat-key', Accept: 'application/json' });
  expect(consumers.billable(first)).toBe(true);
  const second = await service.scrapeUrl(target());
  expect(second.cache).toBe('hit'); expect(consumers.billable(second)).toBe(false);
});
test('unchanged Search query options and error handling', async () => {
  let endpoint;
  const Service = consumers.search((...args) => { endpoint = args[0]; return fetch(...args); });
  const service = new Service('synthetic-compat-key', lab.origin(lab.server), 2000);
  const result = await service.scrapeUrl(target(), { maxAge: 2, force: true });
  expect(endpoint).toContain('?maxAge=2&force=true'); expect(result.success).toBe(true);
  const fail = await service.scrapeUrl(`${lab.origin(lab.target)}/error`, { method: 'static' });
  expect(fail.success).toBe(false); expect(fail.error).toContain('html2md 502:');
});
test('mutation sentinel: nested JSON breaks unchanged Search parser', async () => {
  const original = (await lab.request('POST', '/api/convert', { url: target() })).json;
  const Service = consumers.search(async () => new Response(JSON.stringify({ success: true, result: original })));
  const parsed = await new Service('synthetic', 'https://owned.invalid').scrapeUrl(target());
  expect(parsed.success).toBe(false); expect(parsed.error).toBe('html2md returned no markdown');
});
test('mutation sentinel: uppercase cache changes unchanged billing expression', () => {
  expect(consumers.billable({ cache: 'hit' })).toBe(false);
  expect(consumers.billable({ cache: 'HIT' })).toBe(true);
});
test.each([false, true])('unchanged frontend stream parser detects marker mutation=%s', async mutate => {
  const r = await lab.request('POST', '/api/convert?format=stream', { url: target() });
  const wire = mutate ? r.text.replace('__JSON__', '__RESULT__') : r.text;
  // Deliberately fragment the marker and JSON across chunks.
  const response = new Response(new ReadableStream({ start(controller) {
    for (let i = 0; i < wire.length; i += 3) controller.enqueue(new TextEncoder().encode(wire.slice(i, i + 3)));
    controller.close();
  } }));
  const { hook, errors } = consumers.frontend(async () => response, lab.origin(lab.server));
  let complete;
  await hook.streamFetch('/api/convert', { url: target() }, data => { complete = data; });
  if (mutate) { expect(complete).toBeUndefined(); expect(errors).toContain('No data returned from server.'); }
  else { expect(complete.success).toBe(true); expect(complete.markdown).toContain('Native fixture'); expect(errors).toEqual([]); }
});
