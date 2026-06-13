import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../server.js';
import { srtToText } from '../lib/video/srtDedup.js';
import { validateVideoUrl, hostAllowed, isPrivateIp, parseAllowedHosts } from '../lib/video/ssrfGuard.js';
import { tryAcquire, release, activeCount, maxConcurrency, _reset } from '../lib/video/concurrency.js';

// ── Pure logic: SRT/VTT dedup ────────────────────────────────────────────────
describe('video2md / srtToText', () => {
  it('strips indices + timestamps and joins to prose', () => {
    const srt = [
      '1', '00:00:01,000 --> 00:00:03,000', 'Hello world', '',
      '2', '00:00:03,000 --> 00:00:05,000', 'this is a test', '',
    ].join('\n');
    expect(srtToText(srt)).toBe('Hello world this is a test');
  });

  it('dedupes rolling auto-sub overlap (substring of previous)', () => {
    const srt = [
      '1', '00:00:00,000 --> 00:00:02,000', 'the quick brown', '',
      '2', '00:00:02,000 --> 00:00:04,000', 'the quick brown fox', '',
      '3', '00:00:04,000 --> 00:00:06,000', 'fox', '',
    ].join('\n');
    // "the quick brown" is contained in the next line → replaced; trailing "fox" already present
    expect(srtToText(srt)).toBe('the quick brown fox');
  });

  it('drops exact consecutive duplicates', () => {
    const srt = [
      '1', '00:00:00,000 --> 00:00:02,000', 'same line', '',
      '2', '00:00:02,000 --> 00:00:04,000', 'same line', '',
    ].join('\n');
    expect(srtToText(srt)).toBe('same line');
  });

  it('handles WEBVTT headers and inline timing tags', () => {
    const vtt = [
      'WEBVTT', 'Kind: captions', 'Language: en', '',
      '00:00:01.000 --> 00:00:03.000', '<00:00:01.000><c>Hello</c> there', '',
    ].join('\n');
    expect(srtToText(vtt)).toBe('Hello there');
  });

  it('returns empty string for empty/garbage input', () => {
    expect(srtToText('')).toBe('');
    expect(srtToText(null)).toBe('');
    expect(srtToText('1\n00:00:01,000 --> 00:00:02,000\n')).toBe('');
  });
});

// ── Pure logic: SSRF guard ───────────────────────────────────────────────────
describe('video2md / ssrfGuard', () => {
  it('hostAllowed: exact + subdomain, never look-alike or substring', () => {
    const hosts = ['youtube.com', 'youtu.be'];
    expect(hostAllowed('youtube.com', hosts)).toBe(true);
    expect(hostAllowed('www.youtube.com', hosts)).toBe(true);
    expect(hostAllowed('m.youtube.com', hosts)).toBe(true);
    expect(hostAllowed('youtu.be', hosts)).toBe(true);
    expect(hostAllowed('attacker-youtube.com', hosts)).toBe(false);
    expect(hostAllowed('youtube.com.evil.com', hosts)).toBe(false);
    expect(hostAllowed('notyoutube.com', hosts)).toBe(false);
    expect(hostAllowed('', hosts)).toBe(false);
  });

  it('isPrivateIp: blocks RFC1918 / loopback / link-local / metadata / IPv6', () => {
    expect(isPrivateIp('10.0.0.1')).toBe(true);
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('169.254.169.254')).toBe(true); // cloud metadata
    expect(isPrivateIp('172.16.5.5')).toBe(true);
    expect(isPrivateIp('192.168.1.1')).toBe(true);
    expect(isPrivateIp('100.64.0.1')).toBe(true); // CGNAT
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('fd00::1')).toBe(true);
    expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true); // IPv4-mapped
    expect(isPrivateIp('142.250.72.206')).toBe(false); // public (google)
    expect(isPrivateIp('not-an-ip')).toBe(true); // unparseable → unsafe
  });

  it('parseAllowedHosts: default + env override', () => {
    expect(parseAllowedHosts(undefined)).toEqual(['youtube.com', 'youtu.be']);
    expect(parseAllowedHosts('youtube.com, vimeo.com')).toEqual(['youtube.com', 'vimeo.com']);
    expect(parseAllowedHosts('')).toEqual(['youtube.com', 'youtu.be']);
  });

  it('validateVideoUrl: accepts an allowed host resolving to a public IP', async () => {
    const r = await validateVideoUrl('https://youtu.be/abc123', ['youtube.com', 'youtu.be'], {
      resolver: async () => [{ address: '142.250.72.206' }],
    });
    expect(r.ok).toBe(true);
    expect(r.hostname).toBe('youtu.be');
  });

  it('validateVideoUrl: rejects disallowed host without DNS', async () => {
    let resolverCalled = false;
    const r = await validateVideoUrl('https://evil.com/youtube.com', ['youtube.com', 'youtu.be'], {
      resolver: async () => { resolverCalled = true; return [{ address: '1.2.3.4' }]; },
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('host-not-allowed');
    expect(resolverCalled).toBe(false);
  });

  it('validateVideoUrl: rejects bad protocol + invalid url', async () => {
    expect((await validateVideoUrl('ftp://youtube.com/x', ['youtube.com'])).reason).toBe('bad-protocol');
    expect((await validateVideoUrl('not a url', ['youtube.com'])).reason).toBe('invalid-url');
  });

  it('validateVideoUrl: rejects an allowed host that resolves to a private IP (rebinding/poison defense)', async () => {
    const r = await validateVideoUrl('https://youtube.com/watch?v=x', ['youtube.com'], {
      resolver: async () => [{ address: '169.254.169.254' }],
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('resolves-to-private-ip');
  });
});

// ── Pure logic: concurrency limiter ──────────────────────────────────────────
describe('video2md / concurrency', () => {
  beforeEach(() => { _reset(); });
  afterEach(() => { delete process.env.VIDEO2MD_MAX_CONCURRENCY; _reset(); });

  it('acquires up to the cap then refuses', () => {
    process.env.VIDEO2MD_MAX_CONCURRENCY = '2';
    expect(maxConcurrency()).toBe(2);
    expect(tryAcquire()).toBe(true);
    expect(tryAcquire()).toBe(true);
    expect(tryAcquire()).toBe(false); // at cap
    expect(activeCount()).toBe(2);
  });

  it('release frees a slot; never underflows', () => {
    process.env.VIDEO2MD_MAX_CONCURRENCY = '1';
    expect(tryAcquire()).toBe(true);
    expect(tryAcquire()).toBe(false);
    release();
    expect(activeCount()).toBe(0);
    release(); // underflow guard
    expect(activeCount()).toBe(0);
    expect(tryAcquire()).toBe(true);
  });

  it('defaults to 3 when unset/invalid', () => {
    delete process.env.VIDEO2MD_MAX_CONCURRENCY;
    expect(maxConcurrency()).toBe(3);
    process.env.VIDEO2MD_MAX_CONCURRENCY = 'garbage';
    expect(maxConcurrency()).toBe(3);
  });
});

// ── Route: offline rejections (never spawn yt-dlp, never hit DNS) ─────────────
describe('video2md route — offline rejections', () => {
  it('400 when url is missing', async () => {
    const res = await request(app).post('/api/video2md').send({ apiKey: 'sk-test' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing url/i);
  });

  it('401 when apiKey is missing', async () => {
    const res = await request(app).post('/api/video2md').send({ url: 'https://youtu.be/abc' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('400 when host is not allowlisted (no DNS, no spawn)', async () => {
    const res = await request(app).post('/api/video2md').send({ url: 'https://evil.com/clip', apiKey: 'sk-test' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/host-not-allowed/);
  });

  it('400 on a non-http protocol', async () => {
    const res = await request(app).post('/api/video2md').send({ url: 'file:///etc/passwd', apiKey: 'sk-test' });
    expect(res.status).toBe(400);
  });
});

// ── E2E (gated on a key + yt-dlp + network), mirrors file2md.test.js ──────────
const E2E_KEY = process.env.VIDEO2MD_TEST_API_KEY || process.env.SWITCHAI_API_KEY;
const describeE2E = E2E_KEY ? describe : describe.skip;

describeE2E('video2md route — E2E (requires yt-dlp + network + key)', () => {
  it('extracts a transcript from a captioned YouTube video', async () => {
    const res = await request(app)
      .post('/api/video2md')
      .set('x-client-id', 'video2md-test')
      .send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', apiKey: E2E_KEY, format: 'json' });
    expect(res.status).toBe(200);
    // json route writes padding before the body — supertest gives us the buffered text
    const idx = res.text.indexOf('{');
    const data = JSON.parse(res.text.slice(idx));
    expect(data.success).toBe(true);
    expect(data.files['full_document.md'].length).toBeGreaterThan(20);
  }, 180000);
});
