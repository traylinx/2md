'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const c = require('../../lib/web/contracts');
const { createReadController } = require('../../lib/web/readController');
const { alice, bob } = require('./fixtures/principals.json');

function fixture(overrides = {}) {
  const calls = { auth: 0, admit: 0, execute: 0 };
  const plan = { version: 1, planId: 'plan-a', authSubject: alice.authSubject, workspaceUserId: alice.workspaceUserId,
    organizationId: alice.organizationId, projectId: alice.projectId, operation: 'public-read',
    urls: ['https://api.2md.traylinx.com/llms.txt'], policyVersion: 'public-v1', outputSchema: 'captured-pages-v1',
    deadlineMs: 90000, maxResponseBytes: 2097152, expiresAt: Date.now() + 60000, retention: 'transient' };
  const decision = () => ({ version: 1, executionId: 'exec-a', planId: plan.planId, planDigest: c.digest(plan),
    authSubject: plan.authSubject, workspaceUserId: plan.workspaceUserId, organizationId: plan.organizationId,
    projectId: plan.projectId, audience: 'search-public-read', expiresAt: plan.expiresAt });
  const ports = { policyVersion: 'public-v1', resolvePrincipal: async () => { calls.auth++; return alice; },
    loadPlan: async () => plan, admit: async () => { calls.admit++; return decision(); },
    execute: async (ref) => { calls.execute++; return { state: 'partial', quality: 'degraded', ref }; }, ...overrides };
  const read = createReadController(ports);
  const input = { authorization: 'Bearer synthetic', organizationId: 'org-a', projectId: 'project-a',
    planId: 'plan-a', confirmationId: 'confirmation-a' };
  return { calls, plan, decision, read, input, ports };
}
test('authorized path consumes server plan and admission; forwards references only and preserves partial result', async () => {
  const f = fixture(); const result = await f.read(f.input);
  assert.equal(result.result.state, 'partial'); assert.equal(result.result.quality, 'degraded');
  assert.deepEqual(Object.keys(result.result.ref).sort(), ['executionId', 'planDigest']);
  assert.deepEqual(f.calls, { auth: 3, admit: 1, execute: 1 });
});
test('missing real authority has no permissive default', () => {
  assert.throws(() => createReadController(), /UNAVAILABLE/);
  const f = fixture();
  for (const key of ['resolvePrincipal', 'loadPlan', 'admit', 'execute']) {
    assert.throws(() => createReadController({ ...f.ports, [key]: undefined }), /UNAVAILABLE/);
  }
});
test('foreign principal and VIEWER cannot dispatch or claim', async () => {
  for (const actor of [bob, { ...alice, effectiveRole: 'VIEWER' }]) {
    const f = fixture({ resolvePrincipal: async () => actor });
    await assert.rejects(f.read(f.input), /FORBIDDEN/); assert.equal(f.calls.admit, 0); assert.equal(f.calls.execute, 0);
  }
});
test('changed plan, subject, expiry, policy or fake confirmation cannot dispatch', async () => {
  for (const key of ['planDigest', 'authSubject', 'projectId', 'expiresAt', 'audience']) {
    const f = fixture();
    const read = createReadController({ ...f.ports, admit: async () => ({ ...f.decision(),
      [key]: key === 'expiresAt' ? Date.now() - 1 : key === 'planDigest' ? '0'.repeat(64) : 'other' }) });
    await assert.rejects(read(f.input)); assert.equal(f.calls.execute, 0);
  }
  const f = fixture({ admit: async () => ({ confirmed: true }) });
  await assert.rejects(f.read({ ...f.input, confirmed: true })); assert.equal(f.calls.execute, 0);
  for (const change of [{ policyVersion: 'old' }, { expiresAt: Date.now() - 1 }]) {
    const f = fixture(); Object.assign(f.plan, change);
    await assert.rejects(f.read(f.input), /STALE_PLAN/); assert.equal(f.calls.admit, 0);
  }
});
test('membership revoked before action causes no capture; revocation before result withholds content', async () => {
  for (const rejectAt of [2, 3]) {
    let count = 0;
    const f = fixture({ resolvePrincipal: async () => { if (++count === rejectAt) c.deny('FORBIDDEN'); return alice; } });
    await assert.rejects(f.read(f.input), /FORBIDDEN/);
    assert.equal(f.calls.execute, rejectAt === 2 ? 0 : 1);
  }
});
test('duplicate admission refusal cannot trigger second execution', async () => {
  const f = fixture(); let used = false;
  const read = createReadController({ ...f.ports, admit: async () => {
    if (used) c.deny('ALREADY_ADMITTED'); used = true; return f.decision();
  } });
  await read(f.input); await assert.rejects(read(f.input), /ALREADY_ADMITTED/);
  assert.equal(f.calls.execute, 1);
});
test('cancelled in-flight admission cannot dispatch after its late completion', async () => {
  const abort = new AbortController(); const f = fixture();
  const read = createReadController({ ...f.ports, admit: () => new Promise(resolve => {
    setTimeout(() => abort.abort(), 5); setTimeout(() => resolve(f.decision()), 20);
  }) });
  await assert.rejects(read({ ...f.input, signal: abort.signal }), /CANCELLED/);
  await new Promise(resolve => setTimeout(resolve, 25)); assert.equal(f.calls.execute, 0);
});
