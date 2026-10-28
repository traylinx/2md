'use strict';
const { CaptureError } = require('./errors');
const { resourceGrant } = require('./resourceScope');

// Traylinx AUTH GET /oauth/token/info contract, verified from TokenController
// and CustomTokenResponse. Not the older Search client's status:"valid" guess.
function createPrincipalVerifier({ authUrl, scopes, fetchImpl = fetch } = {}) {
  let endpoint;
  try { endpoint = new URL(authUrl); } catch { /* missing configuration fails closed */ }
  if (endpoint && (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hash)) endpoint = null;
  return async function verify(authorization, deadline) {
    if (!endpoint || !scopes) throw new CaptureError('UNAVAILABLE');
    if (typeof authorization !== 'string' || !/^Bearer [^\s]{1,8192}$/.test(authorization)) {
      throw new CaptureError('UNAUTHENTICATED');
    }
    try {
      const response = await deadline.run(() => fetchImpl(endpoint.href, {
        method: 'GET', redirect: 'error', headers: { Authorization: authorization, Accept: 'application/json' },
        signal: AbortSignal.any([deadline.signal, AbortSignal.timeout(Math.min(3000, deadline.remaining()))]),
      }));
      if ([401, 403].includes(response.status)) throw new CaptureError('UNAUTHENTICATED');
      if (!response.ok) throw new CaptureError('UNAVAILABLE');
      const text = await deadline.run(() => boundedBody(response, 16384));
      const data = JSON.parse(text);
      const id = data.data?.id;
      if (!['user', 'agent'].includes(data.data?.type) || typeof id !== 'string' || !id || id.length > 256 ||
          !Array.isArray(data.messages) || !data.messages.some(message => message.status === 200)) {
        throw new CaptureError('UNAUTHENTICATED');
      }
      if (data.data.type === 'agent' && data.data.attributes?.isActive !== true) throw new CaptureError('UNAUTHENTICATED');
      const grant = scopes[id];
      if (!grant || !Array.isArray(grant.operations) || !Array.isArray(grant.origins)) throw new CaptureError('FORBIDDEN');
      return { id, operations: [...grant.operations], origins: [...grant.origins], ...resourceGrant(grant) };
    } catch (error) {
      if (error instanceof CaptureError) throw error;
      deadline.remaining();
      throw new CaptureError('UNAVAILABLE');
    }
  };
}

async function boundedBody(response, maximum) {
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maximum) throw new CaptureError('UNAVAILABLE');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally { await reader.cancel().catch(() => {}); }
}

function assertScope(principal, request, privateMode = false) {
  const operation = privateMode ? 'capture:authenticated' : 'capture:public';
  if (!principal.operations.includes(operation)) throw new CaptureError('FORBIDDEN');
  const urls = [request.url, ...(request.loginUrl ? [request.loginUrl] : [])];
  if (urls.some(url => !principal.origins.includes(new URL(url).origin)) &&
      !principal.origins.includes('*')) throw new CaptureError('FORBIDDEN');
}

module.exports = { createPrincipalVerifier, assertScope, boundedBody };
