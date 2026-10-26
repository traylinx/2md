'use strict';
// Dedicated proxy container. No target credentials, capture HTML, or persistent jobs.
const http = require('node:http');
const { randomUUID, timingSafeEqual } = require('node:crypto');
const { Deadline } = require('../lib/capture/deadline');
const { createEgressProxy } = require('../lib/capture/egressProxy');
const { readBody } = require('../lib/capture/readBody');
const { exactKeys } = require('../lib/capture/requestContract');
const { publicError, CaptureError } = require('../lib/capture/errors');

function createControl({ token, ports = [8281, 8282] }) {
  if (!token || token.length < 32) throw new CaptureError('UNAVAILABLE');
  const expected = Buffer.from(`Bearer ${token}`), leases = new Map(), reserved = new Set();
  async function release(id) {
    const lease = leases.get(id);
    if (!lease) return { expired: true };
    leases.delete(id); clearTimeout(lease.timer);
    await lease.proxy.close(); lease.deadline.close(); reserved.delete(lease.port);
    return lease.proxy.stats();
  }
  const server = http.createServer(async (req, res) => {
    if (req.url === '/health' && req.method === 'GET') return res.end('{"status":"ok"}');
    const actual = Buffer.from(req.headers.authorization || '');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) { res.writeHead(401); return res.end(); }
    const deadline = new Deadline(3000);
    res.setHeader('Content-Type', 'application/json');
    try {
      if (req.method !== 'POST' || !['/lease', '/release'].includes(req.url)) throw new CaptureError('INVALID_INPUT');
      const body = await readBody(req, 1024, deadline);
      if (req.url === '/release') {
        exactKeys(body, ['id']); const stats = await release(body.id); return res.end(JSON.stringify({ released: true, ...stats }));
      }
      exactKeys(body, ['budgetMs']);
      if (!Number.isInteger(body.budgetMs) || body.budgetMs < 1 || body.budgetMs > 60000) throw new CaptureError('INVALID_INPUT');
      const port = ports.find(item => !reserved.has(item));
      if (!port) throw new CaptureError('CAPACITY');
      reserved.add(port);
      const leaseDeadline = new Deadline(body.budgetMs), proxy = createEgressProxy({ deadline: leaseDeadline });
      try { await new Promise((resolve, reject) => { proxy.server.once('error', reject); proxy.server.listen(port, '0.0.0.0', resolve); }); }
      catch { reserved.delete(port); leaseDeadline.close(); throw new CaptureError('UNAVAILABLE'); }
      const id = randomUUID(), timer = setTimeout(() => release(id).catch(() => {}), body.budgetMs);
      leases.set(id, { port, proxy, deadline: leaseDeadline, timer });
      res.end(JSON.stringify({ id, port }));
    } catch (error) { const safe = publicError(error, randomUUID()); res.writeHead(safe.status); res.end(JSON.stringify(safe.body)); }
    finally { deadline.close(); }
  });
  server.headersTimeout = 5000; server.requestTimeout = 5000;
  return { server, async close() { await Promise.all([...leases.keys()].map(release)); server.close(); } };
}

if (require.main === module) {
  const control = createControl({ token: process.env.CAPTURE_PROXY_TOKEN });
  control.server.listen(8280, '0.0.0.0');
  process.on('SIGTERM', () => control.close().finally(() => process.exit(0)));
}
module.exports = { createControl };
