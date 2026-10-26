'use strict';
// Disposable container lab. Provider/legacy browser boundaries stay doubled;
// actual serializers, extraction, HTTP, filesystem cache and job records run.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { createHash } = require('node:crypto');
const root = '/tmp/legacy-load'; fs.mkdirSync(root, { recursive: true });
Object.assign(process.env, { COMPAT_LAB_ROOT: root, COMPAT_REPO: '/app', HOME: root, TMPDIR: root,
  APP_DIR: `${root}/app`, JOBS_DIR: `${root}/jobs`, UPLOADS_DIR: `${root}/uploads`,
  API_KEYS: '{"enterprise":["synthetic-compat-key"]}', JOB_DOWNLOAD_SECRET: 'synthetic-lab-only' });
require('./support/guard.cjs');
const lab = require('./support/lab.cjs');
const native = fs.readFileSync('/app/tests/fixtures/compat/native.md', 'utf8');
const golden = JSON.parse(fs.readFileSync('/app/tests/fixtures/compat/static-golden.json', 'utf8'));
const signatures = new Set();
async function sample(kind, index) {
  const origin = lab.origin(lab.target);
  const pathname = kind === 'static' ? '/article' : kind === 'browser-stream' ? '/empty' : '/native';
  const body = { url: origin + pathname, method: kind === 'static' ? 'static' : kind === 'browser-stream' ? 'browser' : 'native' };
  const format = kind === 'browser-stream' ? 'stream' : 'json';
  const startedAt = Date.now(), start = performance.now();
  const response = await lab.request('POST', `/api/convert?format=${format}${kind === 'cache-hit' ? '' : '&force=true'}`, body);
  const data = format === 'stream' ? JSON.parse(response.text.split('__JSON__')[1]) : response.json;
  assert.equal(response.status, 200); assert.equal(data.success, true);
  const expected = kind === 'static' ? golden.markdown.replaceAll('https://owned.invalid', origin) : kind === 'browser-stream' ? lab.workers.markdown : native;
  assert.equal(data.markdown, expected);
  assert.equal(data.cache, kind === 'cache-hit' ? 'hit' : 'miss');
  const normalized = JSON.stringify({ status: response.status, body: data }).split(origin).join('https://fixture.example');
  signatures.add(createHash('sha256').update(normalized).digest('hex'));
  return { index, startedAt, durationMs: performance.now() - start };
}
(async () => {
  await lab.start(); const cells = [];
  for (const kind of ['native', 'static', 'browser-stream', 'cache-hit']) for (const concurrency of [1, 4]) {
    lab.reset(); signatures.clear();
    if (kind === 'cache-hit') await sample('native', -1);
    for (let n = 0; n < 4; n++) await sample(kind, -1);
    signatures.clear(); const samples = [];
    for (let n = 0; n < 32; n += concurrency) samples.push(...await Promise.all(Array.from({ length: concurrency }, (_, j) => sample(kind, n + j))));
    const durations = samples.map(s => s.durationMs).sort((a, b) => a - b);
    cells.push({ kind, concurrency, count: samples.length, errors: 0, p95: durations[Math.ceil(durations.length * .95) - 1],
      signatures: [...signatures].sort(), samples });
  }
  await lab.close(); process.stdout.write('\nLOAD_RESULT=' + JSON.stringify({ node: process.version, cells }) + '\n');
})().catch(async error => { console.error(error.stack); await lab.close(); process.exitCode = 1; });
