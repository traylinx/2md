'use strict';
const fs = require('node:fs');
const { createPrincipalVerifier } = require('./principal');
const { createLeaseClient } = require('./proxyLease');
const { createWorkerAdapter } = require('./workerAdapter');
const { CaptureError } = require('./errors');
const { createCaptureVerifier, createSentinelVerifier } = require('./sentinelPrincipal');

function configFile(filename) {
  if (!filename) return {};
  const text = fs.readFileSync(filename, 'utf8');
  if (Buffer.byteLength(text) > 1024 * 1024) throw new CaptureError('UNAVAILABLE');
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new CaptureError('UNAVAILABLE');
  return data;
}

function createRuntime(env = process.env) {
  // Deployment qualification must set this ONLY after verifying real containment.
  if (env.CAPTURE_CONTAINMENT !== 'isolated-proxy-v1') throw new CaptureError('UNAVAILABLE');
  const userVerify = createPrincipalVerifier({ authUrl: env.CAPTURE_AUTH_URL, scopes: configFile(env.CAPTURE_GRANTS_FILE) });
  const agentVerify = env.HTML2MD_SENTINEL_AGENTS === '1' ? createSentinelVerifier({
    apiBaseUrl: env.CAPTURE_SENTINEL_URL, clientId: env.CAPTURE_SENTINEL_CLIENT_ID,
    clientSecret: env.CAPTURE_SENTINEL_CLIENT_SECRET, verifierId: env.CAPTURE_SENTINEL_VERIFIER_ID,
    grants: configFile(env.CAPTURE_AGENT_GRANTS_FILE),
  }) : undefined;
  const verify = createCaptureVerifier({ userVerify, agentVerify });
  const lease = createLeaseClient({ controlUrl: env.CAPTURE_PROXY_CONTROL_URL, token: env.CAPTURE_PROXY_TOKEN });
  const worker = createWorkerAdapter({ lease, executablePath: env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    tempRoot: '/tmp', onQuarantine: () => { process.exitCode = 1; } });
  return { verify, capture: worker.capture, worker };
}

module.exports = { createRuntime, configFile };
