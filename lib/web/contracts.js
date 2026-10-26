'use strict';

// Product-only contracts. Never change legacy capture or Search request shapes.
const { createHash } = require('node:crypto');
const { isIP } = require('node:net');
const { parseTarget } = require('../capture/targetPolicy');

class WebBoundaryError extends Error {
  constructor(code) { super(code); this.name = 'WebBoundaryError'; this.code = code; }
}
function deny(code = 'INVALID_INPUT') { throw new WebBoundaryError(code); }
function identifier(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) deny();
  return value;
}
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) deny();
}
function integer(value, low, high) {
  if (!Number.isSafeInteger(value) || value < low || value > high) deny();
  return value;
}
function principal(value) {
  exact(value, ['version', 'kind', 'authSubject', 'workspaceUserId', 'organizationId', 'projectId', 'effectiveRole', 'stopped']);
  if (value.version !== 1 || value.kind !== 'human' || value.stopped !== false ||
      !['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'].includes(value.effectiveRole)) deny('FORBIDDEN');
  return Object.freeze({ version: 1, kind: 'human', authSubject: identifier(value.authSubject),
    workspaceUserId: identifier(value.workspaceUserId), organizationId: identifier(value.organizationId),
    projectId: identifier(value.projectId), effectiveRole: value.effectiveRole, stopped: false });
}
function executionPrincipal(value) {
  const p = principal(value);
  if (p.effectiveRole === 'VIEWER') deny('FORBIDDEN');
  return p;
}
function publicTargets(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 5) deny();
  const urls = values.map(raw => {
    if (typeof raw !== 'string' || raw.includes('\\')) deny('TARGET_DENIED');
    let u;
    try { u = parseTarget(raw); } catch { deny('TARGET_DENIED'); }
    if (u.protocol !== 'https:' || u.port || isIP(u.hostname) || u.hostname.includes(':') ||
        u.hostname.endsWith('.')) deny('TARGET_DENIED');
    return u.href;
  });
  if (new Set(urls).size !== urls.length) deny();
  return Object.freeze(urls);
}
function plan(value) {
  exact(value, ['version', 'planId', 'authSubject', 'workspaceUserId', 'organizationId', 'projectId',
    'operation', 'urls', 'policyVersion', 'outputSchema', 'deadlineMs', 'maxResponseBytes', 'expiresAt', 'retention']);
  if (value.version !== 1 || value.operation !== 'public-read' || value.outputSchema !== 'captured-pages-v1' ||
      value.retention !== 'transient') deny();
  return Object.freeze({ version: 1, planId: identifier(value.planId), authSubject: identifier(value.authSubject),
    workspaceUserId: identifier(value.workspaceUserId), organizationId: identifier(value.organizationId),
    projectId: identifier(value.projectId), operation: 'public-read', urls: publicTargets(value.urls),
    policyVersion: identifier(value.policyVersion), outputSchema: 'captured-pages-v1',
    deadlineMs: integer(value.deadlineMs, 1000, 180000),
    maxResponseBytes: integer(value.maxResponseBytes, 1024, 2 * 1024 * 1024),
    expiresAt: integer(value.expiresAt, 1, Number.MAX_SAFE_INTEGER), retention: 'transient' });
}
function digest(value) { return createHash('sha256').update(JSON.stringify(plan(value))).digest('hex'); }
function bindPrincipal(p, scope) {
  for (const field of ['authSubject', 'workspaceUserId', 'organizationId', 'projectId']) {
    if (p[field] !== scope[field]) deny('FORBIDDEN');
  }
}
function admission(value) {
  exact(value, ['version', 'executionId', 'planId', 'planDigest', 'authSubject', 'workspaceUserId',
    'organizationId', 'projectId', 'audience', 'expiresAt']);
  if (value.version !== 1 || value.audience !== 'search-public-read' ||
      typeof value.planDigest !== 'string' || !/^[a-f0-9]{64}$/.test(value.planDigest)) deny();
  return Object.freeze({ version: 1, executionId: identifier(value.executionId), planId: identifier(value.planId),
    planDigest: value.planDigest, authSubject: identifier(value.authSubject), workspaceUserId: identifier(value.workspaceUserId),
    organizationId: identifier(value.organizationId), projectId: identifier(value.projectId),
    audience: 'search-public-read', expiresAt: integer(value.expiresAt, 1, Number.MAX_SAFE_INTEGER) });
}

// A validated shape/digest is not consent. Only a separately supplied trusted
// admission implementation can authorize execution. No default implementation.
module.exports = { WebBoundaryError, deny, identifier, exact, principal, executionPrincipal,
  publicTargets, plan, digest, bindPrincipal, admission };
