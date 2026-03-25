import { describe, it, expect } from 'vitest';
import { parseRobotsTxt, isPathDisallowed } from '../lib/robotsChecker';

describe('robotsChecker', () => {
  describe('parseRobotsTxt', () => {
    it('should parse disallowed paths for wildcard user-agent', () => {
      const content = `User-agent: *\nDisallow: /private/\nDisallow: /admin/\nCrawl-delay: 2`;
      const rules = parseRobotsTxt(content);
      expect(rules.disallowed).toContain('/private/');
      expect(rules.disallowed).toContain('/admin/');
      expect(rules.crawlDelay).toBe(2);
    });

    it('should return empty rules for null content', () => {
      const rules = parseRobotsTxt(null);
      expect(rules.disallowed).toEqual([]);
      expect(rules.crawlDelay).toBe(0);
    });

    it('should parse user-agent specific blocks', () => {
      const content = `User-agent: html2md\nDisallow: /secret/\nCrawl-delay: 5\n\nUser-agent: *\nDisallow: /public-hidden/`;
      const rules = parseRobotsTxt(content, 'html2md');
      expect(rules.disallowed).toContain('/secret/');
      expect(rules.crawlDelay).toBe(5);
    });

    it('should ignore comments and empty lines', () => {
      const content = `# Comment\n\nUser-agent: *\n# Another comment\nDisallow: /hidden/`;
      const rules = parseRobotsTxt(content);
      expect(rules.disallowed).toEqual(['/hidden/']);
    });
  });

  describe('isPathDisallowed', () => {
    it('should match exact prefix', () => {
      expect(isPathDisallowed('/admin/users', ['/admin/'])).toBe(true);
    });

    it('should not match unrelated paths', () => {
      expect(isPathDisallowed('/public/about', ['/admin/'])).toBe(false);
    });

    it('should match root disallow (blocks everything)', () => {
      expect(isPathDisallowed('/anything', ['/'])).toBe(true);
    });

    it('should handle wildcard suffix patterns', () => {
      expect(isPathDisallowed('/search/results', ['/search*'])).toBe(true);
      expect(isPathDisallowed('/about', ['/search*'])).toBe(false);
    });
  });
});
