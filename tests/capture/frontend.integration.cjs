'use strict';
// Network-none synthetic fixture: exact TLS frontend with fixed loopback backend.
const assert = require('node:assert/strict');
const http = require('node:http'), https = require('node:https'), fs = require('node:fs');
const { start } = require('../../scripts/capture-frontend');
const results = []; let aborted = false, backendCalls = 0;
async function check(name, work) {
  try { await work(); results.push({ name, passed: true }); }
  catch (e) { results.push({ name, passed: false, error: e.message }); }
}
const backend = http.createServer((req, res) => {
  backendCalls++;
  if (req.url === '/hang') { res.on('close', () => { aborted = true; }); return; }
  let body = ''; req.on('data', c => body += c); req.on('end', () => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ body, host: req.headers.host, proxyAuth: req.headers['proxy-authorization'] || null }));
  });
});
const options = { hostname: '127.0.0.1', port: 8270, servername: 'capture.example.com', ca: fs.readFileSync('/fixtures/cert.pem') };
(async () => {
  await new Promise(r => backend.listen(8271, '127.0.0.1', r));
  process.env.CAPTURE_TLS_CERT_FILE = '/fixtures/cert.pem'; process.env.CAPTURE_TLS_KEY_FILE = '/fixtures/key.pem';
  const front = start(); await new Promise(r => front.server.once('listening', r));
  await check('TLS frontend streams request and response through fixed loopback upstream', () => new Promise((resolve, reject) => {
    const q = https.request({ ...options, path: '/echo', method: 'POST', headers: { Host: 'attacker.invalid', 'Proxy-Authorization': 'synthetic-discard' } }, r => {
      let body = ''; r.on('data', c => body += c); r.on('end', () => {
        try { assert.equal(r.statusCode, 200); assert.equal(r.headers['cache-control'], 'no-store');
          assert.deepEqual(JSON.parse(body), { body: 'first-second', host: '127.0.0.1:8271', proxyAuth: null }); resolve();
        } catch (e) { reject(e); }
      });
    });
    q.on('error', reject); q.write('first-'); setTimeout(() => q.end('second'), 10);
  }));
  await check('client disconnect closes backend response and cancels pending work', async () => {
    const q = https.get({ ...options, path: '/hang' }); q.on('error', () => {});
    await new Promise(r => setTimeout(r, 100)); q.destroy();
    for (let i = 0; i < 20 && !aborted; i++) await new Promise(r => setTimeout(r, 25));
    assert.equal(aborted, true);
  });
  for (const name of ['Authorization', 'X-Agent-User-Id', 'X-Agent-Secret-Token']) {
    await check(`duplicate ${name} is rejected before frontend header normalization`, () => new Promise((resolve, reject) => {
      const before = backendCalls;
      const q = https.request({ ...options, path: '/api/capture/v1', method: 'POST',
        headers: ['Host', 'capture.example.com', name, 'synthetic-one', name.toLowerCase(), 'synthetic-two'] }, r => {
        r.resume(); r.on('end', () => {
          try { assert.equal(r.statusCode, 401); assert.equal(backendCalls, before); resolve(); }
          catch (e) { reject(e); }
        });
      });
      q.on('error', reject); q.end();
    }));
  }
  await Promise.all([front.server, backend].map(s => new Promise(r => { s.closeAllConnections(); s.close(r); })));
  process.removeAllListeners('SIGTERM');
  console.log(JSON.stringify({ suite: 'TLS frontend streaming and cancellation', passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed).length, results }, null, 2));
  process.exitCode = results.some(r => !r.passed) ? 1 : 0;
})().catch(e => { console.error(e.code || 'frontend test failed'); process.exit(1); });
