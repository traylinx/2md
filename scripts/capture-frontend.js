'use strict';
// Separate container: owns the deployment certificate, never a browser or logs.
const http = require('node:http');
const { createTransport } = require('../lib/capture/transport');
const { captureCredentials } = require('../lib/capture/sentinelPrincipal');
function start() {
  let draining = false;
  const transport = createTransport((req, res) => {
    if (draining || !transport.healthy()) { res.writeHead(503, { 'Cache-Control': 'no-store' }); return res.end(); }
    // Reject raw duplicates before this proxy collapses them into an object.
    try { captureCredentials(req); }
    catch { res.writeHead(401, { 'Cache-Control': 'no-store' }); return res.end(); }
    // Fixed loopback upstream; no URL or request header can select a destination.
    const headers = { ...req.headers, host: '127.0.0.1:8271', connection: 'close' };
    delete headers['proxy-authorization']; delete headers['proxy-connection'];
    const upstream = http.request({ hostname: '127.0.0.1', port: 8271, path: req.url,
      method: req.method, headers }, response => {
      res.writeHead(response.statusCode, response.headers); response.pipe(res);
    });
    upstream.setTimeout(65000, () => upstream.destroy());
    upstream.on('error', () => {
      if (!res.headersSent) { res.writeHead(503, { 'Cache-Control': 'no-store' }); res.end(); }
      else res.destroy();
    });
    req.on('aborted', () => upstream.destroy());
    res.on('close', () => { if (!res.writableFinished) upstream.destroy(); });
    req.pipe(upstream);
  }, { enabled: true });
  transport.server.headersTimeout = 5000; transport.server.requestTimeout = 65000;
  transport.server.listen(8270, '0.0.0.0');
  process.once('SIGTERM', () => { draining = true; transport.server.close(); setTimeout(() => process.exit(1), 66000).unref(); });
  return transport;
}
if (require.main === module) start();
module.exports = { start };
