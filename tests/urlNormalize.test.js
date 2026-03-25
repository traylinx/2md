import { describe, it, expect } from 'vitest';
import { normalizeForDedup, generateUrlPermutations } from '../lib/urlNormalize';

describe('urlNormalize', () => {
  describe('normalizeForDedup', () => {
    it('should strip www prefix', () => {
      expect(normalizeForDedup('https://www.example.com/page')).toBe('https://example.com/page');
    });

    it('should strip trailing slashes', () => {
      expect(normalizeForDedup('https://example.com/page/')).toBe('https://example.com/page');
    });

    it('should strip query params and hash', () => {
      expect(normalizeForDedup('https://example.com/page?foo=bar#section')).toBe('https://example.com/page');
    });

    it('should strip index.html', () => {
      expect(normalizeForDedup('https://example.com/docs/index.html')).toBe('https://example.com/docs');
    });

    it('should strip index.php', () => {
      expect(normalizeForDedup('https://example.com/blog/index.php')).toBe('https://example.com/blog');
    });

    it('should normalize http to https', () => {
      expect(normalizeForDedup('http://example.com/page')).toBe('https://example.com/page');
    });

    it('should normalize root path', () => {
      expect(normalizeForDedup('https://www.example.com/')).toBe('https://example.com/');
    });

    it('should return null for invalid URLs', () => {
      expect(normalizeForDedup('not-a-url')).toBeNull();
    });
  });

  describe('generateUrlPermutations', () => {
    it('should generate variants for a simple URL', () => {
      const perms = generateUrlPermutations('https://example.com/about');
      expect(perms.length).toBeGreaterThan(1);
      expect(perms).toContain('https://example.com/about');
      expect(perms).toContain('http://example.com/about');
      expect(perms).toContain('https://www.example.com/about');
      expect(perms).toContain('https://example.com/about/');
      expect(perms).toContain('https://example.com/about/index.html');
    });

    it('should handle root URL without generating /index.html for root', () => {
      const perms = generateUrlPermutations('https://example.com/');
      expect(perms).toContain('https://example.com/');
      expect(perms).toContain('http://www.example.com/');
    });

    it('should return empty array for invalid URLs', () => {
      expect(generateUrlPermutations('not-a-url')).toEqual([]);
    });

    it('should deduplicate self-referencing permutations', () => {
      const perms = generateUrlPermutations('https://example.com/about');
      const unique = new Set(perms);
      expect(unique.size).toBe(perms.length);
    });
  });
});
