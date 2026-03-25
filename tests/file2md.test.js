import { describe, it, expect, beforeAll } from 'vitest';

const API_BASE = process.env.PRODUCTION_API_URL || 'https://2md.traylinx.com';
const API_KEY = process.env.SWITCHAI_API_KEY || process.env.FILE2MD_TEST_API_KEY;

// Simulate frontend useStreamFetch.js parsing rules for stream formats
async function parseStreamResponse(response) {
  const text = await response.text();
  const jsonIdx = text.indexOf('__JSON__');
  let jsonStr = '';
  if (jsonIdx === -1) {
    const trimmed = text.trim();
    if (trimmed.startsWith('{')) {
      jsonStr = trimmed;
    } else {
      throw new Error('No data returned from server. Raw text: ' + text.substring(0, 500));
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

  if (endIndex === -1) throw new Error('Could not parse JSON payload');
  const cleanJsonStr = jsonStr.substring(0, endIndex + 1).trim();
  return JSON.parse(cleanJsonStr);
}

describe('Production E2E: File2MD', () => {

  it('should return 400 if no file or url provided', async () => {
    const fd = new FormData();
    const res = await fetch(`${API_BASE}/api/file2md`, { method: 'POST', body: fd });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Missing file or url in request');
  });

  const describeWithApiKey = API_KEY ? describe : describe.skip;
  
  describeWithApiKey('Authenticated File2MD Extraction', () => {

    it('should transcribe an audio file from a remote URL (.mp3)', async () => {
      const fd = new FormData();
      fd.append('url', 'https://github.com/AssemblyAI-Examples/audio-examples/raw/main/20230607_me_canadian_wildfires.mp3');
      fd.append('apiKey', API_KEY);
      fd.append('enhance', 'false');
      fd.append('format', 'stream');

      const res = await fetch(`${API_BASE}/api/file2md`, { method: 'POST', body: fd });
      expect(res.status).toBe(200);

      const data = await parseStreamResponse(res);
      
      expect(data.success).toBe(true);
      expect(data.files).toBeDefined();
      expect(data.files['full_document.md']).toBeDefined();
      expect(data.files['full_document.md'].length).toBeGreaterThan(50);
      
      const meta = JSON.parse(data.files['metadata.json']);
      expect(meta.attachment_id).toBeDefined();
    }, 120000);

    it('should accept and process a YouTube URL correctly (no full docs generated)', async () => {
      const fd = new FormData();
      fd.append('url', 'https://youtu.be/VSp3QigHaHE?si=6QYtSbA4UPQwmO-V');
      fd.append('apiKey', API_KEY);
      fd.append('enhance', 'false');
      // Intentionally simulating frontend format (json format is what the modified frontend now safely accepts even if no __JSON__ prefix!)
      fd.append('format', 'stream'); 

      const res = await fetch(`${API_BASE}/api/file2md`, { method: 'POST', body: fd });
      expect(res.status).toBe(200);

      // Verify the fallback parser handles YouTube's specific raw JSON return gracefully
      const data = await parseStreamResponse(res);
      expect(data.success).toBe(true);
      expect(data.files).toBeDefined();
      
      // Since YouTube returns pages/page_X.md rather than full_document.md
      const pages = [];
      let pageIdx = 1;
      while (data.files[`pages/page_${pageIdx}.md`]) {
        pages.push(data.files[`pages/page_${pageIdx}.md`]);
        pageIdx++;
      }
      expect(pages.length).toBeGreaterThan(0);
      expect(pages[0].length).toBeGreaterThan(10);
    }, 300000);

  });

});
