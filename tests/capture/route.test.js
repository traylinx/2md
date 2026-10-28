import { it, expect, afterEach } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const express = require('express');
const request = require('supertest');
const register = require('../../routes/capture');
const { CaptureError } = require('../../lib/capture/errors');
const { Capacity } = require('../../lib/capture/capacity');
const { Deadline } = require('../../lib/capture/deadline');
const servers = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve)))); });
const principal = { id: 'owned', operations: ['capture:public', 'capture:authenticated'], origins: ['https://example.com'] };
const output = { success: true, markdown: 'Owned fixture content' };
async function app(options = {}) {
  const instance = express(); register(instance, { publicEnabled: true, verify: async () => principal, capture: async () => output, ...options });
  const server = instance.listen(0, '127.0.0.1'); servers.push(server);
  await new Promise(resolve => server.once('listening', resolve)); return server;
}
it('disabled endpoints keep plain 404 without starting a worker', async () => {
  const res = await request(await app({ publicEnabled: false, privateEnabled: false })).post('/api/capture/v1').send({ url: 'https://example.com' });
  expect(res.status).toBe(404);
});
it('new route returns JSON and no-store', async () => {
  const res = await request(await app()).post('/api/capture/v1').send({ url: 'https://example.com' });
  expect(res.status).toBe(200); expect(res.body).toEqual(output); expect(res.headers['cache-control']).toBe('no-store');
});
it('strict body, budget, content encoding, method and limits', async () => {
  const server = await app();
  expect((await request(server).post('/api/capture/v1').send({ url: 'https://example.com', auth: {} })).status).toBe(400);
  expect((await request(server).post('/api/capture/v1').send({ url: 'https://example.com', budgetMs: 5 })).status).toBe(400);
  expect((await request(server).post('/api/capture/v1').set('Content-Type', 'text/plain').send('secret')).status).toBe(400);
  expect((await request(server).post('/api/capture/v1').set('Content-Encoding', 'gzip').send({ url: 'https://example.com' })).status).toBe(400);
  expect((await request(server).post('/api/capture/v1').send({ url: 'a'.repeat(17000) })).status).toBe(413);
  expect((await request(server).get('/api/capture/v1')).status).toBe(404);
});
it('caller rejection performs no capture and echoes no credentials', async () => {
  let calls = 0;
  const server = await app({ privateEnabled: true, verify: async () => { throw new CaptureError('UNAUTHENTICATED'); }, capture: async () => { calls++; } });
  const res = await request(server).post('/api/capture/v1/authenticated').send({ auth: { password: 'secret-canary' } });
  expect(res.status).toBe(401); expect(calls).toBe(0); expect(JSON.stringify(res.body)).not.toContain('secret-canary');
});
it('revocation before return withholds already captured content', async () => {
  let verifications = 0;
  const server = await app({ verify: async () => { if (++verifications === 2) throw new CaptureError('FORBIDDEN'); return principal; } });
  const res = await request(server).post('/api/capture/v1').send({ url: 'https://example.com' });
  expect(res.status).toBe(403); expect(res.body).not.toHaveProperty('markdown');
});
it('private overload rejects before body processing and never queues', async () => {
  const capacity = new Capacity({ active: 1 }), deadline = new Deadline(1000);
  const release = await capacity.acquire('other', deadline);
  try {
    const res = await request(await app({ privateEnabled: true, capacity })).post('/api/capture/v1/authenticated').send({ malformed: 'body' });
    expect(res.status).toBe(429); expect(capacity.waiting).toHaveLength(0);
  } finally { release(); deadline.close(); }
});
const loginInstructions = { submitPath: '/login', readPaths: ['/report'],
  fields: { form: '#login', username: '#user', password: '#pass', submit: '#submit' },
  proof: { selector: '#identity', attribute: 'data-user' } };
it('authenticated route accepts agent instructions without registering a website', async () => {
  const seen = [];
  const server = await app({ privateEnabled: true,
    verify: async () => ({ ...principal, origins: ['*'] }),
    capture: async (input, options) => { seen.push({ origin: options.recipe.origin, selector: options.recipe.fields.form }); return output; } });
  for (const host of ['first.example', 'second.example']) {
    const res = await request(server).post('/api/capture/v1/authenticated').send({
      url: `https://${host}/report`, loginUrl: `https://${host}/login`, login: loginInstructions,
      auth: { mode: 'inlineOnce', username: 'synthetic', password: 'synthetic' } });
    expect(res.status).toBe(200);
  }
  expect(seen.map(item => item.origin)).toEqual(['https://first.example', 'https://second.example']);
});
it('missing or executable login instructions do no browser work', async () => {
  let called = false;
  const server = await app({ privateEnabled: true, capture: async () => { called = true; } });
  for (const login of [undefined, { ...loginInstructions, script: 'doAnything()' }]) {
    const res = await request(server).post('/api/capture/v1/authenticated').send({
      url: 'https://example.com/report', loginUrl: 'https://example.com/login', login,
      auth: { mode: 'inlineOnce', username: 'synthetic', password: 'synthetic' } });
    expect(res.status).toBe(400);
  }
  expect(called).toBe(false);
});
it.each(['synthetic-auth-canary', 123, true, [], null])
('malformed auth %j cannot leak a slot or escape the handler', async auth => {
  const capacity = new Capacity();
  const server = await app({ privateEnabled: true, capacity });
  const input = { url: 'https://example.com/report', loginUrl: 'https://example.com/login', login: loginInstructions };
  const bad = await request(server).post('/api/capture/v1/authenticated').send({ ...input, auth });
  expect(bad.status).toBe(400);
  expect(JSON.stringify(bad.body)).not.toContain('synthetic-auth-canary');
  expect(capacity.active.size).toBe(0);
  const valid = await request(server).post('/api/capture/v1/authenticated').send({ ...input,
    auth: { mode: 'inlineOnce', username: 'synthetic', password: 'synthetic' } });
  expect(valid.status).toBe(200); expect(capacity.active.size).toBe(0);
});
it('forwards operator resource scope separately and rejects caller-injected scope', async () => {
  const seen=[];
  const server=await app({verify:async()=>({...principal,resourceOrigins:['https://assets.example.net']}),capture:async(_req,options)=>{seen.push(options);return output;}});
  expect((await request(server).post('/api/capture/v1').send({url:'https://example.com'})).status).toBe(200);
  expect(seen[0].allowedOrigins).toEqual(['https://example.com']);
  expect(seen[0].allowedResourceOrigins).toEqual(['https://assets.example.net']);
  expect((await request(server).post('/api/capture/v1').send({url:'https://example.com',resourceOrigins:['*']})).status).toBe(400);
});
it('withholds result if operator resource permission is revoked before disclosure', async () => {
  let n=0;
  const server=await app({verify:async()=>({...principal,resourceOrigins:++n===1?['https://assets.example.net']:[]})});
  const result=await request(server).post('/api/capture/v1').send({url:'https://example.com'});
  expect(result.status).toBe(403);expect(result.body).not.toHaveProperty('markdown');
});
