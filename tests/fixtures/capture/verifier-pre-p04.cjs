'use strict';
const { CaptureError } = require('./errors');

const NAMES = new Set(['authorization', 'x-agent-user-id', 'x-agent-secret-token']);

// Check BEFORE proxies/Node normalize duplicate Authorization fields. Snapshot
// only authentication headers; never pass them to the browser or target website.
function captureCredentials(req) {
  const seen = new Set();
  const raw = req.rawHeaders || [];
  for (let i = 0; i < raw.length; i += 2) {
    const name = String(raw[i]).toLowerCase();
    if (!NAMES.has(name)) continue;
    if (seen.has(name)) throw new CaptureError('UNAUTHENTICATED');
    seen.add(name);
  }
  const headers = Object.create(null);
  for (const name of NAMES) {
    if (Object.hasOwn(req.headers, name)) headers[name] = req.headers[name];
  }
  return Object.freeze(headers);
}

function credential(value, max = 16384) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\s,\x00-\x1f\x7f]/.test(value);
}

function createCaptureVerifier({ userVerify, agentVerify } = {}) {
  return async (authorization, deadline, headers = { authorization }) => {
    // Presence selects the agent path, even for malformed/empty credentials.
    // Failed agent proof NEVER becomes a user-token request.
    if (Object.hasOwn(headers, 'x-agent-user-id') || Object.hasOwn(headers, 'x-agent-secret-token')) {
      const id = headers['x-agent-user-id'];
      const custom = headers['x-agent-secret-token'];
      const bearer = headers.authorization;
      if (!credential(id, 256) || (custom !== undefined && bearer !== undefined)) throw new CaptureError('UNAUTHENTICATED');
      const token = custom !== undefined ? custom :
        typeof bearer === 'string' && /^Bearer [^\s,]+$/.test(bearer) ? bearer.slice(7) : undefined;
      if (!credential(token)) throw new CaptureError('UNAUTHENTICATED');
      if (!agentVerify) throw new CaptureError('UNAUTHENTICATED');
      return agentVerify(token, id, deadline);
    }
    return userVerify(authorization, deadline);
  };
}

function createSentinelVerifier({ apiBaseUrl, clientId, clientSecret, verifierId, grants,
  maxActive = 8, timeoutMs = 3000, loadSdk = () => require('../../deploy/capture/sentinel-sdk/node_modules/traylinx-auth-client') } = {}) {
  // No environment fallback to another application's identity.
  if (![apiBaseUrl, clientId, clientSecret, verifierId].every(v => typeof v === 'string' && v.length) ||
      !grants || typeof grants !== 'object' || Array.isArray(grants) ||
      !Number.isInteger(maxActive) || maxActive < 1 || !Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new CaptureError('UNAVAILABLE');
  }
  let Sdk;
  try {
    Sdk = loadSdk().TraylinxAuthClient;
    // Validate trusted configuration at startup without a credential exchange.
    new Sdk(clientId, clientSecret, apiBaseUrl, verifierId, { timeout: timeoutMs, maxRetries: 0 });
  } catch { throw new CaptureError('UNAVAILABLE'); }
  let active = 0;
  return async function verify(token, id, deadline) {
    if (active >= maxActive) throw new CaptureError('CAPACITY');
    active++;
    const controller = new AbortController();
    const cancel = () => controller.abort();
    let timer, client;
    try {
      const end = Date.now() + Math.min(timeoutMs, deadline.remaining());
      timer = setTimeout(cancel, Math.max(1, end - Date.now()));
      timer.unref?.();
      deadline.signal.addEventListener('abort', cancel, { once: true });
      // Request-local SDK prevents one caller's cancellation from aborting another.
      // No pass/introspection cache. Initial and final proof both reach Sentinel.
      client = new Sdk(clientId, clientSecret, apiBaseUrl, verifierId, { timeout: timeoutMs, maxRetries: 0 });
      client.axiosInstance.interceptors.request.use(config => {
        deadline.remaining();
        config.signal = controller.signal;
        config.timeout = Math.max(1, end - Date.now());
        // Do not inherit host proxy environment for credential-bearing transport.
        config.proxy = false;
        return config;
      });
      const result = await client.introspectToken(token, id);
      deadline.remaining();
      if (controller.signal.aborted) throw new CaptureError('UNAVAILABLE');
      if (result?.active !== true || result.agent_id !== id || !Number.isFinite(result.expires_at) ||
          result.expires_at <= Date.now() / 1000 || typeof result.scopes !== 'string' ||
          !result.scopes.split(/\s+/).includes('a2a')) throw new CaptureError('UNAUTHENTICATED');
      // Dedicated agent grants; never borrow the owner's ordinary user grant.
      const grant = Object.hasOwn(grants, id) ? grants[id] : undefined;
      if (!grant || !Array.isArray(grant.operations) || !Array.isArray(grant.origins) ||
          !grant.operations.every(v => typeof v === 'string') || !grant.origins.every(v => typeof v === 'string')) throw new CaptureError('FORBIDDEN');
      return { id: `agent:${id}`, operations: [...grant.operations], origins: [...grant.origins] };
    } catch (error) {
      deadline.remaining();
      if (error instanceof CaptureError) throw error;
      // Invalid proof is active:false. Transport/verifier credential errors are
      // service failures, not a reason to fall back or expose SDK exception data.
      throw new CaptureError('UNAVAILABLE');
    } finally {
      clearTimeout(timer); cancel();
      deadline.signal.removeEventListener('abort', cancel);
      if (client) {
        client.accessToken = client.agentSecretToken = client.clientSecret = null;
        client.config.clientSecret = null;
      }
      active--;
    }
  };
}

module.exports = { captureCredentials, createCaptureVerifier, createSentinelVerifier };
