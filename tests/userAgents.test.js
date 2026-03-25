import { describe, it, expect } from 'vitest';
import { USER_AGENTS, getRandomUA } from '../lib/userAgents';

describe('userAgents', () => {
  it('should export a non-empty array of realistic user agents', () => {
    expect(USER_AGENTS).toBeInstanceOf(Array);
    expect(USER_AGENTS.length).toBeGreaterThan(3);
    for (const ua of USER_AGENTS) {
      expect(typeof ua).toBe('string');
      expect(ua).toMatch(/Mozilla/);
    }
  });

  it('getRandomUA should return a string from the list', () => {
    const ua = getRandomUA();
    expect(typeof ua).toBe('string');
    expect(USER_AGENTS).toContain(ua);
  });

  it('getRandomUA should not always return the same value', () => {
    const results = new Set();
    for (let i = 0; i < 50; i++) {
      results.add(getRandomUA());
    }
    expect(results.size).toBeGreaterThan(1);
  });
});
