import { describe, it, expect } from 'vitest';
import { AD_DOMAINS, isAdDomain } from '../lib/adBlockList';

describe('adBlockList', () => {
  it('should export a non-empty array of ad domains', () => {
    expect(AD_DOMAINS).toBeInstanceOf(Array);
    expect(AD_DOMAINS.length).toBeGreaterThan(10);
  });

  it('should contain known ad domains', () => {
    expect(AD_DOMAINS).toContain('doubleclick.net');
    expect(AD_DOMAINS).toContain('google-analytics.com');
    expect(AD_DOMAINS).toContain('hotjar.com');
  });

  it('should detect ad domains via isAdDomain', () => {
    expect(isAdDomain('pagead2.googlesyndication.com')).toBe(true);
    expect(isAdDomain('www.doubleclick.net')).toBe(true);
    expect(isAdDomain('stats.google-analytics.com')).toBe(true);
  });

  it('should not flag regular domains', () => {
    expect(isAdDomain('example.com')).toBe(false);
    expect(isAdDomain('github.com')).toBe(false);
    expect(isAdDomain('docs.python.org')).toBe(false);
  });
});
