// Loaded before Vitest, dependencies, application and child CLI imports.
const net = require('node:net');
const Module = require('node:module');
const path = require('node:path');
const dns = require('node:dns');
if (!process.env.COMPAT_LAB_ROOT) throw new Error('Missing isolated compatibility lab');
const ports = new Set();
globalThis.__compatPorts = ports;
// Do not delegate DNS to the host resolver (which can run outside this process).
const resolveFixture = (hostname, options = {}) => {
  const address = hostname === 'video.owned.invalid' ? '93.184.216.34' :
    ['localhost', '127.0.0.1'].includes(hostname) ? '127.0.0.1' : null;
  if (!address) throw new Error('COMPAT_DNS_DENIED');
  const record = { address, family: 4 };
  return options.all ? [record] : record;
};
dns.lookup = (hostname, options, callback) => {
  if (typeof options === 'function') { callback = options; options = {}; }
  try {
    const r = resolveFixture(hostname, options);
    process.nextTick(() => options?.all ? callback(null, r) : callback(null, r.address, r.family));
  } catch (error) { process.nextTick(() => callback(error)); }
};
dns.promises.lookup = async (hostname, options) => resolveFixture(hostname, options);
for (const name of ['resolve', 'resolve4', 'resolve6', 'resolveAny', 'resolveTxt', 'resolveMx', 'resolveSrv', 'reverse', 'lookupService']) {
  dns[name] = (...args) => process.nextTick(() => args.at(-1)(new Error('COMPAT_DNS_DENIED')));
  dns.promises[name] = async () => { throw new Error('COMPAT_DNS_DENIED'); };
}
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  this.once('listening', () => {
    const a = this.address();
    if (a?.port) { ports.add(a.port); this.once('close', () => ports.delete(a.port)); }
  });
  return listen.apply(this, args);
};
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const options = Array.isArray(args[0]) ? args[0][0] : net._normalizeArgs(args)[0];
  if (options.path) throw new Error('COMPAT_EGRESS_DENIED: Unix socket');
  const host = options.host || 'localhost';
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) || !ports.has(Number(options.port))) {
    throw new Error(`COMPAT_EGRESS_DENIED: ${host}:${options.port}; only this process fixture listeners allowed`);
  }
  return connect.apply(this, args);
};
// Native fetch uses undici; socket guard and OS policy still apply underneath.
const load = Module._load;
Module._load = function (id, parent, main) {
  if (id === 'dotenv') return { config: () => ({ parsed: {} }) };
  if (['openai', 'ioredis', 'bullmq', 'puppeteer', 'puppeteer-extra'].includes(id) || id.startsWith('@aws-sdk/')) {
    throw new Error(`COMPAT_PROVIDER_IMPORT_DENIED: ${id}`);
  }
  return load.call(this, id, parent, main);
};
for (const key of ['APP_DIR', 'JOBS_DIR', 'UPLOADS_DIR', 'HOME', 'TMPDIR']) {
  if (!path.resolve(process.env[key] || '').startsWith(`${process.env.COMPAT_LAB_ROOT}`)) {
    throw new Error(`Unsafe lab directory: ${key}`);
  }
}
