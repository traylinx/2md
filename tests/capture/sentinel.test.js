import { it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const express = require('express');
const request = require('supertest');
const { Deadline } = require('../../lib/capture/deadline');
const { createPrincipalVerifier } = require('../../lib/capture/principal');
const { captureCredentials, createCaptureVerifier, createSentinelVerifier } = require('../../lib/capture/sentinelPrincipal');
const register = require('../../routes/capture');
const id = '12345678-1234-1234-1234-123456789abc';
const verifierId = '22345678-1234-1234-1234-123456789abc';
const grant = { operations: ['capture:public', 'capture:authenticated'], origins: ['https://example.com'] };
let sentinel, baseUrl, oldCA, behavior, calls, sockets, servers = [], timers = [], verifiers = [], exchanges = 0, oldTokenReplies = [];
const valid = () => ({ active: true, agent_id: id, expires_at: Date.now() / 1000 + 60, scopes: 'a2a' });
beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(process.env.COMPAT_LAB_ROOT, 'sentinel-tls-'));
  const key = path.join(dir, 'key.pem'), cert = path.join(dir, 'cert.pem');
  execFileSync('/usr/bin/openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert,
    '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
  oldCA = https.globalAgent.options.ca;
  https.globalAgent.options.ca = fs.readFileSync(cert);
  behavior = {}; calls = []; sockets = new Set();
  sentinel = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      calls.push({ url: req.url, body: new URLSearchParams(body), headers: req.headers });
      res.setHeader('Content-Type', 'application/json');
      // Tests reset/destroy fixture connections between cases. Do not let the
      // shared Node agent race a deliberately destroyed idle keep-alive socket.
      res.setHeader('Connection', 'close');
      if (req.url === '/oauth/token') exchanges++;
      const exchange = exchanges;
      if (req.url === '/oauth/agent/introspect' && behavior.rejectFirstToken && req.headers.authorization === 'Bearer synthetic-verifier-access-1') {
        const reject = () => { if (!res.destroyed) { res.statusCode = 401; res.end('{"error":"invalid_verifier"}'); } };
        if (behavior.barrier401) {
          oldTokenReplies.push(reject);
          if (oldTokenReplies.length === behavior.barrier401) oldTokenReplies.splice(0).forEach(fn => fn());
        } else reject();
        return;
      }
      if (behavior.hang === req.url) return;
      if (behavior.redirect === req.url) { res.writeHead(302, { Location: `${baseUrl}/leak` }); return res.end(); }
      if (behavior.error === req.url) { res.statusCode = behavior.status || 500; return res.end('{"error":"SECRET_CANARY"}'); }
      const reply = () => {
        if (res.destroyed) return;
        if (req.url === '/oauth/token') return res.end(JSON.stringify({ access_token: behavior.numberTokens ? `synthetic-verifier-access-${exchange}` : 'synthetic-verifier-access',
          agent_secret_token: 'synthetic-verifier-pass', expires_in: behavior.tokenTtl || 3600 })); // deliberately no pass TTL
        if (req.url === '/oauth/agent/introspect') {
          const params = new URLSearchParams(body);
          return res.end(JSON.stringify(behavior.result || (params.get('agent_secret_token') === 'synthetic-caller-pass' ? valid() : { active: false })));
        }
        res.statusCode = 404; res.end('{}');
      };
      const delay = behavior.delay || (req.url === '/oauth/token' ? behavior.tokenDelay : behavior.proofDelay);
      if (delay) timers.push(setTimeout(reply, delay)); else reply();
    });
  });
  sentinel.on('connection', s => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  await new Promise(r => sentinel.listen(0, '127.0.0.1', r));
  baseUrl = `https://127.0.0.1:${sentinel.address().port}`;
});
afterEach(async () => {
  verifiers.splice(0).forEach(v => v.close());
  behavior = {}; calls = []; exchanges = 0; oldTokenReplies = [];
  timers.splice(0).forEach(clearTimeout);
  for (const s of sockets) s.destroy();
  await Promise.all(servers.splice(0).map(s => new Promise(r => { s.closeAllConnections(); s.close(r); })));
});
afterAll(async () => { https.globalAgent.options.ca = oldCA; await new Promise(r => sentinel.close(r)); });

function verifier(extra = {}) {
  const v = createSentinelVerifier({ apiBaseUrl: baseUrl, clientId: 'synthetic-verifier-client',
    clientSecret: 'synthetic-verifier-secret', verifierId, grants: { [id]: grant }, ...extra });
  verifiers.push(v); return v;
}
async function verify(extra, token = 'synthetic-caller-pass') {
  const d = new Deadline(5000);
  try { return await verifier(extra)(token, id, d); } finally { d.close(); }
}
const custom = { 'X-Agent-User-Id': id, 'X-Agent-Secret-Token': 'synthetic-caller-pass' };
async function route(extra = {}) {
  const app = express();
  const userVerify = extra.userVerify || (async () => { throw Error('user fallback must not run'); });
  register(app, { publicEnabled: true, privateEnabled: true,
    verify: createCaptureVerifier({ userVerify, agentVerify: verifier(extra.verifierOptions) }),
    capture: extra.capture || (async () => ({ success: true, markdown: 'synthetic capture' })) });
  const s = app.listen(0, '127.0.0.1'); servers.push(s);
  await new Promise(r => s.once('listening', r)); return s;
}

it('loads exact approved SDK rather than legacy root dependencies', () => {
  expect(require('../../deploy/capture/sentinel-sdk/node_modules/traylinx-auth-client/package.json').version).toBe('1.1.0-rc.1');
});
it('real HTTPS SDK exchange binds caller identity and separates verifier credentials', async () => {
  expect(await verify()).toEqual({ id: `agent:${id}`, ...grant });
  expect(calls.map(c => c.url)).toEqual(['/oauth/token', '/oauth/agent/introspect']);
  expect(calls[0].body.get('client_id')).toBe('synthetic-verifier-client');
  expect(calls[1].headers.authorization).toBe('Bearer synthetic-verifier-access');
  expect(calls[1].body.get('agent_user_id')).toBe(id);
  expect(calls[1].body.get('agent_secret_token')).toBe('synthetic-caller-pass');
});
it.each([
  { active: false }, { active: 'true' }, { is_active: false }, { agent_id: verifierId },
  { expires_at: 0 }, { expires_at: '9999999999' }, { scopes: 'user' },
])('invalid, disabled, expired or wrongly bound metadata fails closed: %j', async patch => {
  behavior.result = { ...valid(), ...patch };
  await expect(verify()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
});
it('no grant is forbidden even with a cryptographically valid identity', async () => {
  await expect(verify({ grants: {} })).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
it('malformed grants fail closed', async () => {
  await expect(verify({ grants: { [id]: { operations: '*', origins: ['*'] } } })).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
it('invalid caller maps HTTP400 to authentication rejection, not outage', async () => {
  behavior.error = '/oauth/agent/introspect'; behavior.status = 400;
  await expect(verify()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
});
it.each([403, 429, 500])('verifier/backend error %s is unavailable and never replayed', async status => {
  behavior.error = '/oauth/agent/introspect'; behavior.status = status;
  await expect(verify()).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  expect(calls.filter(c => c.url === '/oauth/agent/introspect')).toHaveLength(1);
});
it('401 permits only one safe introspection refresh retry and no generic token POST replay', async () => {
  behavior.error = '/oauth/agent/introspect'; behavior.status = 401;
  await expect(verify()).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  expect(calls.filter(c => c.url === '/oauth/agent/introspect')).toHaveLength(2);
  expect(calls.filter(c => c.url === '/oauth/token')).toHaveLength(2);
});
it('credential redirect is refused without reaching redirect target', async () => {
  behavior.redirect = '/oauth/token';
  await expect(verify()).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  expect(calls.map(c => c.url)).toEqual(['/oauth/token']);
});
it('TLS verification remains enabled for untrusted certificates', async () => {
  const ca = https.globalAgent.options.ca;
  https.globalAgent.options.ca = undefined;
  try { await expect(verify()).rejects.toMatchObject({ code: 'UNAVAILABLE' }); }
  finally { https.globalAgent.options.ca = ca; }
  expect(calls).toHaveLength(0);
});
it('combined exchange/introspection has one authentication time budget', async () => {
  behavior.delay = 650;
  const start = Date.now();
  await expect(verify({ timeoutMs: 1000 })).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  expect(calls.map(c => c.url)).toEqual(['/oauth/token', '/oauth/agent/introspect']);
  expect(Date.now() - start).toBeGreaterThan(900);
  expect(Date.now() - start).toBeLessThan(1500);
});
it('disconnect cancellation aborts real transport and releases authentication capacity', async () => {
  behavior.hang = '/oauth/token';
  const v = verifier({ maxActive: 1 }), d = new Deadline(5000);
  const p = v('synthetic-caller-pass', id, d);
  timers.push(setTimeout(() => d.abort(), 40));
  await expect(p).rejects.toMatchObject({ code: 'CANCELLED' }); d.close();
  behavior = {};
  const next = new Deadline(1000);
  try { expect((await v('synthetic-caller-pass', id, next)).id).toBe(`agent:${id}`); }
  finally { next.close(); }
});
it('bounded auth admission rejects excess requests without credential exchanges', async () => {
  behavior.hang = '/oauth/token';
  const v = verifier({ maxActive: 1 }), d = new Deadline(5000), d2 = new Deadline(1000);
  const p = v('synthetic-caller-pass', id, d);
  await expect(v('synthetic-caller-pass', id, d2)).rejects.toMatchObject({ code: 'CAPACITY' });
  d.abort(); await expect(p).rejects.toMatchObject({ code: 'CANCELLED' }); d.close(); d2.close();
});
it('custom and bearer pass formats work; revalidation reaches Sentinel twice', async () => {
  const s = await route();
  for (const h of [custom, { 'X-Agent-User-Id': id, Authorization: 'Bearer synthetic-caller-pass' }]) {
    expect((await request(s).post('/api/capture/v1').set(h).send({ url: 'https://example.com' })).status).toBe(200);
  }
  expect(calls.filter(c => c.url === '/oauth/agent/introspect')).toHaveLength(4);
  expect(exchanges).toBe(1); // two complete captures, four live proofs, one verifier exchange
});
it.each([
  { ...custom, Authorization: 'Bearer ordinary-user-token' }, { 'X-Agent-Secret-Token': 'pass' },
  { 'X-Agent-User-Id': id }, { ...custom, 'X-Agent-User-Id': '' },
  { ...custom, 'X-Agent-Secret-Token': 'first,second' },
])('ambiguous/incomplete agent proof never uses user fallback: %j', async headers => {
  let captured = false;
  const s = await route({ capture: async () => { captured = true; } });
  expect((await request(s).post('/api/capture/v1').set(headers).send({ url: 'https://example.com' })).status).toBe(401);
  expect(captured).toBe(false); expect(calls).toHaveLength(0);
});
it('raw duplicate credentials rejected before normalized-header selection', () => {
  for (const name of ['Authorization', 'X-Agent-User-Id', 'X-Agent-Secret-Token']) {
    expect(() => captureCredentials({ headers: {}, rawHeaders: [name, 'one', name.toLowerCase(), 'two'] })).toThrow();
  }
});
it('feature disabled rejects agent markers without calling user verifier', async () => {
  const v = createCaptureVerifier({ userVerify: () => { throw Error('fallback'); } });
  const d = new Deadline(1000);
  try { await expect(v(undefined, d, { 'x-agent-user-id': id, 'x-agent-secret-token': 'pass' })).rejects.toMatchObject({ code: 'UNAUTHENTICATED' }); }
  finally { d.close(); }
});
it('ordinary user path retains original verifier contract with agent feature enabled', async () => {
  let userCalls = 0;
  const userVerify = createPrincipalVerifier({ authUrl: 'https://sentinel.example/oauth/token/info', scopes: { human: grant },
    fetchImpl: async (_url, options) => {
      userCalls++; expect(options.headers.Authorization).toBe('Bearer user-token');
      return new Response(JSON.stringify({ data: { id: 'human', type: 'user' }, messages: [{ status: 200 }] }));
    } });
  const s = await route({ userVerify });
  expect((await request(s).post('/api/capture/v1').set('Authorization', 'Bearer user-token').send({ url: 'https://example.com' })).status).toBe(200);
  expect(userCalls).toBe(2); expect(calls).toHaveLength(0);
});
it('scope restrictions prevent capture and never send platform headers to worker', async () => {
  let captured = false;
  const s = await route({ capture: async () => { captured = true; } });
  expect((await request(s).post('/api/capture/v1').set(custom).send({ url: 'https://another.example' })).status).toBe(403);
  expect(captured).toBe(false);
});
it('revocation during capture withholds content and sanitizes errors', async () => {
  const s = await route({ capture: async (input, options) => {
    expect(Object.keys(options).sort()).toEqual(['allowedOrigins', 'allowedResourceOrigins', 'deadline', 'recipe', 'requestId']);
    expect(JSON.stringify(input)).not.toContain('synthetic-caller-pass');
    behavior.result = { active: false };
    return { markdown: 'PRIVATE_CONTENT_CANARY' };
  } });
  const res = await request(s).post('/api/capture/v1').set(custom).send({ url: 'https://example.com' });
  expect(res.status).toBe(401);
  expect(JSON.stringify(res.body)).not.toMatch(/PRIVATE_CONTENT|synthetic|SECRET_CANARY/);
  expect(calls.filter(c => c.url === '/oauth/agent/introspect')).toHaveLength(2);
  expect(exchanges).toBe(1); // cached verifier token never caches caller authorization
});
it('private capture requires its own operation grant before body processing', async () => {
  const s = await route({ verifierOptions: { grants: { [id]: { ...grant, operations: ['capture:public'] } } } });
  const res = await request(s).post('/api/capture/v1/authenticated').set(custom).send({ auth: { password: 'SECRET_CANARY' } });
  expect(res.status).toBe(403); expect(JSON.stringify(res.body)).not.toContain('SECRET_CANARY');
});
it('authorized agent can use private capture without mixing website and platform credentials', async () => {
  let captured = false;
  const s = await route({ capture: async (input, options) => {
    captured = true;
    expect(input.auth.username).toBe('synthetic-website-user');
    expect(input.auth.password).toBe('synthetic-website-password');
    expect(options.recipe.origin).toBe('https://example.com');
    expect(input).not.toHaveProperty('authorization');
    return { success: true, markdown: 'synthetic private page' };
  } });
  const res = await request(s).post('/api/capture/v1/authenticated').set(custom).send({
    url: 'https://example.com/report', loginUrl: 'https://example.com/login',
    login: { submitPath: '/login', readPaths: ['/report'],
      fields: { form: '#login', username: '#user', password: '#password', submit: '#submit' },
      proof: { selector: '#account', attribute: 'data-user' } },
    auth: { mode: 'inlineOnce', username: 'synthetic-website-user', password: 'synthetic-website-password' },
  });
  expect(res.status).toBe(200); expect(captured).toBe(true);
  expect(JSON.stringify(res.body)).not.toContain('synthetic-website-password');
  expect(calls.filter(c => c.url === '/oauth/agent/introspect')).toHaveLength(2);
});
it('invalid startup configuration fails closed without environment identity fallback', () => {
  expect(() => verifier({ clientSecret: '' })).toThrow();
  expect(() => verifier({ apiBaseUrl: 'http://localhost' })).toThrow();
});


async function until(check) {
  const end = Date.now() + 3000;
  while (!check()) { if (Date.now() >= end) throw Error('owned fixture barrier timeout'); await new Promise(r => setTimeout(r, 5)); }
}
async function burst(v, count = 100) {
  const ds = Array.from({ length: count }, () => new Deadline(8000));
  try { return await Promise.all(ds.map(d => v('synthetic-caller-pass', id, d))); }
  finally { ds.forEach(d => d.close()); }
}
it('100 real HTTPS callers reuse one verifier exchange but every proof stays live', async () => {
  const v = verifier({ maxActive: 128, timeoutMs: 5000 });
  expect(await burst(v)).toHaveLength(100);
  expect(calls.filter(c => c.url === '/oauth/token')).toHaveLength(1);
  expect(calls.filter(c => c.url === '/oauth/agent/introspect')).toHaveLength(100);
  const d = new Deadline(3000);
  try { await v('synthetic-caller-pass', id, d); } finally { d.close(); }
  expect(calls.filter(c => c.url === '/oauth/token')).toHaveLength(1);
  expect(calls.filter(c => c.url === '/oauth/agent/introspect')).toHaveLength(101);
});
it('100 callers after real SDK expiry share one new exchange', async () => {
  behavior.tokenTtl = 1;
  const v = verifier({ maxActive: 128, timeoutMs: 5000 }), first = new Deadline(3000);
  try { await v('synthetic-caller-pass', id, first); } finally { first.close(); }
  await new Promise(r => setTimeout(r, 1000)); behavior.tokenTtl = 3600;
  expect(await burst(v)).toHaveLength(100);
  expect(calls.filter(c => c.url === '/oauth/token')).toHaveLength(2);
  expect(calls.filter(c => c.url === '/oauth/agent/introspect')).toHaveLength(101);
});
it('100 simultaneous401 responses share exactly one safe replacement exchange', async () => {
  behavior.numberTokens = true; behavior.rejectFirstToken = true; behavior.barrier401 = 100;
  const v = verifier({ maxActive: 128, timeoutMs: 5000 });
  expect(await burst(v)).toHaveLength(100);
  expect(calls.filter(c => c.url === '/oauth/token')).toHaveLength(2);
  expect(calls.filter(c => c.url === '/oauth/agent/introspect')).toHaveLength(200);
});
it('an early401 cannot make unsent peer proofs refresh independently or fail from stale local state', async () => {
  behavior.numberTokens = true; behavior.rejectFirstToken = true;
  const v = verifier({ maxActive: 128, timeoutMs: 5000 });
  expect(await burst(v)).toHaveLength(100);
  expect(calls.filter(c => c.url === '/oauth/token')).toHaveLength(2);
  expect(calls.filter(c => c.url === '/oauth/agent/introspect').length).toBeLessThanOrEqual(200);
});
it('cancelling one of100 waiting HTTPS callers preserves99 peers and one exchange', async () => {
  behavior.tokenDelay = 150;
  const v = verifier({ maxActive: 128, timeoutMs: 5000 });
  const ds = Array.from({ length: 100 }, () => new Deadline(8000));
  const tasks = ds.map(d => v('synthetic-caller-pass', id, d).then(value => ({ value }), error => ({ error })));
  try {
    await until(() => calls.some(c => c.url === '/oauth/token')); ds[0].abort();
    const outcomes = await Promise.all(tasks);
    expect(outcomes[0].error.code).toBe('CANCELLED'); expect(outcomes.filter(x => x.value)).toHaveLength(99);
    expect(calls.filter(c => c.url === '/oauth/token')).toHaveLength(1);
    expect(calls.filter(c => c.url === '/oauth/agent/introspect')).toHaveLength(99);
  } finally { ds.forEach(d => d.close()); }
});
it('rotation during real token exchange aborts old generation and never returns its identity', async () => {
  behavior.tokenDelay = 150;
  const v = verifier(), before = new Deadline(3000), after = new Deadline(3000);
  const old = v('synthetic-caller-pass', id, before).catch(e => e);
  try {
    await until(() => calls.some(c => c.url === '/oauth/token'));
    v.rotate({ apiBaseUrl: baseUrl, clientId: 'rotated-client', clientSecret: 'rotated-secret',
      verifierId: '32345678-1234-1234-1234-123456789abc', grants: { [id]: grant } });
    expect((await old).code).toBe('UNAVAILABLE');
    expect((await v('synthetic-caller-pass', id, after)).id).toBe(`agent:${id}`);
    expect(calls.filter(c => c.url === '/oauth/token').map(c => c.body.get('client_id'))).toEqual(['synthetic-verifier-client', 'rotated-client']);
    expect(calls.filter(c => c.url === '/oauth/agent/introspect')).toHaveLength(1);
  } finally { before.close(); after.close(); }
});
it('rotation while proof response is pending withholds old-generation authorization', async () => {
  behavior.proofDelay = 150;
  const v = verifier(), d = new Deadline(3000), next = new Deadline(3000);
  const old = v('synthetic-caller-pass', id, d).catch(e => e);
  try {
    await until(() => calls.some(c => c.url === '/oauth/agent/introspect'));
    v.rotate({ apiBaseUrl: baseUrl, clientId: 'rotated-client', clientSecret: 'rotated-secret',
      verifierId, grants: { [id]: { ...grant, operations: ['capture:public'] } } });
    expect((await old).code).toBe('UNAVAILABLE');
    expect((await v('synthetic-caller-pass', id, next)).operations).toEqual(['capture:public']);
  } finally { d.close(); next.close(); }
});
it('failed rotation is atomic and already-aborted calls cannot leak active admission', async () => {
  const v = verifier({ maxActive: 1 }), d = new Deadline(3000), next = new Deadline(3000);
  d.abort();
  try {
    await expect(v('synthetic-caller-pass', id, d)).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(() => v.rotate({ apiBaseUrl: 'http://unsafe', clientId: 'x', clientSecret: 'x', verifierId, grants: {} })).toThrow();
    expect((await v('synthetic-caller-pass', id, next)).id).toBe(`agent:${id}`);
  } finally { d.close(); next.close(); }
});

it('100 permanent401 callers cannot cause a third automatic exchange', async () => {
  behavior.numberTokens = true; behavior.rejectFirstToken = true; behavior.barrier401 = 100;
  behavior.error = '/oauth/agent/introspect'; behavior.status = 401;
  const v = verifier({ maxActive: 128, timeoutMs: 5000 });
  const ds = Array.from({ length: 100 }, () => new Deadline(8000));
  try {
    const outcomes = await Promise.allSettled(ds.map(d => v('synthetic-caller-pass', id, d)));
    expect(outcomes.every(x => x.status === 'rejected' && x.reason.code === 'UNAVAILABLE')).toBe(true);
    expect(calls.filter(c => c.url === '/oauth/token')).toHaveLength(2);
    expect(calls.filter(c => c.url === '/oauth/agent/introspect').length).toBeLessThanOrEqual(200);
  } finally { ds.forEach(d => d.close()); }
});
it.each([401, 503])('token exchange failure%s is not automatically replayed', async status => {
  behavior.error = '/oauth/token'; behavior.status = status;
  await expect(verify()).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  expect(calls.map(c => c.url)).toEqual(['/oauth/token']);
});
it('two factory handles share configured verifier cache while closing one preserves the other', async () => {
  const a = verifier(), b = verifier(), d = new Deadline(3000), e = new Deadline(3000);
  try {
    await a('synthetic-caller-pass', id, d); a.close();
    await b('synthetic-caller-pass', id, e);
    expect(calls.filter(c => c.url === '/oauth/token')).toHaveLength(1);
    expect(calls.filter(c => c.url === '/oauth/agent/introspect')).toHaveLength(2);
    await expect(a('synthetic-caller-pass', id, e)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  } finally { d.close(); e.close(); }
});
it('current malformed/invalid caller is checked live despite a warm verifier token', async () => {
  const v = verifier(), a = new Deadline(3000), b = new Deadline(3000);
  try {
    await v('synthetic-caller-pass', id, a);
    await expect(v('invalid-pass', id, b)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(calls.filter(c => c.url === '/oauth/token')).toHaveLength(1);
    expect(calls.filter(c => c.url === '/oauth/agent/introspect')).toHaveLength(2);
  } finally { a.close(); b.close(); }
});
it('grant snapshots cannot silently change during a live verification', async () => {
  const mutable = { [id]: { operations: ['capture:public'], origins: ['https://example.com'] } };
  const v = verifier({ grants: mutable }), d = new Deadline(3000);
  mutable[id].operations.push('capture:authenticated'); mutable[id].origins.push('*');
  try { expect(await v('synthetic-caller-pass', id, d)).toEqual({ id: `agent:${id}`, operations: ['capture:public'], origins: ['https://example.com'] }); }
  finally { d.close(); }
});

it.each([
  { name: 'expired caller', patch: { expires_at: 0 } },
  { name: 'changed caller identity', patch: { agent_id: verifierId } },
  { name: 'missing caller session', patch: { active: false } },
])('final $name never releases content despite warm verifier token', async ({ patch }) => {
  const s = await route({ capture: async () => { behavior.result = { ...valid(), ...patch }; return { markdown: 'PRIVATE_CANARY' }; } });
  const res = await request(s).post('/api/capture/v1').set(custom).send({ url: 'https://example.com' });
  expect(res.status).toBe(401); expect(JSON.stringify(res.body)).not.toContain('PRIVATE_CANARY');
  expect(exchanges).toBe(1); expect(calls.filter(c => c.url === '/oauth/agent/introspect')).toHaveLength(2);
});
it('disabled verifier at final proof withholds content after one bounded safe retry', async () => {
  const s = await route({ capture: async () => { behavior.error = '/oauth/agent/introspect'; behavior.status = 401; return { markdown: 'PRIVATE_CANARY' }; } });
  const res = await request(s).post('/api/capture/v1').set(custom).send({ url: 'https://example.com' });
  expect(res.status).toBe(503); expect(JSON.stringify(res.body)).not.toContain('PRIVATE_CANARY');
  expect(exchanges).toBe(2); expect(calls.filter(c => c.url === '/oauth/agent/introspect')).toHaveLength(3);
});
it('carries explicit resource scope without silently expanding navigation grants', async () => {
  const resources=['https://assets.example.net'];
  expect(await verify({grants:{[id]:{...grant,resourceOrigins:resources}}})).toEqual({id:`agent:${id}`,...grant,resourceOrigins:resources});
  await expect(verify({grants:{[id]:{...grant,resourceOrigins:['*']}}})).rejects.toMatchObject({code:'FORBIDDEN'});
});
