import { describe, it, expect } from 'vitest';
import { extractStatic } from '../lib/pipeline/extractStatic';
import { isStaticQualityAcceptable, isShellApp } from '../lib/pipeline/qualityGate';
import { validateMethod, VALID_METHODS } from '../lib/pipeline/selectMethod';
import { buildHeaders } from '../lib/pipeline/buildHeaders';

describe('Pipeline: extractStatic', () => {
  it('should extract markdown from a simple HTML page', () => {
    const html = `<!DOCTYPE html>
<html><head><title>Test Page</title></head>
<body>
  <article>
    <h1>Hello World</h1>
    <p>This is a comprehensive test page with enough content to pass the quality gate.
    It contains multiple paragraphs and structural elements that demonstrate the extraction
    pipeline is working correctly.</p>
    <h2>Section Two</h2>
    <p>More content with a <a href="https://example.com">link</a> and some details.</p>
    <ul><li>Item one</li><li>Item two</li><li>Item three</li></ul>
  </article>
</body></html>`;

    const result = extractStatic(html, 'https://example.com');
    expect(result.markdown).toBeDefined();
    expect(result.markdown).toContain('Hello World');
    expect(result.tokens.md).toBeGreaterThan(0);
    expect(result.quality.wordCount).toBeGreaterThan(10);
  });

  it('should preserve links as absolute URLs', () => {
    const html = `<html><body>
      <article>
        <h1>Link Test</h1>
        <p>Content here is plenty enough to pass all the quality gates and checks for the static extraction pipeline module.</p>
        <p>Visit <a href="/about">About Page</a> for more info.</p>
      </article>
    </body></html>`;

    const result = extractStatic(html, 'https://example.com');
    expect(result.markdown).toContain('https://example.com/about');
  });

  it('should return token counts', () => {
    const html = `<html><body><article><h1>Tokens</h1><p>Some content here that is long enough for us to verify
    that token counting actually works as expected in the pipeline extraction module.</p></article></body></html>`;
    const result = extractStatic(html, 'https://example.com');
    expect(result.tokens.html).toBeGreaterThan(0);
    expect(result.tokens.md).toBeGreaterThan(0);
  });
});

describe('Pipeline: qualityGate', () => {
  it('should reject extraction with too few words', () => {
    const result = isStaticQualityAcceptable('<html><body>Short</body></html>', {
      markdown: 'Short',
      quality: { wordCount: 3 },
    });
    expect(result).toBe(false);
  });

  it('should accept extraction with enough words', () => {
    const words = Array(100).fill('word').join(' ');
    const result = isStaticQualityAcceptable(
      `<html><body><p>${words}</p></body></html>`,
      { markdown: words, quality: { wordCount: 100 } }
    );
    expect(result).toBe(true);
  });

  it('should detect a React shell app as low quality', () => {
    const shellHtml = `<html><body><div id="root"></div>
      <script src="/static/js/main.abc123.js"></script>
      <script src="/static/js/vendor.def456.js"></script>
    </body></html>`;
    expect(isShellApp(shellHtml)).toBe(true);
  });

  it('should not flag a content-rich page as a shell app', () => {
    const words = Array(200).fill('word').join(' ');
    const richHtml = `<html><body><div id="root"><p>${words}</p></div></body></html>`;
    expect(isShellApp(richHtml)).toBe(false);
  });

  it('should flag pages where script bytes dominate over text', () => {
    const bigScript = 'x'.repeat(5000);
    const shellHtml = `<html><body>
      <p>tiny</p>
      <script>${bigScript}</script>
      <script>${bigScript}</script>
    </body></html>`;
    expect(isShellApp(shellHtml)).toBe(true);
  });
});

describe('Pipeline: validateMethod', () => {
  it('should return auto for undefined input', () => {
    expect(validateMethod(undefined)).toBe('auto');
  });

  it('should return auto for empty string', () => {
    expect(validateMethod('')).toBe('auto');
  });

  it('should normalize case', () => {
    expect(validateMethod('STATIC')).toBe('static');
    expect(validateMethod('Browser')).toBe('browser');
    expect(validateMethod('NATIVE')).toBe('native');
  });

  it('should reject invalid methods', () => {
    expect(validateMethod('ai')).toBe(null);
    expect(validateMethod('turbo')).toBe(null);
    expect(validateMethod('magic')).toBe(null);
  });

  it('should accept all valid methods', () => {
    for (const m of VALID_METHODS) {
      expect(validateMethod(m)).toBe(m);
    }
  });
});

describe('Pipeline: buildHeaders', () => {
  it('should set X-Native-Markdown to true for native method', () => {
    const headers = buildHeaders({ method: 'native', cache: 'miss', tokens: { md: 100, html: 0 } }, 'json');
    expect(headers['X-Native-Markdown']).toBe('true');
  });

  it('should set X-Native-Markdown to false for static method', () => {
    const headers = buildHeaders({ method: 'static', cache: 'miss', tokens: { md: 100, html: 500 } }, 'json');
    expect(headers['X-Native-Markdown']).toBe('false');
  });

  it('should set correct Content-Type for markdown format', () => {
    const headers = buildHeaders({ method: 'static', cache: 'miss', tokens: { md: 100, html: 500 } }, 'markdown');
    expect(headers['Content-Type']).toBe('text/markdown; charset=utf-8');
  });
});
