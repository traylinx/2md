'use strict';
// Owned synthetic certificate only. Run in the network-none test container.
const assert = require('node:assert/strict');
const fs = require('node:fs'), https = require('node:https'), http = require('node:http');
const { createTransport } = require('../../lib/capture/transport');
const results = [], servers = [];
async function check(name, work) {
  try { await work(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, code: error.code, message: error.message }); }
}
function get(server, options = {}, module = https) {
  return new Promise((resolve, reject) => {
    const req = module.get({ hostname: '127.0.0.1', port: server.address().port, path: '/',
      servername: 'capture.example.com', ca: fs.readFileSync('/fixtures/cert.pem'), ...options }, res => {
      res.resume(); res.once('end', () => resolve(res.statusCode));
    });
    req.setTimeout(2000, () => req.destroy(new Error('Timeout'))); req.once('error', reject);
  });
}
async function listen(transport) {
  servers.push(transport.server);
  await new Promise(resolve => transport.server.listen(0, '127.0.0.1', resolve));
  return transport;
}
(async () => {
  await check('enabled capture cannot start without backend TLS', () => {
    assert.throws(() => createTransport(() => {}, { enabled: true, env: {} }), { code: 'UNAVAILABLE' });
  });
  await check('explicit sidecar mode binds only loopback and rejects key material in backend', async () => {
    const t = createTransport((_q, r) => r.end(), { enabled: true, env: { CAPTURE_TLS_TERMINATED_LOOPBACK: '1' } });
    assert.equal(t.host, '127.0.0.1'); assert.equal(t.port, 8271);
    assert.throws(() => createTransport(() => {}, { enabled: true, env: {
      CAPTURE_TLS_TERMINATED_LOOPBACK: '1', CAPTURE_TLS_KEY_FILE: '/fixtures/key.pem' } }), { code: 'UNAVAILABLE' });
  });
  const env = { CAPTURE_TLS_CERT_FILE: '/tmp/transport-cert.pem', CAPTURE_TLS_KEY_FILE: '/tmp/transport-key.pem' };
  fs.copyFileSync('/fixtures/cert.pem', env.CAPTURE_TLS_CERT_FILE); fs.copyFileSync('/fixtures/key.pem', env.CAPTURE_TLS_KEY_FILE);
  const transport = await listen(createTransport((_req, res) => res.end('owned'), { enabled: true, env }));
  await check('verified TLS with matching CA and hostname succeeds', async () => assert.equal(await get(transport.server), 200));
  await check('wrong hostname is refused', async () => assert.rejects(get(transport.server, { servername: 'wrong.example' }), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' }));
  await check('untrusted certificate is refused', async () => assert.rejects(get(transport.server, { ca: undefined })));
  await check('plaintext cannot reach capture handler', async () => assert.rejects(get(transport.server, {}, http)));
  await check('temporary certificate rotation error keeps previous valid context', async () => {
    fs.writeFileSync(env.CAPTURE_TLS_CERT_FILE, 'partial invalid certificate');
    transport.refresh(); assert.equal(transport.healthy(), true); assert.equal(await get(transport.server), 200);
    fs.copyFileSync('/fixtures/cert.pem', env.CAPTURE_TLS_CERT_FILE); transport.refresh();
  });
  await check('expired context is unhealthy', () => {
    const now = Date.now;
    try { Date.now = () => now() + 365 * 86400000; assert.equal(transport.healthy(), false); }
    finally { Date.now = now; }
  });
  await Promise.all(servers.map(server => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); })));
  fs.rmSync(env.CAPTURE_TLS_CERT_FILE); fs.rmSync(env.CAPTURE_TLS_KEY_FILE);
  console.log(JSON.stringify({ suite: 'capture backend TLS', passed: results.filter(x => x.passed).length,
    failed: results.filter(x => !x.passed).length, results }, null, 2));
  process.exitCode = results.some(x => !x.passed) ? 1 : 0;
})().catch(error => { console.error(error.code || 'transport test failed'); process.exit(1); });
