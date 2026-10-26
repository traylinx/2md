'use strict';
// Owned loopback measurement only. Executed by the existing sandbox test harness.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { Deadline } = require('../../lib/capture/deadline');
const { VerifierTokenRegistry } = require('../../lib/capture/verifierTokens');
const current = require('../../lib/capture/sentinelPrincipal');
assert.ok(process.env.COMPAT_LAB_ROOT && global.gc, 'owned sandbox and explicit GC required');
const root = path.resolve(__dirname, '../..');
const beforePath = path.join(root, 'tests/fixtures/capture/verifier-pre-p04.cjs');
const beforeBytes = fs.readFileSync(beforePath);
assert.equal(crypto.createHash('sha256').update(beforeBytes).digest('hex'), '71bbd4aabe1abddcd5e269ad81a54174988d2addfc2385958d82feafa6cccc99');
// Resolve the unchanged local dependencies, but compile exact pre-task bytes.
// No cache registration/monkey patch of the current module.
const old = new Module(path.join(root, 'lib/capture/sentinelPrincipal.js'), module);
old.filename = path.join(root, 'lib/capture/sentinelPrincipal.js');
old.paths = Module._nodeModulePaths(path.dirname(old.filename));
old._compile(beforeBytes.toString(), old.filename);
const sdk = require('../../deploy/capture/sentinel-sdk/node_modules/traylinx-auth-client');
const caller = '12345678-1234-1234-1234-123456789abc';
let exchanges = 0, proofs = 0; const sockets = new Set();
const dir = fs.mkdtempSync(path.join(process.env.COMPAT_LAB_ROOT, 'verifier-profile-'));
const key = path.join(dir, 'key.pem'), cert = path.join(dir, 'cert.pem');
execFileSync('/usr/bin/openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert,
  '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
const server = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (req, res) => {
  req.resume(); req.on('end', () => {
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Connection', 'close');
    if (req.url === '/oauth/token') {
      exchanges++; return res.end(JSON.stringify({ access_token: 'synthetic-verifier', agent_secret_token: 'synthetic-unused', expires_in: 3600 }));
    }
    assert.equal(req.url, '/oauth/agent/introspect'); assert.equal(req.headers.authorization, 'Bearer synthetic-verifier');
    proofs++; res.end(JSON.stringify({ active: true, agent_id: caller, scopes: 'a2a', expires_at: Date.now() / 1000 + 60 }));
  });
});
server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function settled() {
  const end = performance.now() + 2000;
  while (sockets.size && performance.now() < end) await pause(10);
  assert.equal(sockets.size, 0, 'fixture sockets must close');
  global.gc(); await pause(20); global.gc();
  return { heapUsed: process.memoryUsage().heapUsed, activeHandles: process._getActiveHandles().length, sockets: sockets.size };
}
async function measure(label, factory, config, waves) {
  const registry = new VerifierTokenRegistry(); const verify = factory({ ...config, registry });
  const rows = [];
  try {
    for (let wave = 0; wave < waves; wave++) {
      const e = exchanges, p = proofs, start = performance.now(), cpu = process.cpuUsage();
      await Promise.all(Array.from({ length: 100 }, async () => {
        const deadline = new Deadline(20000);
        try {
          assert.equal((await verify('synthetic-caller', caller, deadline)).id, `agent:${caller}`);
          await new Promise(resolve => setImmediate(resolve)); // capture-like work boundary
          assert.equal((await verify('synthetic-caller', caller, deadline)).id, `agent:${caller}`);
        } finally { deadline.close(); }
      }));
      const elapsedMs = performance.now() - start, cpuUse = process.cpuUsage(cpu);
      rows.push({ wave, captures: 100, liveProofs: proofs-p, verifierExchanges: exchanges-e,
        elapsedMs, cpuMicroseconds: cpuUse, ...(await settled()), provider: registry.snapshot() });
    }
  } finally { verify.close?.(); registry.close(); }
  await settled(); assert.deepEqual(registry.snapshot(), { identities: 0, retainedGenerations: 0, flights: 0, waiters: 0, cachedTokens: 0 });
  return { label, rows, closed: registry.snapshot() };
}
(async () => {
  const oldCA = https.globalAgent.options.ca;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    https.globalAgent.options.ca = fs.readFileSync(cert);
    const config = { apiBaseUrl: `https://127.0.0.1:${server.address().port}`, clientId: 'synthetic-client',
      clientSecret: 'synthetic-secret', verifierId: '22345678-1234-1234-1234-123456789abc',
      grants: { [caller]: { operations: ['capture:public'], origins: ['https://example.test'] } },
      maxActive: 128, timeoutMs: 5000, loadSdk: () => sdk };
    const before = await measure('pre-P04', old.exports.createSentinelVerifier, config, 1);
    const after = await measure('P04-candidate', current.createSentinelVerifier, config, 6);
    assert.equal(before.rows[0].verifierExchanges, 200); assert.equal(before.rows[0].liveProofs, 200);
    assert.equal(after.rows[0].verifierExchanges, 1);
    for (const row of after.rows) {
      assert.equal(row.liveProofs, 200); assert.equal(row.provider.waiters, 0); assert.equal(row.provider.flights, 0);
      assert.equal(row.provider.identities, 1); assert.equal(row.provider.retainedGenerations, 1); assert.equal(row.provider.cachedTokens, 1);
      if (row.wave) assert.equal(row.verifierExchanges, 0);
      assert.ok(row.heapUsed - after.rows[0].heapUsed < 16 * 1024 * 1024, 'post-GC heap drift exceeds bounded lab allowance');
      assert.ok(row.activeHandles <= after.rows[0].activeHandles + 2, 'active handle accumulation');
    }
    fs.writeFileSync(path.join(process.env.COMPAT_LAB_ROOT, 'verifier-profile.json'), JSON.stringify({
      scope: 'local synthetic loopback,not native capacity or production certification', before, after,
      totalCaptures: 700, totalLiveProofs: proofs, totalVerifierExchanges: exchanges,
      thresholds: { maxPostGcHeapDriftBytes: 16*1024*1024, maxAdditionalHandles: 2, socketsAfterWave: 0 },
    }, null, 2)+'\n');
    console.log('verifier before/after profile PASS');
  } finally {
    https.globalAgent.options.ca = oldCA;
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
