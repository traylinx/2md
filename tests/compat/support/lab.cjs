const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const workers = require('./workers.cjs');
const root = process.env.COMPAT_REPO;
const fixtures = path.join(root, 'tests/fixtures/compat');
const state = { requests: [], memory: 10, subscribers: [], notifications: [] };
const storage = {
  archiveExists: async () => false, deleteArchive: async () => {},
  getDownloadUrl: async () => null,
  writeJobArchive: async () => { throw new Error('Full archive storage path not enabled in lab'); },
};
const queue = {
  getLogBuffer: async () => '',
  connection: { duplicate() {
    const sub = new EventEmitter();
    sub.subscribe = async () => {}; sub.unsubscribe = () => { sub.unsubscribed = true; };
    sub.quit = () => { sub.closed = true; }; state.subscribers.push(sub); return sub;
  } },
};
const memory = { getMemoryMB: () => ({ rss: state.memory }), RSS_CEILING_MB: 768, tryGC: () => false };
const overrides = new Map([
  [path.join(root, 'lib/queue.js'), queue],
  [path.join(root, 'lib/storage/index.js'), storage],
  [path.join(root, 'lib/memoryGC.js'), memory],
  [path.join(root, 'lib/jobs/webhookDelivery.js'), { deliverWebhook: async () => ({ delivered: false, error: 'lab disabled' }) }],
  [path.join(root, 'lib/jobs/snsNotify.js'), { publishJobNotification: async () => ({ published: false, error: 'lab disabled' }) }],
]);
const load = Module._load;
Module._load = function (id, parent, main) {
  const file = Module._resolveFilename(id, parent);
  if (overrides.has(file)) return overrides.get(file);
  if (id === 'tree-kill') return workers.kill;
  const isWorkerCaller = parent?.filename.startsWith(`${root}/routes/`) || parent?.filename === `${root}/lib/jobs/asyncJobRunner.js`;
  if (id === 'child_process' && isWorkerCaller) return { spawn: workers.spawn };
  return load.call(this, id, parent, main);
};
const target = http.createServer((req, res) => {
  state.requests.push({ url: req.url, headers: req.headers });
  if (req.url.startsWith('/redirect')) { res.writeHead(302, { Location: '/native' }); return res.end(); }
  if (req.url.startsWith('/error')) { res.statusCode = 503; return res.end('Synthetic unavailable'); }
  if (req.url === '/llms.txt') { res.statusCode = 404; return res.end(); }
  if (req.url.startsWith('/native')) { res.setHeader('Content-Type', 'text/markdown'); return res.end(fs.readFileSync(path.join(fixtures, 'native.md'))); }
  res.setHeader('Content-Type', 'text/html');
  res.end(req.url.startsWith('/empty') ? '<html><body></body></html>' : fs.readFileSync(path.join(fixtures, 'article.html')));
});
const app = require(path.join(root, 'server.js'));
const server = http.createServer(app);
let ready;
function start() {
  if (!ready) ready = Promise.all([target, server].map(s => new Promise(resolve => s.listen(0, '127.0.0.1', resolve))));
  return ready;
}
function origin(s) { return `http://127.0.0.1:${s.address().port}`; }
async function request(method, endpoint, body, headers = {}) {
  await start();
  const response = await fetch(origin(server) + endpoint, {
    method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer synthetic-compat-key', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text(); let json;
  try { json = JSON.parse(text); } catch { /* stream or binary */ }
  return { status: response.status, headers: Object.fromEntries(response.headers), text, json };
}
function reset() {
  workers.reset(); state.requests.length = 0; state.subscribers.length = 0; state.memory = 10;
  for (const dir of [process.env.JOBS_DIR, process.env.UPLOADS_DIR]) {
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  }
}
async function close() {
  for (const server of [target, globalThis.__compatApiServer]) {
    if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  }
}
globalThis.__compatApiServer = server;
module.exports = { root, fixtures, state, workers, app, server, target, start, origin, request, reset, close,
  registry: require(path.join(root, 'lib/jobRegistry')), cache: require(path.join(root, 'lib/cacheManager')) };
