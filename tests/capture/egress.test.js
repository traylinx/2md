import { it, expect, afterEach } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const http = require('node:http'), net = require('node:net');
const { Deadline } = require('../../lib/capture/deadline');
const { createEgressProxy } = require('../../lib/capture/egressProxy');
const { resolveTarget } = require('../../lib/capture/targetPolicy');
const cleanups = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
async function listen(server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server.address().port;
}
async function proxy(options = {}) {
  const deadline = new Deadline(2000), instance = createEgressProxy({ deadline, ...options });
  const port = await listen(instance.server);
  cleanups.push(async () => { await instance.close(); deadline.close(); });
  return { port, instance, deadline };
}
function get(port, url, options = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, path: url, agent: false, ...options }, response => {
      const chunks = []; response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString() }));
      response.on('error', reject);
    });
    request.on('error', reject); request.end();
  });
}
it('transport connects to the validated IP, never resolves target host a second time', async () => {
  let receivedHeaders, pinned;
  const target = http.createServer((req, res) => { receivedHeaders = req.headers; res.end('owned response'); });
  const targetPort = await listen(target);
  cleanups.push(() => new Promise(resolve => target.close(resolve)));
  const { port } = await proxy({
    resolve: async value => ({ url: new URL(value), addresses: [{ address: '93.184.216.34', family: 4 }] }),
    request: (options, callback) => { pinned = options; return http.request({ ...options, host: '127.0.0.1', port: targetPort }, callback); },
  });
  const result = await get(port, 'http://example.com/report', { headers: { Authorization: 'Bearer secret', Cookie: 'session=secret' } });
  expect(result).toEqual({ status: 200, body: 'owned response' });
  expect(pinned.host).toBe('93.184.216.34'); expect(receivedHeaders.host).toBe('example.com');
  expect(receivedHeaders.authorization).toBeUndefined(); expect(receivedHeaders.cookie).toBeUndefined();
});
it('rebound private DNS and HTTP writes perform no target connection', async () => {
  let connections = 0;
  const { port } = await proxy({ resolve: value => resolveTarget(value, { lookup: async () => [{ address: '127.0.0.1', family: 4 }] }),
    request: () => { connections++; throw new Error('must not connect'); } });
  expect((await get(port, 'http://example.com/report')).status).toBe(403);
  expect((await get(port, 'http://example.com/report', { method: 'POST' })).status).toBe(403);
  expect(connections).toBe(0);
});
it('CONNECT pins public IPv4 and enforces HTTPS port', async () => {
  let pinned;
  const target = net.createServer(socket => { socket.on('data', () => socket.write('owned tunnel')); });
  const targetPort = await listen(target);
  cleanups.push(() => new Promise(resolve => target.close(resolve)));
  const { port } = await proxy({
    resolve: async value => ({ url: new URL(value), addresses: [{ address: '93.184.216.34', family: 4 }] }),
    connect: options => { pinned = options; return net.connect({ host: '127.0.0.1', port: targetPort }); },
  });
  const response = await new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port }, () => socket.write('CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n\r\n'));
    socket.once('error', reject);
    socket.once('data', data => { resolve(data.toString()); socket.destroy(); });
  });
  expect(response).toContain('200 Connection Established');
  expect(pinned).toEqual({ host: '93.184.216.34', family: 4, port: 443 });
});
it('expired lease refuses new traffic and request quota is enforced', async () => {
  const { port, deadline, instance } = await proxy({ maximumRequests: 1 });
  expect((await get(port, 'http://127.0.0.1/')).status).toBe(403);
  await expect(get(port, 'http://example.com/')).rejects.toBeDefined();
  expect(instance.stats().count).toBe(2);
  deadline.abort(); expect(instance.stats().closed).toBe(true);
});
