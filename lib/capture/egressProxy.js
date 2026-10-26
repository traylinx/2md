'use strict';
const http = require('node:http');
const net = require('node:net');
const { resolveTarget } = require('./targetPolicy');
const { CaptureError } = require('./errors');

// One lease per browser operation. DNS is checked HERE, then connect uses the
// checked IP literal, not the hostname. Chromium never gets direct egress.
function createEgressProxy({ deadline, resolve = resolveTarget, connect = net.connect,
  request = http.request, maximumBytes = 10 * 1024 * 1024, maximumRequests = 100 } = {}) {
  const sockets = new Set();
  let bytes = 0, count = 0, closed = false, limited = false;
  const own = socket => {
    sockets.add(socket);
    socket.on('error', () => {});
    socket.once('close', () => sockets.delete(socket));
    socket.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > maximumBytes) { limited = true; stop(); }
    });
    return socket;
  };
  const admit = () => {
    deadline.remaining();
    if (closed || ++count > maximumRequests) { limited = true; stop(); throw new CaptureError('LIMIT_EXCEEDED'); }
  };
  const stop = () => { closed = true; for (const socket of sockets) socket.destroy(); };
  const server = http.createServer(async (req, res) => {
    try {
      admit();
      if (!['GET', 'HEAD'].includes(req.method) || req.headers.upgrade || req.headers['content-length'] || req.headers['transfer-encoding']) {
        throw new CaptureError('TARGET_DENIED');
      }
      const { url, addresses } = await resolve(req.url, { deadline });
      if (url.protocol !== 'http:' || (url.port && url.port !== '80')) throw new CaptureError('TARGET_DENIED');
      const headers = { ...req.headers, host: url.host, connection: 'close' };
      for (const name of ['proxy-authorization', 'proxy-connection', 'authorization', 'cookie', 'forwarded', 'x-forwarded-for']) delete headers[name];
      const upstream = request({ host: addresses[0].address, family: addresses[0].family, port: 80,
        method: req.method, path: `${url.pathname}${url.search}`, headers, agent: false,
        timeout: deadline.remaining() }, incoming => {
        res.writeHead(incoming.statusCode, incoming.headers); incoming.pipe(res);
      });
      upstream.on('socket', own);
      upstream.on('timeout', () => upstream.destroy());
      upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
      req.once('aborted', () => upstream.destroy());
      res.once('close', () => upstream.destroy());
      upstream.end();
    } catch { if (!res.headersSent) res.writeHead(403); res.end(); }
  });
  server.on('connection', own);
  server.on('connect', async (req, client, head) => {
    try {
      admit();
      if (!/^(?:[a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\]):443$/.test(req.url)) throw new CaptureError('TARGET_DENIED');
      const { addresses } = await resolve(`https://${req.url}`, { deadline });
      deadline.remaining();
      if (closed || client.destroyed) return client.destroy();
      const upstream = own(connect({ host: addresses[0].address, family: addresses[0].family, port: 443 }));
      upstream.setTimeout(deadline.remaining(), () => upstream.destroy());
      upstream.once('connect', () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) upstream.write(head);
        client.pipe(upstream); upstream.pipe(client);
      });
      client.once('close', () => upstream.destroy());
      upstream.once('close', () => client.destroy());
    } catch { client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); }
  });
  server.on('upgrade', (_req, socket) => socket.destroy());
  server.on('clientError', (_error, socket) => socket.destroy());
  server.requestTimeout = 5000; server.headersTimeout = 5000;
  deadline.signal.addEventListener('abort', stop, { once: true });
  return { server, stats: () => ({ bytes, count, closed, limited }),
    close: async () => {
      stop(); deadline.signal.removeEventListener('abort', stop);
      await new Promise(resolveClose => server.close(resolveClose));
    } };
}

module.exports = { createEgressProxy };
