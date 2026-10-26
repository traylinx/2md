'use strict';
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const { X509Certificate, createHash } = require('node:crypto');
const { CaptureError } = require('./errors');

// Only deployment-owned files are accepted; a request cannot change TLS settings.
function createTransport(app, { enabled, env = process.env } = {}) {
  const certFile = env.CAPTURE_TLS_CERT_FILE, keyFile = env.CAPTURE_TLS_KEY_FILE;
  if (env.CAPTURE_TLS_TERMINATED_LOOPBACK === '1') {
    if (certFile || keyFile) throw new CaptureError('UNAVAILABLE');
    return { server: http.createServer(app), healthy: () => true, host: '127.0.0.1', port: 8271 };
  }
  if (!certFile || !keyFile) {
    if (enabled || certFile || keyFile) throw new CaptureError('UNAVAILABLE');
    return { server: http.createServer(app), healthy: () => true };
  }
  let expires = 0, digest;
  function load() {
    const cert = fs.readFileSync(certFile), key = fs.readFileSync(keyFile);
    const expiry = Date.parse(new X509Certificate(cert).validTo);
    if (!Number.isFinite(expiry) || expiry <= Date.now()) throw new CaptureError('UNAVAILABLE');
    return { cert, key, expiry, digest: createHash('sha256').update(cert).update(key).digest('hex') };
  }
  const initial = load();
  const server = https.createServer({ key: initial.key, cert: initial.cert, minVersion: 'TLSv1.2' }, app);
  expires = initial.expiry; digest = initial.digest;
  // Projected Secret files rotate atomically. Keep the last valid context during
  // a transient read failure; expired certificates fail readiness and admission.
  function refresh() {
    try {
      const next = load();
      if (next.digest !== digest) {
        server.setSecureContext({ key: next.key, cert: next.cert, minVersion: 'TLSv1.2' });
        expires = next.expiry; digest = next.digest;
      }
    } catch { /* never log key material, filesystem errors, or request data */ }
  }
  const timer = setInterval(refresh, 30000); timer.unref();
  server.once('close', () => clearInterval(timer));
  return { server, healthy: () => expires > Date.now(), refresh };
}
module.exports = { createTransport };
