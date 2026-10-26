'use strict';
// Exact Linux candidate, --network none, synthetic loopback TLS only.
const assert = require('node:assert/strict');
const https = require('node:https'), fs = require('node:fs');
const { createSentinelVerifier } = require('../../lib/capture/sentinelPrincipal');
const { Deadline } = require('../../lib/capture/deadline');
const id = '12345678-1234-1234-1234-123456789abc';
const grant = { operations: ['capture:public'], origins: ['https://example.com'] };
const results = []; let invalid = false, hang = false, exchanges = 0, proofs = 0;
async function check(name, work) {
  try { await work(); results.push({ name, passed: true }); }
  catch (e) { results.push({ name, passed: false, error: e.message }); }
}
const server = https.createServer({ key: fs.readFileSync('/fixtures/key.pem'), cert: fs.readFileSync('/fixtures/cert.pem') }, (req, res) => {
  req.resume(); req.on('end', () => {
    res.setHeader('Connection', 'close'); res.setHeader('Content-Type', 'application/json');
    if (req.url === '/oauth/token') {
      exchanges++;
      if (hang) return;
      return res.end(JSON.stringify({ access_token: 'synthetic-verifier-token', agent_secret_token: 'synthetic-verifier-pass', expires_in: 3600 }));
    }
    proofs++;
    assert.equal(req.headers.authorization, 'Bearer synthetic-verifier-token');
    res.end(JSON.stringify(invalid ? { active: false } : { active: true, agent_id: id, scopes: 'a2a', expires_at: Date.now() / 1000 + 60 }));
  });
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  https.globalAgent.options.ca = fs.readFileSync('/fixtures/cert.pem');
  const config = { apiBaseUrl: `https://127.0.0.1:${server.address().port}`, clientId: 'synthetic-client',
    clientSecret: 'synthetic-only-secret', verifierId: '22345678-1234-1234-1234-123456789abc', grants: { [id]: grant } };
  const verify = createSentinelVerifier(config);
  async function call(v = verify) { const d = new Deadline(5000); try { return await v('synthetic-pass', id, d); } finally { d.close(); } }
  await check('Node 22+ and exact installed prerelease', async () => {
    assert.ok(Number(process.versions.node.split('.')[0]) >= 22);
    assert.equal(require('../../deploy/capture/sentinel-sdk/node_modules/traylinx-auth-client/package.json').version, '1.1.0-rc.1');
  });
  await check('real Linux TLS exchange validates granted caller', async () => assert.deepEqual(await call(), { id: `agent:${id}`, ...grant }));
  await check('invalid or newly revoked proof fails without cache', async () => {
    invalid = true; await assert.rejects(call(), { code: 'UNAUTHENTICATED' }); invalid = false;
  });
  await check('valid identity without grant is forbidden', async () => {
    const denied = createSentinelVerifier({ ...config, grants: {} });
    try { await assert.rejects(call(denied), { code: 'FORBIDDEN' }); } finally { denied.close(); }
  });
  await check('bounded concurrency, isolated callers and expected exchange count', async () => {
    const before = exchanges, beforeProofs = proofs;
    const output = await Promise.all(Array.from({ length: 8 }, () => call()));
    assert.ok(output.every(p => p.id === `agent:${id}`));
    assert.equal(exchanges - before, 0); // warm verifier token, eight LIVE caller proofs
    assert.equal(proofs - beforeProofs, 8);
  });
  await check('abort reaches real Linux transport; no dangling auth admission', async () => {
    verify.rotate(config); // explicit fresh generation makes this test reach token POST
    hang = true; const d = new Deadline(5000);
    const p = verify('synthetic-pass', id, d);
    const timer = setTimeout(() => d.abort(), 50);
    try { await assert.rejects(p, { code: 'CANCELLED' }); } finally { clearTimeout(timer); d.close(); hang = false; }
    await call();
  });
  verify.close();
  server.closeAllConnections(); await new Promise(r => server.close(r));
  console.log(JSON.stringify({ suite: 'Sentinel exact-image transport', passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed).length, exchanges, proofs, results }, null, 2));
  process.exitCode = results.some(r => !r.passed) ? 1 : 0;
})().catch(() => { console.error('Sentinel exact-image test failed'); process.exit(1); });
