'use strict';
const assert = require('node:assert/strict');
const https = require('node:https'), net = require('node:net'), fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { createWorkerAdapter } = require('../../lib/capture/workerAdapter');
const { createEgressProxy } = require('../../lib/capture/egressProxy');
const { Deadline } = require('../../lib/capture/deadline');
const { freezeRecipe } = require('../../lib/capture/recipe');
const origin = 'https://capture.example.com', results = [];
const server = https.createServer({ key: fs.readFileSync('/fixtures/key.pem'), cert: fs.readFileSync('/fixtures/cert.pem') }, (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  const form = '<form id="login" action="/login" method="post"><input id="user" name="user"><input id="pass" name="password" type="password"><button id="submit">Login</button></form>';
  if (req.url === '/never') return;
  if (req.url === '/login' && req.method === 'POST') {
    req.resume(); return req.on('end', () => { res.writeHead(302, { Location: '/report', 'Set-Cookie': 'session=COOKIE_CANARY; Secure; HttpOnly' }); res.end(); });
  }
  if (req.url === '/login' || (req.url === '/report' && !req.headers.cookie)) return res.end(form);
  res.end('<title>Owned report</title><h1>Owned report</h1><p>This owned report contains useful readable information.</p><div id="account" data-user="synthetic-user">Account verified</div>');
});
const resolver = async value => ({ url: new URL(value), addresses: [{ address: '127.0.0.1', family: 4 }] });
let released = 0;
const worker = createWorkerAdapter({ workerPath: '/app/tests/fixtures/capture/browser-worker-fixture.cjs', lease: async deadline => {
  const proxy = createEgressProxy({ deadline, resolve: resolver,
    connect: options => net.connect({ ...options, port: server.address().port }) });
  await new Promise(resolve => proxy.server.listen(0, '127.0.0.1', resolve));
  return { proxyUrl: `http://127.0.0.1:${proxy.server.address().port}`, release: async () => { released++; await proxy.close(); return proxy.stats(); } };
} });

async function run(path, authenticated = false, budget = 25000) {
  const deadline = new Deadline(budget);
  const request = { url: origin + path, budgetMs: budget };
  let recipe;
  if (authenticated) {
    Object.assign(request, { loginUrl: origin + '/login', auth: { mode: 'inlineOnce', username: 'synthetic-user', password: 'PASSWORD_CANARY' } });
    request.login = { submitPath: '/login', readPaths: ['/report'],
      fields: { form: '#login', username: '#user', password: '#pass', submit: '#submit' }, proof: { selector: '#account', attribute: 'data-user' } };
      recipe = freezeRecipe(request);
  }
  try { return await worker.capture(request, { deadline, recipe, allowedOrigins: [origin] }); }
  finally { deadline.close(); }
}

async function check(name, action) {
  try { await action(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.stack }); }
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await check('real forked worker returns public result after profile cleanup', async () => {
    const result = await run('/article'); assert.match(result.markdown, /Owned report/);
    assert.equal(fs.readdirSync('/tmp').filter(name => name.startsWith('2md-capture-')).length, 0);
  });
  await check('private worker uses transient credentials without response or artifact leakage', async () => {
    const result = await run('/report', true); assert.match(result.markdown, /Owned report/);
    assert.doesNotMatch(JSON.stringify(result), /PASSWORD_CANARY|COOKIE_CANARY/);
    assert.equal(fs.readdirSync('/tmp').filter(name => name.startsWith('2md-capture-')).length, 0);
  });
  await check('forced deadline kills Chromium descendants and removes session files', async () => {
    await assert.rejects(run('/never', false, 2500));
    assert.equal(fs.readdirSync('/tmp').filter(name => name.startsWith('2md-capture-')).length, 0);
    await new Promise(resolve => setTimeout(resolve, 250));
    const processes = execFileSync('ps', ['-eo', 'stat,args'], { encoding: 'utf8' });
    const live = processes.split('\n').filter(line => /chromium/.test(line) && !/^Z/.test(line.trim()));
    assert.deepEqual(live, []);
  });
  await check('worker can serve fresh request after cancellation without session reuse', async () => {
    const result = await run('/article'); assert.match(result.markdown, /Owned report/); assert.equal(worker.healthy(), true);
  });
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  console.log(JSON.stringify({ suite: 'real worker IPC and cleanup, network-none container', released,
    passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results }, null, 2));
  process.exitCode = results.some(result => !result.passed) ? 1 : 0;
})().catch(error => { console.error(error); worker.stop(); server.close(); process.exitCode = 1; });
