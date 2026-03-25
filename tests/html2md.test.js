import { describe, it, expect } from 'vitest';

const API_BASE = process.env.PRODUCTION_API_URL || 'https://2md.traylinx.com';

describe('Production E2E: HTML2MD', () => {

  it('should reject requests without a URL', async () => {
    const res = await fetch(`${API_BASE}/api/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  it('should convert a basic webpage to JSON', async () => {
    const res = await fetch(`${API_BASE}/api/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://example.com',
        format: 'json'
      })
    });
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    // Verify frontend data contract
    expect(data.success).toBe(true);
    expect(data.markdown).toBeDefined();
    expect(data.markdown.length).toBeGreaterThan(10);
    expect(data.markdown).toContain('Example Domain');
  }, 15000);

  it('should parse the __JSON__ suffix correctly in stream format (frontend simulation)', async () => {
    const res = await fetch(`${API_BASE}/api/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://example.com',
        format: 'stream'
      })
    });
    
    expect(res.status).toBe(200);
    const text = await res.text();
    
    // Simulate frontend useStreamFetch.js parsing
    const jsonIdx = text.indexOf('__JSON__');
    let jsonStr = '';
    if (jsonIdx === -1) {
      const trimmed = text.trim();
      if (trimmed.startsWith('{')) {
        jsonStr = trimmed;
      } else {
        throw new Error('No data returned from server.');
      }
    } else {
      jsonStr = text.substring(jsonIdx + 8);
    }

    let braceCount = 0;
    let endIndex = -1;
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < jsonStr.length; i++) {
        const char = jsonStr[i];
        if (escapeNext) { escapeNext = false; continue; }
        if (char === '\\') { escapeNext = true; continue; }
        if (char === '"') { inString = !inString; continue; }
        if (!inString) {
            if (char === '{') braceCount++;
            else if (char === '}') {
                braceCount--;
                if (braceCount === 0) { endIndex = i; break; }
            }
        }
    }

    expect(endIndex).not.toBe(-1);
    const cleanJsonStr = jsonStr.substring(0, endIndex + 1).trim();
    const data = JSON.parse(cleanJsonStr);

    // Verify frontend data contract
    expect(data.success).toBe(true);
    expect(data.markdown).toBeDefined();
    expect(data.markdown).toContain('Example Domain');
  }, 15000);

  it('should accept email parameter and trigger async batch processing', async () => {
    const res = await fetch(`${API_BASE}/api/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urls: ['https://example.com/'],
        async: true,
        email: 'test@traylinx.com'
      })
    });
    
    expect(res.status).toBe(202);
    const data = await res.json();
    
    expect(data.success).toBe(true);
    expect(data.job_id).toBeDefined();
    expect(data.status).toBe('running');
    expect(data.status_url).toContain(data.job_id);
    expect(data.result_url).toContain(data.job_id);
  }, 10000);

  it('should accept email parameter and trigger async crawl processing', async () => {
    const res = await fetch(`${API_BASE}/api/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://example.com/',
        maxPages: 1,
        depth: 1,
        async: true,
        email: 'test@traylinx.com'
      })
    });
    
    expect(res.status).toBe(202);
    const data = await res.json();
    
    expect(data.success).toBe(true);
    expect(data.job_id).toBeDefined();
    expect(data.status).toBe('running');
    expect(data.status_url).toContain(data.job_id);
    expect(data.result_url).toContain(data.job_id);
  }, 10000);

  it('should execute a full Crawl -> Batch -> Download Flow (E2E Integration)', async () => {
    // Phase 1: Crawl Discovery
    const TARGET_URL = 'https://docs.traylinx.com';
    const crawlRes = await fetch(`${API_BASE}/api/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: TARGET_URL,
        maxPages: 3, // keep it small for testing
        depth: 1,
        treeOnly: true
      })
    });
    
    expect(crawlRes.status).toBe(200);
    const crawlText = await crawlRes.text();
    
    const jsonIdx = crawlText.lastIndexOf('__JSON__');
    expect(jsonIdx).not.toBe(-1);
    const crawlData = JSON.parse(crawlText.substring(jsonIdx + 8).trim());
    
    expect(crawlData.success).toBe(true);
    expect(crawlData.urls).toBeDefined();
    expect(crawlData.urls.length).toBeGreaterThan(0);
    
    const urlsToBatch = crawlData.urls.slice(0, 2); // just batch 2 URLs
    
    // Phase 2: Batch Conversion
    const batchRes = await fetch(`${API_BASE}/api/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urls: urlsToBatch,
        format: 'stream'
      })
    });
    
    expect(batchRes.status).toBe(200);
    const batchText = await batchRes.text();
    const batchJsonIdx = batchText.lastIndexOf('__JSON__');
    expect(batchJsonIdx).not.toBe(-1);
    const batchData = JSON.parse(batchText.substring(batchJsonIdx + 8).trim());
    
    expect(batchData.success).toBe(true);
    expect(batchData.results).toBeDefined();
    expect(batchData.results.length).toBe(urlsToBatch.length);
    expect(batchData.results[0].success).toBe(true);
    
    // Phase 3: Download ZIP Archive
    // We must ensure the site name retains its dots (e.g. docs.traylinx.com)
    let siteName = '';
    try { siteName = new URL(urlsToBatch[0]).hostname.replace(/[^a-z0-9.\\-]/gi, ''); } catch (e) {}
    expect(siteName).toBe('docs.traylinx.com');
    
    const dlRes = await fetch(`${API_BASE}/api/download/${encodeURIComponent(siteName)}`);
    
    expect(dlRes.status).toBe(200);
    expect(dlRes.headers.get('content-type')).toContain('application/zip');
    
    const zipBuffer = await dlRes.arrayBuffer();
    expect(zipBuffer.byteLength).toBeGreaterThan(100); // Should be a valid, readable ZIP file
    
  }, 60000); // 60s timeout for full integration test

  it('should also download ZIP when site name uses dashes instead of dots (backend fallback)', async () => {
    // This simulates the OLD frontend behavior that sent "2md-traylinx-com" instead of "2md.traylinx.com"
    const dashedName = 'docs-traylinx-com'; // dashes, not dots
    const dlRes = await fetch(`${API_BASE}/api/download/${encodeURIComponent(dashedName)}`);
    
    // The backend should resolve this to "docs.traylinx.com" and find the archive
    expect(dlRes.status).toBe(200);
    expect(dlRes.headers.get('content-type')).toContain('application/zip');
    
    const zipBuffer = await dlRes.arrayBuffer();
    expect(zipBuffer.byteLength).toBeGreaterThan(100);
  }, 15000);

});
