'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const c = require('../../lib/web/contracts');
const { alice, bob } = require('./fixtures/principals.json');
const makePlan = () => ({ version: 1, planId: 'plan-a', authSubject: alice.authSubject,
  workspaceUserId: alice.workspaceUserId, organizationId: alice.organizationId, projectId: alice.projectId,
  operation: 'public-read', urls: ['https://api.2md.traylinx.com/llms.txt'], policyVersion: 'public-v1',
  outputSchema: 'captured-pages-v1', deadlineMs: 90000, maxResponseBytes: 2097152,
  expiresAt: 2000000000000, retention: 'transient' });

test('principal is strict, copied, immutable and bound to both tenant and creator', () => {
  const p = c.principal(alice);
  assert.ok(Object.isFrozen(p)); assert.notEqual(p, alice);
  c.bindPrincipal(p, makePlan());
  assert.throws(() => c.bindPrincipal(c.principal(bob), makePlan()), /FORBIDDEN/);
  assert.throws(() => c.principal({ ...alice, role: 'OWNER' }), /INVALID_INPUT/);
});
test('deny stopped, unknown, denied and unknown principals; viewer cannot execute', () => {
  for (const change of [{ stopped: true }, { effectiveRole: 'DENIED' }, { effectiveRole: 'NONE' },
    { effectiveRole: 'ROOT' }, { kind: 'service' }]) assert.throws(() => c.principal({ ...alice, ...change }), /FORBIDDEN/);
  assert.equal(c.principal({ ...alice, effectiveRole: 'VIEWER' }).effectiveRole, 'VIEWER');
  assert.throws(() => c.executionPrincipal({ ...alice, effectiveRole: 'VIEWER' }), /FORBIDDEN/);
});
test('plan canonicalization freezes a copy and digest covers exact query and every bound field', () => {
  const source = makePlan(); const frozen = c.plan(source); const hash = c.digest(source);
  assert.ok(Object.isFrozen(frozen.urls)); source.urls.push('https://api.2md.traylinx.com/other');
  assert.equal(frozen.urls.length, 1);
  const variants = { planId: 'plan-b', authSubject: 'auth-b', workspaceUserId: 'user-b', organizationId: 'org-b',
    projectId: 'project-b', urls: ['https://api.2md.traylinx.com/llms.txt?tab=other'], policyVersion: 'public-v2',
    deadlineMs: 80000, maxResponseBytes: 1048576, expiresAt: 2000000000001 };
  for (const [key, value] of Object.entries(variants)) assert.notEqual(c.digest({ ...makePlan(), [key]: value }), hash, key);
  assert.equal(c.digest(Object.fromEntries(Object.entries(makePlan()).reverse())), hash);
  for (const change of [{ operation: 'login' }, { outputSchema: 'arbitrary' }, { retention: 'persistent' },
    { deadlineMs: NaN }, { expiresAt: 1.5 }, { maxResponseBytes: 999999999 }, { confirmed: true }]) {
    assert.throws(() => c.plan({ ...makePlan(), ...change }), /INVALID_INPUT/);
  }
});
test('reject prohibited, credential-bearing, duplicate and oversized target lists before any action', () => {
  for (const url of ['http://example.com', 'https://user:pass@example.com', 'https://127.0.0.1',
    'https://example.com/#frag', 'https://example.com/?access_token=secret', 'https://example.internal',
    'https://example.com:8443', 'https://example.com./', 'https://example.com\\@evil.com']) {
    assert.throws(() => c.publicTargets([url]), /TARGET_DENIED/, url);
  }
  for (const urls of [[], Array(6).fill('https://example.com'), ['https://example.com', 'https://example.com/']]) {
    assert.throws(() => c.publicTargets(urls), /INVALID_INPUT/);
  }
});
test('admission is a scoped shape, not an exported default authority', () => {
  const value = { version: 1, executionId: 'exec-a', planId: 'plan-a', planDigest: c.digest(makePlan()),
    authSubject: alice.authSubject, workspaceUserId: alice.workspaceUserId, organizationId: alice.organizationId,
    projectId: alice.projectId, audience: 'search-public-read', expiresAt: 2000000000000 };
  assert.ok(Object.isFrozen(c.admission(value)));
  for (const change of [{ audience: 'any' }, { planDigest: 'bad' }, { confirmed: true }]) {
    assert.throws(() => c.admission({ ...value, ...change }), /INVALID_INPUT/);
  }
  assert.equal(c.confirm, undefined);
});
