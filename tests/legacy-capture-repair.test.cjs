'use strict';
// Pure local regressions: no browser, remote site, .env or real cache access.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

function cacheLab(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '2md-cache-unit-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'lib/cacheManager.js'), 'utf8'), {
    module, process: { pid: process.pid }, console, URL,
    require(name) {
      if (name === './config') return { JOBS_DIR: dir };
      if (['fs', 'path', 'crypto'].includes(name)) return require(name);
      throw Error('Unexpected dependency');
    }
  });
  return { cache: module.exports, dir };
}
const url = 'https://owned.invalid/plans?tab=monthly';
const result = markdown => ({ markdown, quality: { wordCount: 10 } });

test('refresh replaces existing Markdown and matching metadata, leaving no temp files', t => {
  const { cache, dir } = cacheLab(t);
  cache.writeMeta(url, result('old incomplete header'));
  cache.writeMeta(url, result('fresh complete plans'));
  assert.equal(cache.getCachedPage(url).markdown, 'fresh complete plans');
  const files = fs.readdirSync(path.join(dir, 'owned.invalid/pages/plans/output')).sort();
  assert.deepEqual(files, ['meta.json', 'page.md']);
});

test('stale content with fresh metadata is a cache miss, not false success', t => {
  const { cache, dir } = cacheLab(t);
  cache.writeMeta(url, result('fresh complete plans'));
  fs.writeFileSync(path.join(dir, 'owned.invalid/pages/plans/output/page.md'), 'old incomplete header');
  assert.equal(cache.getCachedPage(url), null);
});

test('legacy cache entries without a hash remain readable', t => {
  const { cache, dir } = cacheLab(t);
  cache.writeMeta(url, result('legacy content'));
  const file = path.join(dir, 'owned.invalid/pages/plans/output/meta.json');
  const meta = JSON.parse(fs.readFileSync(file)); delete meta.contentHash;
  fs.writeFileSync(file, JSON.stringify(meta));
  assert.equal(cache.getCachedPage(url).markdown, 'legacy content');
});

test('force and maxAge semantics remain unchanged', t => {
  const { cache } = cacheLab(t);
  cache.writeMeta(url, result('content'));
  assert.equal(cache.getCachedPage(url, null, 'true'), null);
  assert.equal(cache.getCachedPage(url, null, true), null);
  assert.equal(cache.getCachedPage(url, null, 'false').markdown, 'content');
  assert.equal(cache.getCachedPage(url, null, '1').markdown, 'content');
  assert.equal(cache.getCachedPage(url, -1), null);
});

async function runFetch() {
  const handlers = {}, captured = { extraHeaders: null, writes: [], exits: [], scripts: 0, blocked: 0 };
  const page = {
    setRequestInterception: async () => {}, on: (name, fn) => { handlers[name] = fn; },
    setUserAgent: async () => {}, setExtraHTTPHeaders: async value => { captured.extraHeaders = JSON.parse(JSON.stringify(value)); },
    evaluateOnNewDocument: async () => {},
    goto: async () => {
      for (const type of ['script', 'image']) handlers.request({ resourceType: () => type,
        url: () => 'https://cdn.owned.invalid/resource',
        abort: () => { captured.blocked++; }, continue: () => { captured.scripts++; } });
    },
    evaluate: async fn => fn.toString().includes('needsJsWait') || fn.toString().includes('return !!') ? false : { title: 'Fixture' },
    content: async () => '<html><body><main>Complete fixture content</main></body></html>'
  };
  const browser = { newPage: async () => page, close: async () => {} };
  const puppeteer = { use: () => {}, launch: async () => browser };
  const dependencies = {
    'puppeteer-extra': puppeteer, 'puppeteer-extra-plugin-stealth': () => ({}),
    '../lib/adBlockList': { isAdDomain: () => false }, '../lib/userAgents': { getRandomUA: () => 'synthetic-UA' },
    fs: { mkdirSync: () => {}, writeFileSync: (file, text) => captured.writes.push({ file, text }) },
    path, http: {}, https: {}
  };
  await vm.runInNewContext(fs.readFileSync(path.join(root, 'scripts/fetch.js'), 'utf8'), {
    require: name => { if (!(name in dependencies)) throw Error('Unexpected dependency'); return dependencies[name]; },
    process: { argv: ['node', 'fetch.js', url, '/synthetic-job', '10000'], exit: code => captured.exits.push(code) },
    console: { log: () => {}, error: () => {} }, URL,
    setTimeout: () => { throw Error('Unexpected unbounded wait'); }
  });
  return captured;
}

test('browser generates per-resource Accept, Sec-Fetch and upgrade headers', async () => {
  const r = await runFetch();
  assert.deepEqual(r.extraHeaders, { 'Accept-Language': 'en-US,en;q=0.9' });
  assert.deepEqual(r.exits, [0]);
});

test('script loading, image filtering and successful rendered output retain their behavior', async () => {
  const r = await runFetch();
  assert.equal(r.scripts, 1); assert.equal(r.blocked, 1);
  assert.ok(r.writes.some(x => x.file.endsWith('rendered.html') && x.text.includes('Complete fixture content')));
});
