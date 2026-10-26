'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createProjectPrincipalResolver } = require('../../lib/web/projectPrincipal');
const { alice, bob } = require('./fixtures/principals.json');
const endpoint = 'https://workspace.example.com/web/project-access';
const input = () => ({ authorization: 'Bearer synthetic-test-credential', organizationId: 'org-a', projectId: 'project-a' });
const response = (body = alice, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
});

test('fixed endpoint receives only bearer; no caller identity or admin headers forwarded', async () => {
  const calls = [];
  const resolve = createProjectPrincipalResolver({ endpoint, fetchImpl: async (...args) => { calls.push(args); return response(); } });
  assert.deepEqual(await resolve({ ...input(), headers: { 'User-Info': 'forged', ADMIN_ACCESS: 'forged' } }), alice);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], endpoint + '?organization_id=org-a&project_id=project-a');
  assert.deepEqual(calls[0][1].headers, { Authorization: input().authorization, Accept: 'application/json' });
  assert.equal(calls[0][1].redirect, 'error'); assert.equal(calls[0][1].cache, 'no-store');
});
test('invalid bearer/selectors and cancelled request make zero calls', async () => {
  let calls = 0;
  const resolve = createProjectPrincipalResolver({ endpoint, fetchImpl: async () => { calls++; return response(); } });
  for (const authorization of ['', 'Basic abc', 'Bearer bad\r\nInjected: yes']) {
    await assert.rejects(resolve({ ...input(), authorization }), /UNAUTHENTICATED/);
  }
  await assert.rejects(resolve({ ...input(), projectId: '../other' }), /INVALID_INPUT/);
  await assert.rejects(resolve({ ...input(), signal: AbortSignal.abort() }), /CANCELLED/);
  assert.equal(calls, 0);
});
test('foreign project, denial, malformed payload, oversized body and reflected credentials fail closed', async () => {
  const cases = [() => response(bob), () => response({ ...alice, stopped: true }),
    () => response({ ...alice, effectiveRole: 'DENIED' }), () => response({ ...alice, token: 'secret' }),
    () => response({ padding: 'x'.repeat(5000) }), () => response({ ...alice, authSubject: 'synthetic-test-credential' }),
    () => response(alice, 200, { 'Cache-Control': 'public' }), () => response(alice, 200, { 'Content-Type': 'text/plain' }),
    () => response({}, 401), () => response({}, 403), () => response({}, 500)];
  for (const makeResponse of cases) {
    const resolve = createProjectPrincipalResolver({ endpoint, fetchImpl: async () => makeResponse() });
    await assert.rejects(resolve(input()), e => ['FORBIDDEN', 'UNAVAILABLE', 'INVALID_INPUT', 'UNAUTHENTICATED'].includes(e.code));
  }
});
test('no membership cache: every resolution rechecks current authority', async () => {
  let calls = 0;
  const resolve = createProjectPrincipalResolver({ endpoint, fetchImpl: async () => ++calls === 1 ? response() : response({}, 403) });
  await resolve(input()); await assert.rejects(resolve(input()), /FORBIDDEN/); assert.equal(calls, 2);
});
test('parent cancellation bounds stalled body and errors never expose upstream details', async () => {
  const controller = new AbortController();
  const resolve = createProjectPrincipalResolver({ endpoint, fetchImpl: async () => {
    setTimeout(() => controller.abort(), 10);
    return new Response(new ReadableStream({ start() {} }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } });
  await assert.rejects(resolve({ ...input(), signal: controller.signal }), /CANCELLED/);
  const broken = createProjectPrincipalResolver({ endpoint, fetchImpl: async () => { throw new Error('secret upstream detail'); } });
  await assert.rejects(broken(input()), e => e.message === 'UNAVAILABLE');
});
test('endpoint must be operator-fixed https without credentials or query', () => {
  for (const endpoint of [undefined, 'http://localhost', 'https://a:b@example.com', 'https://example.com?proxy=other']) {
    assert.throws(() => createProjectPrincipalResolver({ endpoint }), /UNAVAILABLE/);
  }
});
