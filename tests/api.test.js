import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server'; // Must not include .js if using ES modules or CommonJS appropriately

describe('Core API Endpoints', () => {
  it('GET /api/health should return ok status', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.time).toBeDefined();
  });

  it('POST /api/convert (default / format=json) should extract single page markdown as clean JSON', async () => {
    // using example.com as a fast, reliable target
    const response = await request(app)
      .post('/api/convert')
      .send({
        url: 'https://example.com',
        downloadImages: false,
        frontMatter: true,
        format: 'json'
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.headers['x-request-id']).toBeDefined();
    
    // Check custom headers
    expect(response.headers['x-markdown-tokens']).toBeDefined();
    expect(response.headers['x-conversion-method']).toBeDefined();
    
    const data = response.body;
    expect(data.success).toBe(true);
    expect(data.url).toBe('https://example.com');
    expect(data.markdown).toContain('This domain is for use in');
    expect(data.tokens.md).toBeGreaterThan(0);
  }, 30000);

  it('POST /api/convert (Accept: text/markdown) should return plain markdown', async () => {
    const response = await request(app)
      .post('/api/convert')
      .set('Accept', 'text/markdown')
      .send({
        url: 'https://example.com',
        downloadImages: false,
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/markdown');
    
    // Response should just be raw text
    const text = response.text;
    expect(text).toContain('This domain is for use in');
    expect(text).not.toContain('"success":true'); // Should not be JSON
  }, 30000);

  it('POST /api/convert (format=stream) should act like legacy UI stream', async () => {
    const response = await request(app)
      .post('/api/convert')
      .send({
        url: 'https://example.com',
        format: 'stream'
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.headers['transfer-encoding']).toBe('chunked');
    
    const text = response.text;
    expect(text).toContain('__JSON__');
    
    const jsonString = text.split('__JSON__')[1];
    expect(jsonString).toBeDefined();
    
    const data = JSON.parse(jsonString);
    expect(data.success).toBe(true);
  }, 30000);

  it('GET /<url> should perform a URL-prepend conversion returning markdown', async () => {
    const response = await request(app)
      .get('/https://example.com');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/markdown');
    expect(response.text).toContain('This domain is for use in');
  }, 30000);

  it('POST /api/convert with method=static should use in-process extraction (no browser)', async () => {
    const response = await request(app)
      .post('/api/convert?force=true')
      .send({
        url: 'https://example.com',
        method: 'static',
        format: 'json',
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.method).toBe('static');
    expect(response.headers['x-conversion-method']).toBe('static');
    expect(response.headers['x-native-markdown']).toBe('false');
    expect(response.body.markdown).toContain('Example Domain');
  }, 30000);

  it('POST /api/convert with method=auto should run pipeline orchestration', async () => {
    // Use a unique URL to avoid cache hits from other tests
    const uniqueUrl = `https://example.org/?_t=${Date.now()}`;
    const response = await request(app)
      .post('/api/convert?force=true')
      .send({
        url: uniqueUrl,
        method: 'auto',
        format: 'json',
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    // auto picks the best pipeline — actual method depends on quality heuristics
    expect(['static', 'native', 'browser']).toContain(response.body.method);
    expect(response.headers['x-conversion-method']).toBe(response.body.method);
    expect(response.headers['x-markdown-tokens']).toBeDefined();
    expect(response.body.markdown).toBeDefined();
  }, 30000);

  it('POST /api/batch (format=stream) should process an array of URLs', async () => {
    const response = await request(app)
      .post('/api/batch')
      .send({
        urls: ['https://example.com'],
        downloadImages: false,
        frontMatter: false,
        format: 'stream'
      });

    expect(response.status).toBe(200);
    const text = response.text;
    
    // Debug output if JSON is missing
    if (!text.includes('__JSON__')) {
      console.log('BATCH RESPONSE:', text);
    }
    
    expect(text).toContain('__JSON__');
    
    const jsonString = text.split('__JSON__')[1];
    expect(jsonString).toBeDefined();
    
    const data = JSON.parse(jsonString);
    expect(data.success).toBe(true);
    expect(data.results).toBeDefined();
    
    // There should be one result
    expect(data.results.length).toBeGreaterThan(0);
    expect(data.results[0].success).toBe(true);
    expect(data.results[0].markdown).toContain('This domain is for use in');
  }, 30000);

  it('POST /api/batch (format=json) should return clean JSON without __JSON__ marker', async () => {
    const response = await request(app)
      .post('/api/batch')
      .send({
        urls: ['https://example.com'],
        downloadImages: false,
        format: 'json'
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body.success).toBe(true);
    expect(response.body.results).toBeDefined();
    expect(response.body.results.length).toBeGreaterThan(0);
    expect(response.body.results[0].success).toBe(true);
    expect(response.body.results[0].markdown).toContain('This domain is for use in');
  }, 30000);

  it('POST /api/crawl (treeOnly: true) should discover site structure without extraction', async () => {
    const response = await request(app)
      .post('/api/crawl')
      .send({
        url: 'https://example.com',
        maxPages: 1,
        treeOnly: true
      });

    expect(response.status).toBe(200);
    
    const text = response.text;
    expect(text).toContain('__JSON__');
    
    const jsonString = text.split('__JSON__')[1];
    const data = JSON.parse(jsonString);
    expect(data.success).toBe(true);
    // Tree only mode returns an empty files object since no extraction occurs
    // Wait, the API for crawl (treeOnly) returns { tree, urls } not files.
    expect(data.urls).toBeDefined(); 
  }, 30000);
});
