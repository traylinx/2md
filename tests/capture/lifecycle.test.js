import { it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Deadline } = require('../../lib/capture/deadline');
const { Capacity } = require('../../lib/capture/capacity');
const { RequestPolicy } = require('../../lib/capture/networkPolicy');
const { createPrincipalVerifier, assertScope } = require('../../lib/capture/principal');

it('deadline includes waiting and fences late completion', async () => {
  const deadline = new Deadline(25);
  try { await expect(deadline.run(() => new Promise(resolve => setTimeout(resolve, 60)))).rejects.toMatchObject({ code: 'DEADLINE' }); }
  finally { deadline.close(); }
});
it('parent cancellation is propagated', async () => {
  const parent = new AbortController(), deadline = new Deadline(1000, parent.signal);
  parent.abort();
  try { await expect(deadline.run(() => 'late')).rejects.toMatchObject({ code: 'CANCELLED' }); }
  finally { deadline.close(); }
});
it('private operations never wait in the public queue', async () => {
  const capacity = new Capacity({ active: 1, queued: 1 }), deadline = new Deadline(1000);
  try {
    const release = await capacity.acquire('first', deadline);
    await expect(capacity.acquire('private', deadline, true)).rejects.toMatchObject({ code: 'CAPACITY' });
    await expect(capacity.acquire('first', deadline)).rejects.toMatchObject({ code: 'CAPACITY' });
    const waiting = capacity.acquire('second', deadline);
    await expect(capacity.acquire('third', deadline)).rejects.toMatchObject({ code: 'CAPACITY' });
    release(); (await waiting)();
    expect(capacity.active.size).toBe(0);
  } finally { deadline.close(); }
});
it('queue cancellation and shutdown release all waiters', async () => {
  const capacity = new Capacity({ active: 1 }), activeDeadline = new Deadline(1000), queuedDeadline = new Deadline(1000);
  try {
    const release = await capacity.acquire('one', activeDeadline);
    const waiting = capacity.acquire('two', queuedDeadline);
    queuedDeadline.abort();
    await expect(waiting).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(capacity.waiting.length).toBe(0);
    capacity.stop(); release();
    await expect(capacity.acquire('three', activeDeadline)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  } finally { activeDeadline.close(); queuedDeadline.close(); }
});
it('allows only one reviewed login POST, then GET/HEAD', async () => {
  const deadline = new Deadline(1000);
  const resolver = async url => ({ url: new URL(url) });
  const policy = new RequestPolicy({ deadline, resolver, recipe: { origin: 'https://example.com', loginPath: '/login',
    submitPath: '/login', readPaths: ['/report'], resourcePaths: [] } });
  const post = { url: 'https://example.com/login', method: 'POST', type: 'document' };
  try {
    await expect(policy.allow(post)).rejects.toMatchObject({ code: 'TARGET_DENIED' });
    policy.phase = 'submit'; await policy.allow(post);
    await expect(policy.allow(post)).rejects.toMatchObject({ code: 'TARGET_DENIED' });
    await expect(policy.allow({ ...post, method: 'DELETE' })).rejects.toMatchObject({ code: 'TARGET_DENIED' });
    await expect(policy.allow({ ...post, url: 'https://evil.example/', method: 'GET' })).rejects.toMatchObject({ code: 'TARGET_DENIED' });
    await policy.allow({ ...post, url: 'https://example.com/report', method: 'GET' });
  } finally { deadline.close(); }
});
it('missing identity integration fails closed and never falls back to caller labels', async () => {
  const deadline = new Deadline(1000);
  try { await expect(createPrincipalVerifier()('Bearer fake', deadline)).rejects.toMatchObject({ code: 'UNAVAILABLE' }); }
  finally { deadline.close(); }
});
it('rejects denied origins, paths and methods without DNS or other resolver effects', async () => {
  const deadline = new Deadline(1000), resolved = [];
  const policy = new RequestPolicy({ deadline, allowedOrigins: ['https://example.com'],
    recipe: { origin: 'https://example.com', loginPath: '/login', submitPath: '/login', readPaths: ['/report'], resourcePaths: [] },
    resolver: async url => { resolved.push(url); return { url: new URL(url) }; } });
  try {
    for (const item of [
      { url: 'https://credential-canary.attacker.example/a.js', method: 'GET', type: 'script' },
      { url: 'https://example.com/unapproved', method: 'GET', type: 'document' },
      { url: 'https://example.com/report', method: 'DELETE', type: 'document' },
      { url: 'https://example.com/login', method: 'POST', type: 'document' }]) {
      await expect(policy.allow(item)).rejects.toThrow();
    }
    expect(resolved).toEqual([]);
    await policy.allow({ url: 'https://example.com/report', method: 'GET', type: 'document' });
    expect(resolved).toEqual(['https://example.com/report']);
  } finally { deadline.close(); }
});
it('reserves the login POST before asynchronous DNS resolution', async () => {
  const deadline = new Deadline(1000); let resolveDns;
  const policy = new RequestPolicy({ deadline,
    recipe: { origin: 'https://example.com', loginPath: '/login', submitPath: '/login', readPaths: ['/report'], resourcePaths: [] },
    resolver: () => new Promise(resolve => { resolveDns = resolve; }) });
  policy.phase = 'submit';
  const post = { url: 'https://example.com/login', method: 'POST', type: 'document' };
  try {
    const first = policy.allow(post);
    await expect(policy.allow(post)).rejects.toMatchObject({ code: 'TARGET_DENIED' });
    resolveDns({ url: new URL(post.url) }); await first;
  } finally { deadline.close(); }
});
it('uses verified AUTH user id and operator grants, with no target-token forwarding', async () => {
  const deadline = new Deadline(1000), calls = [];
  const verify = createPrincipalVerifier({ authUrl: 'https://auth.example.com/verify',
    scopes: { 'verified-user': { operations: ['capture:public'], origins: ['https://example.com'] } },
    fetchImpl: async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify({ data: { type: 'user', id: 'verified-user' }, messages: [{ status: 200 }] })); } });
  try {
    const principal = await verify('Bearer synthetic-token', deadline);
    expect(principal.id).toBe('verified-user');
    assertScope(principal, { url: 'https://example.com/report' });
    expect(() => assertScope(principal, { url: 'https://different.example/report' })).toThrow();
    expect(calls[0].url).toBe('https://auth.example.com/verify');
    expect(calls[0].options.redirect).toBe('error');
    expect(principal).not.toHaveProperty('token');
  } finally { deadline.close(); }
});

it('accepts explicitly granted active agent principals without copying returned tokens', async () => {
  const deadline = new Deadline(1000);
  const verify = createPrincipalVerifier({ authUrl: 'https://auth.example.com/oauth/token/info',
    scopes: { 'agent-id': { operations: ['capture:authenticated'], origins: ['*'] } },
    fetchImpl: async () => new Response(JSON.stringify({ data: { type: 'agent', id: 'agent-id',
      attributes: { isActive: true, accessToken: 'DO_NOT_COPY', refreshToken: 'DO_NOT_COPY', ownerUserId: 'different-owner' } }, messages: [{ status: 200 }] })) });
  try {
    const principal = await verify('Bearer synthetic-agent-token', deadline);
    expect(principal.id).toBe('agent-id'); expect(JSON.stringify(principal)).not.toContain('DO_NOT_COPY');
    assertScope(principal, { url: 'https://new-site.example/report', loginUrl: 'https://new-site.example/login' }, true);
  } finally { deadline.close(); }
});
for (const isActive of [false, undefined]) {
  it('refuses inactive or unconfirmed agent identities', async () => {
    const deadline = new Deadline(1000);
    const verify = createPrincipalVerifier({ authUrl: 'https://auth.example.com/oauth/token/info',
      scopes: { 'agent-id': { operations: ['capture:public'], origins: ['*'] } },
      fetchImpl: async () => new Response(JSON.stringify({ data: { type: 'agent', id: 'agent-id', attributes: { isActive } }, messages: [{ status: 200 }] })) });
    try { await expect(verify('Bearer synthetic', deadline)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' }); }
    finally { deadline.close(); }
  });
}
