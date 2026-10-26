import { beforeAll, test, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const lab = require('./support/lab.cjs');
beforeAll(() => lab.start());
const nativeUrl = () => `${lab.origin(lab.target)}/native`;

test.each(['/api/convert', '/api/batch', '/api/crawl', '/api/agentify', '/api/file2md', '/api/video2md'])('%s validation remains registered', async endpoint => {
  const r = await lab.request('POST', endpoint, {});
  expect(r.status).toBe(400); expect(r.json.success).toBe(false); expect(r.json.code).toBe('VALIDATION_ERROR');
});
test('health, upload capabilities, CORS and unknown enhanced route', async () => {
  expect((await lab.request('GET', '/api/health')).json).toMatchObject({ status: 'ok', api: 'html2md', version: '2.0.0' });
  expect((await lab.request('GET', '/api/upload-info')).json).toMatchObject({ maxFileSizeMb: 100, extensions: expect.arrayContaining(['.pdf']) });
  const preflight = await lab.request('OPTIONS', '/api/convert', undefined, { Origin: 'https://owned.invalid', 'Access-Control-Request-Method': 'POST' });
  expect(preflight.status).toBe(204); expect(preflight.headers['access-control-allow-origin']).toBe('*');
  expect((await lab.request('POST', '/api/capture/v1', {})).status).toBe(404);
  expect((await lab.request('GET', '/api/ping')).json).toEqual({ error: 'Missing url' });
  expect((await lab.request('GET', `/api/ping?url=${encodeURIComponent(nativeUrl())}`)).json).toEqual({ status: 200 });
});
test('batch native JSON and cached async lifecycle', async () => {
  const r = await lab.request('POST', '/api/batch', { urls: [nativeUrl()], method: 'native' });
  expect(r.status).toBe(200); expect(r.json.success).toBe(true);
  expect(r.json.results[0]).toMatchObject({ success: true, method: 'native', url: nativeUrl() });
  const async = await lab.request('POST', '/api/batch', { urls: [nativeUrl()], async: true });
  expect(async.status).toBe(202); expect(async.json).toMatchObject({ success: true, status: 'running', status_url: `/api/jobs/${async.json.job_id}` });
  expect(lab.registry.getJob(async.json.job_id).status).toBe('done');
});
test.each(['/api/crawl', '/api/agentify'])('%s async worker completion is recoverable', async endpoint => {
  const r = await lab.request('POST', endpoint, { url: nativeUrl(), async: true });
  expect(r.status).toBe(202); await new Promise(resolve => setTimeout(resolve, 20));
  expect(lab.registry.getJob(r.json.job_id).status).toBe('done');
  expect(lab.registry.getJob(r.json.job_id).downloadUrl).toMatch(/token=/);
});
test('crawl tree stream retains marker, URLs and default limits', async () => {
  const r = await lab.request('POST', '/api/crawl', { url: nativeUrl(), treeOnly: true });
  const data = JSON.parse(r.text.split('__JSON__')[1]);
  expect(data).toMatchObject({ success: true, urls: ['https://owned.invalid/page'], stats: { depth: 3, maxPages: 50 }, llmsGuided: false });
});
test('agentify synchronous stream stays text; worker failure stored', async () => {
  lab.workers.state.mode = 'failure';
  const r = await lab.request('POST', '/api/agentify', { url: nativeUrl() });
  expect(r.status).toBe(200); expect(r.text).toContain('Synthetic agent worker');
  expect(lab.registry.getJob(r.headers['x-job-id']).status).toBe('failed');
});
test.each(['json', 'markdown', 'stream'])('file2md %s output from simulated provider', async format => {
  const r = await lab.request('POST', `/api/file2md?format=${format}`, { url: 'https://owned.invalid/file.pdf' });
  expect(r.status).toBe(200);
  if (format === 'json') expect(r.json).toEqual(lab.workers.result);
  if (format === 'markdown') expect(r.text).toBe(lab.workers.result.markdown);
  if (format === 'stream') expect(r.text).toContain('__JSON__');
  expect(lab.registry.getJob(r.headers['x-job-id']).status).toBe('done');
});
test('file upload lifecycle unlinks temporary input; premium rejects missing key', async () => {
  const form = new FormData(); form.append('file', new Blob(['owned upload']), 'fixture.txt');
  const response = await fetch(`${lab.origin(lab.server)}/api/file2md`, { method: 'POST', body: form });
  expect(response.status).toBe(200); expect((await response.json()).success).toBe(true);
  expect(fs.readdirSync(process.env.UPLOADS_DIR)).toEqual([]);
  const denied = await lab.request('POST', '/api/file2md', { url: 'https://owned.invalid/image.png' });
  expect(denied.status).toBe(401);
});
test('video2md unauthorized and prohibited host do not spawn', async () => {
  expect((await lab.request('POST', '/api/video2md', { url: 'https://owned.invalid/video', apiKey: 'wrong' })).status).toBe(401);
  expect((await lab.request('POST', '/api/video2md', { url: 'https://owned.invalid/video', apiKey: 'synthetic-video-key' })).status).toBe(400);
  expect(lab.workers.state.calls).toHaveLength(0);
});
test('job history, ownership, result, log, signed download and deletion', async () => {
  const r = await lab.request('POST', '/api/convert', { url: nativeUrl() }, { 'x-client-id': 'owner-a' });
  const id = r.headers['x-job-id'];
  expect((await lab.request('GET', `/api/jobs/${id}`)).status).toBe(404);
  expect((await lab.request('GET', `/api/jobs/${id}/result`)).status).toBe(404);
  const headers = { 'x-client-id': 'owner-a' };
  const meta = await lab.request('GET', `/api/jobs/${id}`, undefined, headers);
  expect(meta.json.hasResult).toBe(true); expect(meta.json).not.toHaveProperty('inlineResult');
  expect((await lab.request('GET', `/api/jobs/${id}/result`, undefined, headers)).json.result).toEqual(r.json);
  expect((await lab.request('GET', `/api/jobs/${id}/logs`)).text).toContain('Converted in-process');
  expect((await lab.request('GET', '/api/jobs', undefined, headers)).json.jobs).toHaveLength(1);
  expect((await lab.request('GET', `/api/download/job/${id}`)).status).toBe(401);
  expect((await lab.request('GET', `/api/download/job/${id}?token=invalid`)).status).toBe(403);
  const { token } = require('../../lib/jobs/downloadToken').generateDownloadToken(id);
  const zip = await lab.request('GET', `/api/download/job/${id}?token=${token}`);
  expect(zip.status).toBe(200); expect(zip.headers['content-type']).toBe('application/zip'); expect(zip.text.startsWith('PK')).toBe(true);
  expect((await lab.request('DELETE', '/api/jobs', undefined, headers)).json).toEqual({ deleted: 1 });
});
test('cache statistics, scoped site archive and purge', async () => {
  await lab.request('POST', '/api/convert', { url: nativeUrl() });
  expect((await lab.request('GET', '/api/cache/stats')).json.totalCachedPages).toBe(1);
  const zip = await lab.request('GET', '/api/download/127.0.0.1?slugs=native');
  expect(zip.status).toBe(200); expect(zip.text.startsWith('PK')).toBe(true);
  expect((await lab.request('DELETE', '/api/cache/127.0.0.1')).status).toBe(200);
  expect((await lab.request('GET', '/api/download/missing.invalid')).status).toBe(404);
  expect((await lab.request('GET', '/api/screenshot/missing.invalid/page')).status).toBe(404);
});
test('memory pressure rejects heavy requests but exempts health', async () => {
  lab.state.memory = 768;
  const r = await lab.request('POST', '/api/convert', { url: nativeUrl() });
  expect(r.status).toBe(503); expect(r.headers['retry-after']).toBe('30');
  expect((await lab.request('GET', '/api/health')).status).toBe(200);
});
