'use strict';
const { CaptureError } = require('./errors');

function createLeaseClient({ controlUrl, token, fetchImpl = fetch }) {
  const base = new URL(controlUrl);
  if (!['http:', 'https:'].includes(base.protocol) || !token || token.length < 32 || base.username || base.password) {
    throw new CaptureError('UNAVAILABLE');
  }
  async function control(path, body, signal) {
    const response = await fetchImpl(new URL(path, base), { method: 'POST', redirect: 'error', signal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new CaptureError(response.status === 429 ? 'CAPACITY' : 'UNAVAILABLE');
    return response.json();
  }
  return async deadline => {
    const lease = await deadline.run(() => control('/lease', { budgetMs: deadline.remaining() }, deadline.signal));
    if (!/^[a-f0-9-]{36}$/.test(lease.id) || ![8281, 8282].includes(lease.port)) throw new CaptureError('UNAVAILABLE');
    return { proxyUrl: `${base.protocol}//${base.hostname}:${lease.port}`,
      async release() { return control('/release', { id: lease.id }, AbortSignal.timeout(2000)); } };
  };
}

module.exports = { createLeaseClient };
