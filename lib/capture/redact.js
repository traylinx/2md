'use strict';
const { SECRET_KEY } = require('./targetPolicy');

function safeUrl(value) {
  try {
    const url = new URL(value);
    url.username = ''; url.password = ''; url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (SECRET_KEY.test(key)) url.searchParams.delete(key);
    return url.href;
  } catch { return ''; }
}

function redactText(value, secrets = []) {
  let text = String(value);
  for (const secret of secrets.filter(item => typeof item === 'string' && item.length)) {
    const encoded = encodeURIComponent(secret);
    const variants = [secret, encoded, encoded.replace(/%20/g, '+'),
      new URLSearchParams({ v: secret }).toString().slice(2), JSON.stringify(secret).slice(1, -1)];
    if (secret.length >= 4) variants.push(Buffer.from(secret).toString('base64'), Buffer.from(secret).toString('base64url'));
    for (const variant of new Set(variants)) {
      text = text.split(variant).join('[REDACTED]');
    }
  }
  return text.replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9+/=._~-]+/gi, '[REDACTED]')
    .replace(/https?:\/\/[^\s<>"'\])]+/gi, value => safeUrl(value))
    .replace(/\b(?:password|api[_-]?key|secret|access[_-]?token|refresh[_-]?token)\s*[:=]\s*["']?[^\s,"'<>]+/gi,
      '[REDACTED]');
}

module.exports = { safeUrl, redactText };
