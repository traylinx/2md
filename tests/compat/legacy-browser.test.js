import { beforeAll, test, expect } from 'vitest';
import { createRequire } from 'node:module';
import http from 'node:http';
const require = createRequire(import.meta.url);
const lab = require('./support/lab.cjs');
beforeAll(() => lab.start());
const body = () => ({ url: `${lab.origin(lab.target)}/empty`, method: 'browser' });

test.each(['json', 'markdown', 'stream'])('browser serializer %s with simulated worker', async format => {
  const r = await lab.request('POST', `/api/convert?format=${format}`, body());
  expect(r.status).toBe(200);
  if (format === 'markdown') expect(r.text).toBe(lab.workers.markdown);
  else {
    const data = format === 'json' ? r.json : JSON.parse(r.text.split('__JSON__')[1]);
    expect(data).toEqual({ success: true, url: body().url, markdown: lab.workers.markdown, method: 'browser', cache: 'miss',
      tokens: { html: 0, md: Math.ceil(lab.workers.markdown.length / 3.7) }, metadata: { title: 'Browser fixture' }, quality: { wordCount: 5 } });
    expect(data).not.toHaveProperty('fallbackReason'); expect(data).not.toHaveProperty('result');
  }
  const args = lab.workers.state.calls[0].args;
  expect(args.slice(-5)).toEqual(['-w', '10000', '--max-image-size', '10', '--front-matter']);
  expect(args).not.toContain('--no-download-images'); expect(args).not.toContain('--screenshot');
});

test('browser options keep flags and screenshot link; auto escalates empty page', async () => {
  const r = await lab.request('POST', '/api/convert', { ...body(), method: 'auto', downloadImages: false, frontMatter: false, screenshot: true, waitMs: 1250, maxImageSizeMb: 2 });
  const args = lab.workers.state.calls[0].args;
  expect(args).toContain('--no-download-images'); expect(args).not.toContain('--front-matter');
  expect(args[args.indexOf('-w') + 1]).toBe('1250');
  expect(args[args.indexOf('--max-image-size') + 1]).toBe('2');
  expect(r.json.screenshotUrl).toBe('/api/screenshot/127.0.0.1/empty');
  expect((await lab.request('GET', r.json.screenshotUrl)).text).toBe('synthetic-image');
});

test.each(['json', 'markdown', 'stream'])('missing browser output preserves %s error', async format => {
  lab.workers.state.mode = 'missing-output';
  const r = await lab.request('POST', `/api/convert?format=${format}`, body());
  expect(r.status).toBe(format === 'stream' ? 200 : 500);
  expect(r.text).toContain('Output markdown not found');
  if (format === 'stream') expect(r.text).toContain('__JSON__');
});

test('client disconnect invokes existing kill and failed-job path', async () => {
  lab.workers.state.mode = 'hold';
  const jobId = await new Promise((resolve, reject) => {
    const req = http.request(`${lab.origin(lab.server)}/api/convert?format=stream`, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, res => {
      res.once('data', () => { resolve(res.headers['x-job-id']); res.destroy(); });
    });
    req.on('error', reject); req.end(JSON.stringify(body()));
  });
  await new Promise(resolve => setTimeout(resolve, 30));
  expect(lab.workers.state.killed).toEqual([{ pid: lab.workers.state.calls[0].child.pid, signal: 'SIGKILL' }]);
  expect(lab.registry.getJob(jobId)).toMatchObject({ status: 'failed', error: 'Client disconnected' });
});
