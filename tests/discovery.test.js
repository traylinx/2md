import { describe, it, expect } from 'vitest';
import { parseLlmsTxt } from '../lib/discovery/parseLlmsTxt';

describe('parseLlmsTxt', () => {
  const sampleLlmsTxt = `# My Awesome Site

> This site provides documentation for the Awesome project.

## Documentation

- [Getting Started](/docs/getting-started)
- [API Reference](https://example.com/docs/api)
- [Configuration Guide](/docs/config)

## Blog

- [Announcement Post](https://example.com/blog/announcement)

https://example.com/changelog
`;

  it('should parse the title', () => {
    const result = parseLlmsTxt(sampleLlmsTxt, 'https://example.com');
    expect(result.title).toBe('My Awesome Site');
  });

  it('should parse the description', () => {
    const result = parseLlmsTxt(sampleLlmsTxt, 'https://example.com');
    expect(result.description).toContain('documentation for the Awesome project');
  });

  it('should extract markdown link URLs', () => {
    const result = parseLlmsTxt(sampleLlmsTxt, 'https://example.com');
    const urls = result.urls.map(u => u.url);
    expect(urls).toContain('https://example.com/docs/getting-started');
    expect(urls).toContain('https://example.com/docs/api');
    expect(urls).toContain('https://example.com/docs/config');
    expect(urls).toContain('https://example.com/blog/announcement');
  });

  it('should resolve relative URLs against baseUrl', () => {
    const result = parseLlmsTxt(sampleLlmsTxt, 'https://example.com');
    const gettingStarted = result.urls.find(u => u.url.includes('getting-started'));
    expect(gettingStarted.url).toBe('https://example.com/docs/getting-started');
  });

  it('should extract bare URLs', () => {
    const result = parseLlmsTxt(sampleLlmsTxt, 'https://example.com');
    const urls = result.urls.map(u => u.url);
    expect(urls).toContain('https://example.com/changelog');
  });

  it('should include titles from markdown links', () => {
    const result = parseLlmsTxt(sampleLlmsTxt, 'https://example.com');
    const apiRef = result.urls.find(u => u.url.includes('/docs/api'));
    expect(apiRef.title).toBe('API Reference');
  });

  it('should handle empty content gracefully', () => {
    const result = parseLlmsTxt('', 'https://example.com');
    expect(result.title).toBe('');
    expect(result.urls).toEqual([]);
  });

  it('should not duplicate URLs', () => {
    const content = `- [Page](https://example.com/page)
https://example.com/page`;
    const result = parseLlmsTxt(content, 'https://example.com');
    const pageUrls = result.urls.filter(u => u.url === 'https://example.com/page');
    expect(pageUrls.length).toBe(1);
  });
});
