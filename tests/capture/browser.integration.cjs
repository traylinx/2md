'use strict';
// Run ONLY in the disposable --network=none container. Every page is owned.
// Test transport injects loopback and a test-only certificate exemption; neither
// is enabled by the production entrypoint or any customer request field.
const assert = require('node:assert/strict');
const https = require('node:https');
const fs = require('node:fs');
const net = require('node:net');
const puppeteer = require('puppeteer');
const { Deadline } = require('../../lib/capture/deadline');
const { createEgressProxy } = require('../../lib/capture/egressProxy');
const { captureWithBrowser } = require('../../lib/capture/browserCapture');
const { freezeRecipe } = require('../../lib/capture/recipe');

const origin = 'https://capture.example.com';
const traffic = [], results = [];
const article = '<h1>Owned report</h1><p>This is an owned deterministic article used to verify safe capture of readable information.</p>';
const report = `${article}<div id="account" data-user="synthetic-user">Account verified</div>`;
const loginForm = '<form id="login" method="post" action="/login"><input id="user" name="username"><input id="pass" name="password" type="password"><button id="submit" type="submit">Sign in</button></form>';
const server = https.createServer({ key: fs.readFileSync('/fixtures/key.pem'), cert: fs.readFileSync('/fixtures/cert.pem') }, (req, res) => {
  traffic.push({ method: req.method, path: req.url, cookie: !!req.headers.cookie, authorization: !!req.headers.authorization });
  res.setHeader('Content-Type', 'text/html');
  if (req.method === 'POST' && req.url === '/login') {
    let body = ''; req.on('data', part => { body += part; });
    return req.on('end', () => {
      const form = new URLSearchParams(body);
      if (form.get('username') === 'synthetic-user' && form.get('password') === 'synthetic-password') {
        res.writeHead(302, { Location: '/report', 'Set-Cookie': 'session=synthetic-session; HttpOnly; Secure; SameSite=Strict' }); res.end();
      } else res.end(loginForm);
      body = '';
    });
  }
  if (req.url === '/login') return res.end(loginForm);
  if (req.url === '/report') return res.end(req.headers.cookie ? report : loginForm);
  if (req.url === '/spa') return res.end(`<title>SPA</title><div id="app">Loading...</div><script>setTimeout(()=>{document.getElementById('app').innerHTML=${JSON.stringify(article + '<table><tr><th>A</th><th>B</th></tr><tr><td>Delayed</td><td>42</td></tr></table>')}},650)</script>`);
  if (req.url === '/poll') return res.end(`${article}<script>setInterval(()=>fetch('/pulse'),100)</script>`);
  if (req.url === '/pulse') return setTimeout(() => res.end('pulse'), 250);
  if (req.url === '/empty') return res.end('<body>Loading...</body>');
  if (req.url === '/challenge') return res.end('<title>Verify you are human</title><div id="captcha">Check</div>');
  if (req.url === '/escape') return res.end(`${article}<script>fetch('/mutate',{method:'POST'}).catch(()=>{});window.open('/popup');try{new WebSocket('wss://capture.example.com/socket')}catch{};try{new Worker('/worker.js')}catch{};fetch('http://127.0.0.1:8280/lease').catch(()=>{});</script>`);
  if (req.url === '/clean-realm') return res.end(`${article}<script>const f=document.createElement('iframe');document.body.append(f);try{new f.contentWindow.WebSocket('wss://capture.example.com/socket')}catch{};try{new f.contentWindow.EventSource('/events')}catch{};try{f.contentWindow.open('/popup')}catch{};</script>`);
  if (req.url === '/download') { res.setHeader('Content-Disposition', 'attachment; filename="secret.txt"'); return res.end('not a capture'); }
  if (req.url === '/never') return;
  res.end(`<html><title>Owned article</title><body>${article}</body></html>`);
});
server.on('upgrade', (req, socket) => { traffic.push({ method: 'UPGRADE', path: req.url }); socket.destroy(); });

const resolver = async value => {
  const url = new URL(value);
  if (url.origin !== origin) throw Object.assign(new Error('Denied fixture target'), { code: 'TARGET_DENIED' });
  return { url, addresses: [{ address: '127.0.0.1', family: 4 }] };
};

async function operation(path, auth) {
  const deadline = new Deadline(path === '/never' ? 1800 : 20000);
  const proxy = createEgressProxy({ deadline, resolve: resolver,
    connect: options => net.connect({ ...options, port: server.address().port }) });
  await new Promise(resolve => proxy.server.listen(0, '127.0.0.1', resolve));
  const profile = fs.mkdtempSync('/tmp/browser-fixture-');
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: true, userDataDir: profile,
      pipe: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-quic', '--ignore-certificate-errors',
        `--proxy-server=http://127.0.0.1:${proxy.server.address().port}`, '--proxy-bypass-list=<-loopback>'] });
    const request = { url: `${origin}${path}`, budgetMs: 20000 };
    let recipe;
    if (auth) {
      Object.assign(request, { loginUrl: `${origin}/login`, auth: { mode: 'inlineOnce', username: 'synthetic-user', password: auth } });
      request.login = { submitPath: '/login', readPaths: ['/report'],
        fields: { form: '#login', username: '#user', password: '#pass', submit: '#submit' }, proof: { selector: '#account', attribute: 'data-user' } };
      recipe = freezeRecipe(request);
    }
    return await captureWithBrowser(browser, request, { deadline, recipe, resolver });
  } finally { await browser?.close(); await proxy.close(); deadline.close(); fs.rmSync(profile, { recursive: true, force: true }); }
}

async function check(name, fn) {
  const start = Date.now();
  try { await fn(); results.push({ name, passed: true, durationMs: Date.now() - start }); }
  catch (error) { results.push({ name, passed: false, error: error.stack }); }
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  if (process.env.CAPTURE_TEST_STRESS === '1') {
    const operations = [], end = Date.now() + 120000;
    await Promise.all([0, 1].map(async slot => {
      while (Date.now() < end) {
        const start = Date.now(); let success = true;
        console.log(JSON.stringify({ stressStarted: true, slot, start }));
        try { await operation(slot ? '/report' : '/poll', slot ? 'synthetic-password' : undefined); } catch { success = false; }
        const item = { slot, start, end: Date.now(), success };
        operations.push(item); console.log(JSON.stringify({ stressOperation: item }));
      }
    }));
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    console.log(JSON.stringify({ suite: 'bounded public/private Chromium operations under contention', operations })); return;
  }
  await check('real browser public extraction', async () => { const r = await operation('/article'); assert.match(r.markdown, /Owned report/); assert.equal(r.metadata.title, 'Owned article'); });
  await check('delayed SPA table', async () => { const r = await operation('/spa'); assert.match(r.markdown, /Delayed/); assert.match(r.markdown, /42/); });
  await check('continuous polling bounded/degraded', async () => { const r = await operation('/poll'); assert.match(r.markdown, /Owned report/); assert.ok(r.warnings.includes('NETWORK_NOT_IDLE')); });
  await check('empty shell refused', async () => { await assert.rejects(operation('/empty'), { code: 'EMPTY_CONTENT' }); });
  await check('login refused publicly', async () => { await assert.rejects(operation('/login'), { code: 'AUTH_REQUIRED' }); });
  await check('challenge refused', async () => { await assert.rejects(operation('/challenge'), { code: 'HUMAN_REQUIRED' }); });
  await check('writes/popup/socket/worker/private endpoint denied', async () => {
    const start = traffic.length; await operation('/escape');
    assert.ok(!traffic.slice(start).some(item => ['/mutate', '/popup', '/socket', '/worker.js', '/lease'].includes(item.path)));
  });
  await check('download refused', async () => { await assert.rejects(operation('/download')); });
  await check('clean iframe realm cannot bypass socket stream and popup containment', async () => {
    const start = traffic.length; await operation('/clean-realm');
    assert.ok(!traffic.slice(start).some(item => ['/socket', '/events', '/popup'].includes(item.path)));
  });
  await check('authenticated read + one login POST', async () => {
    const start = traffic.length; const r = await operation('/report', 'synthetic-password');
    assert.match(r.markdown, /Owned report/);
    assert.ok(!JSON.stringify(r).includes('synthetic-password'));
    assert.ok(!JSON.stringify(r).includes('synthetic-session'));
    assert.equal(traffic.slice(start).filter(item => item.method === 'POST').length, 1);
  });
  await check('wrong password refuses content', async () => { await assert.rejects(operation('/report', 'wrong-synthetic-password')); });
  await check('new context cannot reuse login session', async () => { await assert.rejects(operation('/report'), { code: 'AUTH_REQUIRED' }); });
  await check('navigation deadline abort', async () => { const start = Date.now(); await assert.rejects(operation('/never')); assert.ok(Date.now() - start < 5000); });
  assert.ok(traffic.every(item => !item.authorization));
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  console.log(JSON.stringify({ suite: 'network-none real Chromium owned fixtures', passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed).length, results }, null, 2));
  process.exitCode = results.some(result => !result.passed) ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
