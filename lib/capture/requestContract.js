'use strict';
const { CaptureError } = require('./errors');
const { parseTarget } = require('./targetPolicy');

function exactKeys(value, allowed, required = allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Object.keys(value).some(key => !allowed.includes(key)) ||
      required.some(key => !Object.hasOwn(value, key))) throw new CaptureError('INVALID_INPUT');
}

function boundedString(value, maxBytes) {
  if (typeof value !== 'string' || !value.length || Buffer.byteLength(value) > maxBytes || value.includes('\0')) {
    throw new CaptureError('INVALID_INPUT');
  }
  return value;
}

function validateRequest(body, authenticated = false) {
  exactKeys(body, authenticated ? ['url', 'budgetMs', 'loginUrl', 'login', 'auth'] : ['url', 'budgetMs'],
    authenticated ? ['url', 'loginUrl', 'login', 'auth'] : ['url']);
  const budgetMs = body.budgetMs ?? (authenticated ? 30000 : 20000);
  if (!Number.isInteger(budgetMs) || budgetMs < 1000 || budgetMs > (authenticated ? 60000 : 30000)) {
    throw new CaptureError('INVALID_INPUT');
  }
  const request = { url: parseTarget(body.url).href, budgetMs };
  if (!authenticated) return request;
  request.loginUrl = parseTarget(body.loginUrl).href;
  if (!request.url.startsWith('https:') || !request.loginUrl.startsWith('https:')) throw new CaptureError('TARGET_DENIED');
  // Agent-supplied declarative instructions belong to this request only.
  // Never resolve a site name or a saved server-side login strategy.
  request.login = body.login;
  exactKeys(body.auth, ['mode', 'username', 'password']);
  if (body.auth.mode !== 'inlineOnce') throw new CaptureError('INVALID_INPUT');
  request.auth = { mode: 'inlineOnce', username: boundedString(body.auth.username, 512),
    password: boundedString(body.auth.password, 4096) };
  return request;
}

module.exports = { validateRequest, exactKeys, boundedString };
