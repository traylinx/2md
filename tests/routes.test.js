import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server.js';
import path from 'path';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

describe('File2MD — Multer Upload Validation', () => {
  it('should accept a .m4a file upload and not crash with 500', async () => {
    const response = await request(app)
      .post('/api/file2md')
      .attach('file', path.join(FIXTURES_DIR, 'sample.m4a'))
      .field('apiKey', 'sk-test-fake-key');

    // Should NOT be a 500 HTML crash — either 200 (processing) or a clean JSON error
    expect(response.status).not.toBe(500);
  });

  it('should accept a .mp3 file upload without error', async () => {
    const response = await request(app)
      .post('/api/file2md')
      .attach('file', path.join(FIXTURES_DIR, 'sample.mp3'))
      .field('apiKey', 'sk-test-fake-key');

    expect(response.status).not.toBe(500);
  });

  it('should accept a .png image upload without error', async () => {
    const response = await request(app)
      .post('/api/file2md')
      .attach('file', path.join(FIXTURES_DIR, 'sample.png'))
      .field('apiKey', 'sk-test-fake-key');

    expect(response.status).not.toBe(500);
  });

  it('should accept a .txt file upload without error', async () => {
    const response = await request(app)
      .post('/api/file2md')
      .attach('file', path.join(FIXTURES_DIR, 'sample.txt'))
      .field('apiKey', 'sk-test-fake-key');

    expect(response.status).not.toBe(500);
  });

  it('should reject an unsupported .exe file with a clean 400 JSON error', async () => {
    const response = await request(app)
      .post('/api/file2md')
      .attach('file', path.join(FIXTURES_DIR, 'sample.exe'))
      .field('apiKey', 'sk-test-fake-key');

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Unsupported file type');
  });

  it('should return 400 when file is uploaded without apiKey', async () => {
    const response = await request(app)
      .post('/api/file2md')
      .attach('file', path.join(FIXTURES_DIR, 'sample.txt'));

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Missing apiKey');
  });
});

describe('Route Validation — Convert', () => {
  it('POST /api/convert should return 400 if no url provided', async () => {
    const response = await request(app)
      .post('/api/convert')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Missing url in request body');
  });

  // We don't strictly reject invalid formats, we fall back gracefully (usually to json)
  // as per resolveFormat logic. But we should ensure it doesn't crash.
  it('POST /api/convert should handle unknown format gracefully', async () => {
    const response = await request(app)
      .post('/api/convert')
      .send({
        url: 'https://example.com',
        format: 'banana'
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
  }, 30000);

  it('POST /api/convert should return 400 for invalid method', async () => {
    const response = await request(app)
      .post('/api/convert')
      .send({
        url: 'https://example.com',
        method: 'turbo',
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('Invalid method');
    expect(response.body.error).toContain('turbo');
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('Route Validation — Batch', () => {
  it('POST /api/batch should return 400 if no urls array provided', async () => {
    const response = await request(app)
      .post('/api/batch')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Missing urls array in request body');
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/batch should return 400 if urls is empty', async () => {
    const response = await request(app)
      .post('/api/batch')
      .send({ urls: [] });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Missing urls array in request body');
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('Route Validation — Crawl', () => {
  it('POST /api/crawl should return 400 if no url provided', async () => {
    const response = await request(app)
      .post('/api/crawl')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Missing url in request body');
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('Route — Crawl URL-Prepend (/crawl/)', () => {
  it('GET /crawl/https://example.com should return 202 with job_id (async crawl)', async () => {
    const response = await request(app).get('/crawl/https://example.com');

    expect(response.status).toBe(202);
    expect(response.body.success).toBe(true);
    expect(response.body.job_id).toBeDefined();
    expect(response.body.status).toBe('running');
    expect(response.body.status_url).toContain('/api/jobs/');
  }, 30000);

  it('GET /crawl/https://example.com?depth=1&maxPages=10 should pass params through', async () => {
    const response = await request(app).get('/crawl/https://example.com?depth=1&maxPages=10');

    expect(response.status).toBe(202);
    expect(response.body.job_id).toBeDefined();
  }, 30000);

  it('GET /crawl/not-a-url should fall through (not intercepted)', async () => {
    const response = await request(app).get('/crawl/not-a-url');

    // Falls through to SPA fallback → serves index.html
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
  });
});

describe('Route Validation — Agentify', () => {
  it('POST /api/agentify should return 400 if no url provided', async () => {
    const response = await request(app)
      .post('/api/agentify')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Missing url in request body');
  });
});

describe('Route Validation — Jobs', () => {
  it('GET /api/jobs should return a jobs array', async () => {
    const response = await request(app).get('/api/jobs');

    expect(response.status).toBe(200);
    expect(response.body.jobs).toBeDefined();
    expect(Array.isArray(response.body.jobs)).toBe(true);
  });

  it('GET /api/jobs/:id should return 404 for unknown job', async () => {
    const response = await request(app).get('/api/jobs/nonexistent_id');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Job not found');
  });
});

describe('Route Validation — Health & Info', () => {
  it('GET /api/health should return ok', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('GET /api/upload-info should return format capabilities', async () => {
    const response = await request(app).get('/api/upload-info');

    expect(response.status).toBe(200);
    expect(response.body.extensions).toBeDefined();
    expect(response.body.acceptString).toContain('.m4a');
    expect(response.body.acceptString).toContain('.mp4');
    expect(response.body.acceptString).toContain('.mp3');
  });
});
