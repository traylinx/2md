import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateApiKey } from '../lib/auth/apiKeys';

describe('auth/apiKeys module', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('validateApiKey', () => {
    it('should return null if no auth header provided', () => {
      expect(validateApiKey(undefined)).toBeNull();
      expect(validateApiKey('')).toBeNull();
    });

    it('should return null if format is not Bearer', () => {
      expect(validateApiKey('Basic somebase64==')).toBeNull();
      expect(validateApiKey('some-key')).toBeNull();
    });

    it('should return null if API_KEYS env is not set', () => {
      delete process.env.API_KEYS;
      expect(validateApiKey('Bearer my-secret-key')).toBeNull();
    });

    describe('Simple CSV Format', () => {
      beforeEach(() => {
        process.env.API_KEYS = 'key1,key2, key3 ';
      });

      it('should validate an existing key and default to pro tier', () => {
        const result = validateApiKey('Bearer key2');
        expect(result).not.toBeNull();
        expect(result.tier).toBe('pro');
        expect(result.keyHash).toBeDefined();
        // sha256 of 'key2', sliced to 8 chars
        expect(result.keyHash.length).toBe(8);
      });

      it('should handle whitespace in CSV keys', () => {
        const result = validateApiKey('Bearer key3');
        expect(result).not.toBeNull();
        expect(result.tier).toBe('pro');
      });

      it('should return null for unknown key', () => {
        expect(validateApiKey('Bearer unknown-key')).toBeNull();
      });
    });

    describe('JSON Tiered Format', () => {
      beforeEach(() => {
        process.env.API_KEYS = JSON.stringify({
          "enterprise": ["ent-key-1", "ent-key-2"],
          "pro": ["pro-key-1"]
        });
      });

      it('should return correct tier for enterprise key', () => {
        const result = validateApiKey('Bearer ent-key-1');
        expect(result).not.toBeNull();
        expect(result.tier).toBe('enterprise');
        expect(result.keyHash).toBeDefined();
      });

      it('should return correct tier for pro key', () => {
        const result = validateApiKey('Bearer pro-key-1');
        expect(result).not.toBeNull();
        expect(result.tier).toBe('pro');
      });

      it('should return null for unknown key', () => {
        expect(validateApiKey('Bearer unknown-key')).toBeNull();
      });
    });

    describe('JSON Parsing Fallback', () => {
      it('should gracefully fallback to CSV if JSON parse fails and its actually CSV', () => {
        // Technically starts with { but isn't valid JSON
        process.env.API_KEYS = '{fake-json,key1}';
        const result = validateApiKey('Bearer key1}');
        expect(result).not.toBeNull();
        expect(result.tier).toBe('pro');
      });
    });
  });
});
