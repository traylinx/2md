import { test, beforeAll, expect } from 'vitest';
import { createRequire } from 'node:module';
import http from 'node:http';
const require = createRequire(import.meta.url);
const lab = require('./support/lab.cjs');
beforeAll(() => lab.start());
const video = { url: 'https://video.owned.invalid/watch', apiKey: 'synthetic-video-key' };
test.each(['json', 'markdown', 'stream'])('video2md %s real serializer, synthetic DNS and worker', async format => {
  const r = await lab.request('POST', `/api/video2md?format=${format}`, video);
  expect(r.status).toBe(200);
  if (format === 'json') expect(r.json).toEqual(lab.workers.videoResult);
  if (format === 'markdown') expect(r.text).toBe(lab.workers.videoResult.files['full_document.md']);
  if (format === 'stream') expect(r.text).toContain('__JSON__');
  expect(lab.registry.getJob(r.headers['x-job-id']).status).toBe('done');
});
test.each(['json', 'markdown'])('no-caption verdict %s remains recoverable without claiming transcription', async format => {
  lab.workers.state.mode = 'no-captions';
  const r = await lab.request('POST', `/api/video2md?format=${format}`, video);
  expect(r.status).toBe(format === 'json' ? 200 : 422);
  if (format === 'json') {
    expect(r.json.needsTranscription).toBe(true);
    expect(lab.registry.getJob(r.headers['x-job-id']).status).toBe('done');
  } else expect(r.json.code).toBe('NO_CAPTIONS');
});
test.each(['/api/file2md', '/api/video2md'])('%s JSON disconnect permits job-poll recovery', async endpoint => {
  lab.workers.state.mode = 'hold';
  const body = endpoint.includes('video') ? video : { url: 'https://owned.invalid/file.pdf' };
  const id = await new Promise((resolve, reject) => {
    const req = http.request(lab.origin(lab.server) + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer synthetic-compat-key' } }, res => {
      res.once('data', () => { resolve(res.headers['x-job-id']); res.destroy(); });
    });
    req.on('error', reject); req.end(JSON.stringify(body));
  });
  await new Promise(resolve => setTimeout(resolve, 25));
  expect(lab.workers.state.killed).toEqual([]);
  const child = lab.workers.state.calls[0].child;
  child.stdout.emit('data', Buffer.from(`__JSON__${JSON.stringify(lab.workers.result)}\n`));
  child.exitCode = 0; child.emit('close', 0);
  expect((await lab.request('GET', `/api/jobs/${id}/result`)).json.result).toEqual(lab.workers.result);
});
test('running job log stream disconnect closes disposable Redis subscriber', async () => {
  const job = lab.registry.createJob('crawl', 'https://owned.invalid', 'owned');
  const req = http.get(`${lab.origin(lab.server)}/api/jobs/${job.id}/logs`);
  req.on('error', () => {});
  const until = Date.now() + 1000;
  while (!lab.state.subscribers.length && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 5));
  const sub = lab.state.subscribers.at(-1); expect(sub).toBeTruthy();
  const received = new Promise(resolve => req.once('response', res => {
    res.once('data', chunk => { expect(chunk.toString()).toContain('data:'); res.destroy(); resolve(); });
  }));
  sub.emit('message', `job:logs:${job.id}`, 'synthetic log'); await received;
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(sub.closed).toBe(true); expect(sub.unsubscribed).toBe(true);
});
test('URL shortcuts retain Markdown and async crawl dispatch', async () => {
  const url = `${lab.origin(lab.target)}/native`;
  const converted = await lab.request('GET', `/${url}`);
  expect(converted.status).toBe(200); expect(converted.headers['content-type']).toContain('text/markdown');
  expect(converted.text).toContain('Native fixture');
  const file = await lab.request('GET', '/file2md/https://owned.invalid/file.pdf');
  expect(file.status).toBe(200); expect(file.text).toBe(lab.workers.result.markdown);
  const crawl = await lab.request('GET', `/crawl/${url}?depth=2&maxPages=4`);
  expect(crawl.status).toBe(202); expect(crawl.json.status).toBe('running');
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(lab.registry.getJob(crawl.json.job_id).resultSummary).toMatchObject({ depth: 2, maxPages: 4 });
});
test('batch presets preserve compact/chunked representations', async () => {
  const url = `${lab.origin(lab.target)}/native`;
  const compact = await lab.request('POST', '/api/batch', { urls: [url], method: 'native', preset: 'compact' });
  expect(compact.json.results[0].markdown).toContain('Native fixture');
  const chunks = await lab.request('POST', '/api/batch', { urls: [url], preset: 'chunks' });
  expect(chunks.json.results[0].chunks).toBeInstanceOf(Array);
  expect(chunks.json.results[0]).not.toHaveProperty('markdown');
});
test('platform key tier and expiry verification execute real helpers', () => {
  const { validateApiKey } = require('../../lib/auth/apiKeys');
  expect(validateApiKey('Bearer synthetic-compat-key')).toMatchObject({ tier: 'enterprise' });
  expect(validateApiKey('Bearer unknown')).toBeNull();
  const { generateDownloadToken, verifyDownloadToken } = require('../../lib/jobs/downloadToken');
  const { token } = generateDownloadToken('j_fixture');
  expect(verifyDownloadToken('j_fixture', token).valid).toBe(true);
  expect(verifyDownloadToken('j_other', token).valid).toBe(false);
  const payload = Buffer.from(token, 'base64url').toString().split('|');
  payload[1] = '2000-01-01T00:00:00.000Z';
  expect(verifyDownloadToken('j_fixture', Buffer.from(payload.join('|')).toString('base64url'))).toEqual({ valid: false, reason: 'Token expired' });
});
