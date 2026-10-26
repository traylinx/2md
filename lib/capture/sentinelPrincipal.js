'use strict';
const { CaptureError } = require('./errors');
const { performance } = require('node:perf_hooks');
const { verifierTokens, erase } = require('./verifierTokens');

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
  maxActive = 8, timeoutMs = 3000, registry = verifierTokens,
  loadSdk = () => require('../../deploy/capture/sentinel-sdk/node_modules/traylinx-auth-client') } = {}) {
  if (!grants || typeof grants !== 'object' || Array.isArray(grants) ||
      !Number.isInteger(maxActive) || maxActive < 1 || maxActive > 128) throw new CaptureError('UNAVAILABLE');
  let Sdk;
  try { Sdk = loadSdk().TraylinxAuthClient; } catch { throw new CaptureError('UNAVAILABLE'); }
  let configuration = { apiBaseUrl, clientId, clientSecret, verifierId, timeoutMs, Sdk };
  let active = 0, closed = false;
  const snapshotGrants = value => Object.freeze(Object.fromEntries(Object.entries(value).map(([id, grant]) =>
    [id, grant && typeof grant === 'object' ? Object.freeze({
      operations: Array.isArray(grant.operations) ? Object.freeze([...grant.operations]) : grant.operations,
      origins: Array.isArray(grant.origins) ? Object.freeze([...grant.origins]) : grant.origins,
    }) : null])));
  let configuredGrants = snapshotGrants(grants);
  let provider = registry.register(configuration);
  async function verify(token, id, deadline) {
    if (closed) throw new CaptureError('UNAVAILABLE');
    if (active >= maxActive) throw new CaptureError('CAPACITY');
    const budget = Math.min(configuration.timeoutMs, deadline.remaining());
    active++;
    const owner = provider, config = configuration, grantSnapshot = configuredGrants;
    const controller = new AbortController();
    const cancel = () => controller.abort();
    const end = performance.now() + budget;
    const context = { signal: controller.signal, remaining() {
      deadline.remaining();
      const remaining = Math.floor(end - performance.now());
      if (controller.signal.aborted || owner.signal.aborted || remaining <= 0) throw new CaptureError('UNAVAILABLE');
      return remaining;
    } };
    let timer, client, lease;
    try {
      timer = setTimeout(cancel, Math.max(1, end - performance.now())); timer.unref?.();
      deadline.signal.addEventListener('abort', cancel, { once: true });
      owner.signal.addEventListener('abort', cancel, { once: true });
      if (deadline.signal.aborted || owner.signal.aborted) cancel();
      lease = await owner.acquire(context);
      context.remaining();
      if (!owner.valid(lease)) throw new CaptureError('UNAVAILABLE');
      // Request-local introspection transport; only the SDK's verifier token
      // lifecycle is shared. No caller controls the refresh owner's AbortSignal.
      client = new Sdk(config.clientId, config.clientSecret, config.apiBaseUrl, config.verifierId,
        { timeout: config.timeoutMs, maxRetries: 0 });
      client.getAccessToken = async () => owner.token(lease);
      client.axiosInstance.interceptors.request.use(request => {
        request.timeout = context.remaining();
        if (!owner.valid(lease)) throw new CaptureError('UNAVAILABLE');
        request.signal = controller.signal; request.proxy = false;
        return request;
      });
      let result;
      for (let attempt = 0; attempt < 2; attempt++) {
        try { result = await client.introspectToken(token, id); break; }
        catch (error) {
          context.remaining();
          if (error?.statusCode !== 401) throw error;
          if (attempt === 1) { owner.invalidate(lease); throw error; }
          // Only safe introspection gets one shared refresh/retry. Token POSTs
          // themselves remain maxRetries=0 and are never automatically replayed.
          lease = await owner.recover(lease, context);
        }
      }
      context.remaining();
      if (!owner.valid(lease)) throw new CaptureError('UNAVAILABLE');
      if (result?.active !== true || result.agent_id !== id || !Number.isFinite(result.expires_at) ||
          result.expires_at <= Date.now() / 1000 || typeof result.scopes !== 'string' ||
          !result.scopes.split(/\s+/).includes('a2a')) throw new CaptureError('UNAUTHENTICATED');
      const grant = Object.hasOwn(grantSnapshot, id) ? grantSnapshot[id] : undefined;
      if (!grant || !Array.isArray(grant.operations) || !Array.isArray(grant.origins) ||
          !grant.operations.every(v => typeof v === 'string') || !grant.origins.every(v => typeof v === 'string')) throw new CaptureError('FORBIDDEN');
      return { id: `agent:${id}`, operations: [...grant.operations], origins: [...grant.origins] };
    } catch (error) {
      deadline.remaining();
      if (error instanceof CaptureError) throw error;
      throw new CaptureError('UNAVAILABLE');
    } finally {
      clearTimeout(timer); cancel();
      deadline.signal.removeEventListener('abort', cancel);
      owner.signal.removeEventListener('abort', cancel);
      erase(client);
      active--;
    }
  }
  verify.close = () => {
    if (closed) return;
    closed = true; provider.close(); configuration.clientSecret = null;
  };
  verify.rotate = next => {
    if (closed || !next || !next.grants || typeof next.grants !== 'object' || Array.isArray(next.grants)) throw new CaptureError('UNAVAILABLE');
    const newGrants = snapshotGrants(next.grants);
    const candidate = { apiBaseUrl: next.apiBaseUrl, clientId: next.clientId, clientSecret: next.clientSecret,
      verifierId: next.verifierId, timeoutMs: next.timeoutMs ?? configuration.timeoutMs, Sdk };
    const replacement = registry.replace(provider, candidate);
    configuration.clientSecret = null;
    configuration = candidate; configuredGrants = newGrants; provider = replacement;
  };
  return verify;
}

module.exports = { captureCredentials, createCaptureVerifier, createSentinelVerifier };
