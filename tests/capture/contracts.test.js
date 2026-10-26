import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { validateRequest } = require('../../lib/capture/requestContract');
const { parseTarget, resolveTarget, isPublicAddress } = require('../../lib/capture/targetPolicy');
const { publicError, CaptureError } = require('../../lib/capture/errors');
const { freezeRecipe } = require('../../lib/capture/recipe');
const { Deadline } = require('../../lib/capture/deadline');

describe('strict operation contracts', () => {
  it('keeps public request small and defaults bounded', () => {
    expect(validateRequest({ url: 'https://example.com/report' })).toEqual({ url: 'https://example.com/report', budgetMs: 20000 });
  });
  for (const body of [null, [], {}, { url: 'https://example.com', cookie: 'secret' },
    { url: 'https://example.com', headers: {} }, { url: 'https://example.com', auth: {} },
    { url: 'https://example.com', budgetMs: 999 }, { url: 'https://example.com', budgetMs: 30001 },
    { url: 'https://example.com', budgetMs: '1000' }, { url: 'https://example.com', budgetMs: 1000.5 }]) {
    it(`rejects malformed public input ${JSON.stringify(body)}`, () => expect(() => validateRequest(body)).toThrow(CaptureError));
  }
  it('accepts inlineOnce only for the separate authenticated contract', () => {
    const request = validateRequest({ url: 'https://example.com/report', loginUrl: 'https://example.com/login',
      login: {}, auth: { mode: 'inlineOnce', username: 'synthetic', password: 'synthetic' } }, true);
    expect(request.budgetMs).toBe(30000);
    expect(() => validateRequest({ ...request, auth: { ...request.auth, profileId: 'old' } }, true)).toThrow();
    expect(() => validateRequest({ ...request, loginUrl: 'http://example.com/login' }, true)).toThrow();
    expect(() => validateRequest({ ...request, auth: { ...request.auth, password: 'a'.repeat(4097) } }, true)).toThrow();
  });
  it('never serializes an upstream exception', () => {
    const output = publicError(new Error('password=canary /home/secret Authorization: bearer secret'), 'test-id');
    expect(JSON.stringify(output)).not.toMatch(/canary|\/home|Authorization/);
    expect(output.status).toBe(502);
  });
});

describe('public destination policy', () => {
  for (const address of ['0.0.0.0', '10.0.0.1', '100.64.0.1', '127.0.0.1', '169.254.169.254',
    '172.16.1.1', '192.168.1.1', '192.0.2.1', '198.18.1.1', '224.0.0.1', '255.255.255.255',
    '::', '::1', '::ffff:127.0.0.1', '64:ff9b::a00:1', 'fe80::1', 'fc00::1', '2001:db8::1', '2002:a00:1::']) {
    it(`denies ${address}`, () => expect(isPublicAddress(address)).toBe(false));
  }
  it('allows public v4/v6', () => { expect(isPublicAddress('93.184.216.34')).toBe(true); expect(isPublicAddress('2606:4700:4700::1111')).toBe(true); });
  for (const value of ['file:///etc/passwd', 'http://2130706433', 'http://0x7f000001', 'http://127.1',
    'http://[::ffff:127.0.0.1]', 'https://user:pass@example.com', 'https://example.com?access_token=x',
    'https://example.com?%70assword=x', 'https://example.com/#secret', 'https://example.com:8443', 'http://localhost']) {
    it(`rejects unsafe target ${value}`, () => expect(() => parseTarget(value)).toThrow());
  }
  it('rejects mixed and rebound DNS results', async () => {
    const deadline = new Deadline(1000);
    try {
      const lookup = async () => [{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }];
      await expect(resolveTarget('https://example.com', { lookup, deadline })).rejects.toMatchObject({ code: 'TARGET_DENIED' });
      await expect(resolveTarget('https://example.com', { lookup: async () => [], deadline })).rejects.toMatchObject({ code: 'TARGET_DENIED' });
    } finally { deadline.close(); }
  });
});

describe('agent-supplied request-scoped login instructions', () => {
  const login = { submitPath: '/login', readPaths: ['/report'],
    fields: { form: '#login', username: '#user', password: '#pass', submit: '#submit' },
    proof: { selector: '#account', attribute: 'data-user' } };
  const request = { login, url: 'https://example.com/report', loginUrl: 'https://example.com/login' };
  it('validates and freezes instructions without any server-side website registry', () => {
    const frozen = freezeRecipe(request);
    expect(frozen.origin).toBe('https://example.com');
    expect(frozen.loginPath).toBe('/login');
    expect(frozen).not.toHaveProperty('digest');
    expect(Object.isFrozen(frozen.fields)).toBe(true);
    expect(Object.isFrozen(frozen.readPaths)).toBe(true);
    expect(frozen.fields).not.toBe(login.fields);
  });
  it('accepts another domain and different selectors without server configuration', () => {
    const second = freezeRecipe({ url: 'https://another-public-site.example/document',
      loginUrl: 'https://another-public-site.example/sign-in', login: {
        submitPath: '/authenticate', readPaths: ['/document'], resourcePaths: ['/app.js'],
        fields: { form: '.sign-in', username: '[name=email]', password: '[name=secret]', submit: 'button' },
        proof: { selector: '#identity', attribute: 'textContent' } } });
    expect(second.origin).toBe('https://another-public-site.example');
    expect(second.fields.username).toBe('[name=email]');
  });
  it('denies missing instructions, mismatched target scope and cross-origin login', () => {
    expect(() => freezeRecipe({ ...request, login: undefined })).toThrow();
    expect(() => freezeRecipe({ ...request, url: 'https://example.com/delete' })).toThrow();
    expect(() => freezeRecipe({ ...request, loginUrl: 'https://evil.example/login' })).toThrow();
  });
  for (const loginOverride of [
    { ...login, script: 'fetch("/delete")' },
    { ...login, fields: { ...login.fields, eval: 'bad' } },
    { ...login, submitPath: '//evil.example' },
    { ...login, submitPath: '/login?password=x' },
    { ...login, resourcePaths: Array(65).fill('/app.js') },
    { ...login, readPaths: Array(33).fill('/report') },
    { ...login, proof: { selector: '#account', attribute: 'onclick' } },
  ]) {
    it('rejects instructions that try to expand executable or transport authority', () => {
      expect(() => freezeRecipe({ ...request, login: loginOverride })).toThrow();
    });
  }
});
