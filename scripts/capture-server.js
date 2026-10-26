'use strict';
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { createRuntime } = require('../lib/capture/runtime');
const register = require('../routes/capture');
const { createTransport } = require('../lib/capture/transport');

function start() {
  const app = express();
  const publicEnabled = process.env.HTML2MD_ENHANCED_CAPTURE === '1';
  const privateEnabled = process.env.HTML2MD_AUTHENTICATED_CAPTURE === '1';
  const runtime = publicEnabled || privateEnabled ? createRuntime() : {};
  // Only this dedicated container owns these paths, with /tmp mounted as tmpfs.
  for (const name of fs.readdirSync('/tmp')) {
    if (/^2md-capture-[a-zA-Z0-9]+$/.test(name)) fs.rmSync(path.join('/tmp', name), { recursive: true, force: true });
  }
  const transport = createTransport(app, { enabled: publicEnabled || privateEnabled });
  app.use((_req, res, next) => {
    if (!transport.healthy()) return res.status(503).set('Cache-Control', 'no-store').json({ success: false, code: 'UNAVAILABLE' });
    next();
  });
  app.get('/health', (_req, res) => {
    const healthy = !runtime.worker || runtime.worker.healthy();
    res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'quarantined' });
  });
  const control = register(app, { publicEnabled, privateEnabled, ...runtime });
  const server = transport.server.listen(transport.port || 8270, transport.host || '0.0.0.0');
  server.requestTimeout = 65000; server.headersTimeout = 5000;
  process.once('SIGTERM', () => {
    control.stop(); server.close();
    const timer = setTimeout(() => { runtime.worker?.stop(); process.exit(1); }, 65000);
    timer.unref();
  });
  return { app, server, control, runtime };
}

if (require.main === module) start();
module.exports = { start };
