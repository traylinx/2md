import { it, expect, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
const require = createRequire(import.meta.url);
const { createWorkerAdapter } = require('../../lib/capture/workerAdapter');
const { Deadline } = require('../../lib/capture/deadline');
const roots = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function worker(release = async () => ({ released: true })) {
  const root = fs.mkdtempSync(path.join(process.env.COMPAT_LAB_ROOT, 'worker-')); roots.push(root);
  const quarantine = [];
  const adapter = createWorkerAdapter({ tempRoot: root,
    onQuarantine: code => quarantine.push(code),
    workerPath: path.resolve('tests/fixtures/capture/worker-fixture.cjs'),
    lease: async () => ({ proxyUrl: 'http://127.0.0.1:8281', release }) });
  return { root, adapter, quarantine };
}
for (const route of ['/success', '/crash', '/error', '/hang']) {
  it(`owned cleanup or explicit OS-denial quarantine after ${route}`, async () => {
    let releases = 0;
    const { root, adapter, quarantine } = worker(async () => { releases++; });
    const deadline = new Deadline(route === '/hang' ? 250 : 2000);
    try {
      const result = adapter.capture({ url: `https://example.com${route}` }, { deadline });
      if (route === '/success') expect((await result).markdown).toBe('Owned fixture content');
      else {
        const error = await result.catch(error => error);
        if (route === '/hang' && process.platform === 'darwin' && quarantine.includes('EPERM')) {
          expect(error.code).toBe('CLEANUP_FAILED'); expect(adapter.healthy()).toBe(false);
          expect(releases).toBe(1); return; // macOS sandbox denied kill; Linux real-worker suite qualifies cleanup.
        }
        expect(error.code).toBe(route === '/hang' ? 'DEADLINE' : route === '/error' ? 'AUTH_FAILED' : 'UPSTREAM_FAILED');
      }
      expect(fs.readdirSync(root)).toEqual([]); expect(releases).toBe(1); expect(adapter.healthy()).toBe(true);
    } finally { deadline.close(); adapter.stop(); }
  });
}
it('uncertain proxy cleanup withholds content and quarantines worker', async () => {
  const { root, adapter } = worker(async () => { throw new Error('synthetic cleanup failure'); });
  const deadline = new Deadline(2000);
  try {
    await expect(adapter.capture({ url: 'https://example.com/success' }, { deadline })).rejects.toMatchObject({ code: 'CLEANUP_FAILED' });
    expect(adapter.healthy()).toBe(false); expect(fs.readdirSync(root)).toEqual([]);
    await expect(adapter.capture({ url: 'https://example.com/success' }, { deadline })).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  } finally { deadline.close(); adapter.stop(); }
});
it('proxy byte-limit violation cannot return partial content as success', async () => {
  const { adapter } = worker(async () => ({ limited: true })); const deadline = new Deadline(2000);
  try { await expect(adapter.capture({ url: 'https://example.com/success' }, { deadline })).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' }); }
  finally { deadline.close(); adapter.stop(); }
});
for (const failure of ['pre-spawn-expiry', 'pre-dispatch-expiry', 'send-throws', 'send-callback']) {
  it(`observes child failure and releases lease after ${failure}`, async () => {
    const root = fs.mkdtempSync(path.join(process.env.COMPAT_LAB_ROOT, 'dispatch-')); roots.push(root);
    let child, spawned = 0, released = 0, calls = 0;
    const fork = () => {
      spawned++;
      child = Object.assign(new EventEmitter(), { pid: 555, exitCode: null, signalCode: null,
        stdout: { resume() {} }, stderr: { resume() {} }, send(_message, callback) {
          if (failure === 'send-throws') throw new Error('synthetic send error');
          queueMicrotask(() => callback(new Error('synthetic IPC closed')));
        } });
      return child;
    };
    const module = { exports: {} };
    const source = fs.readFileSync(path.resolve('lib/capture/workerAdapter.js'), 'utf8');
    vm.runInNewContext(source, { module, __dirname: path.resolve('lib/capture'), setTimeout, clearTimeout,
      process: { pid: 123, kill() { queueMicrotask(() => { child.signalCode = 'SIGKILL'; child.emit('exit', null); }); } },
      require: id => id === 'node:child_process' ? { fork } : id === './errors' ? require('../../lib/capture/errors') : require(id) });
    const adapter = module.exports.createWorkerAdapter({ tempRoot: root,
      lease: async () => ({ proxyUrl: 'http://127.0.0.1:8281', release: async () => { released++; } }) });
    const deadline = new Deadline(2000);
    const remaining = deadline.remaining.bind(deadline);
    deadline.remaining = () => {
      calls++;
      if ((failure === 'pre-spawn-expiry' && calls === 1) || (failure === 'pre-dispatch-expiry' && calls === 2)) {
        throw Object.assign(new Error('synthetic budget expiry'), { code: 'DEADLINE' });
      }
      return remaining();
    };
    try {
      await expect(adapter.capture({ url: 'https://example.com' }, { deadline })).rejects.toThrow();
      // Vitest reports any unhandled rejection as a suite failure. Let the exit
      // event and promise rejection run after capture's finally has completed.
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(released).toBe(1); expect(spawned).toBe(failure === 'pre-spawn-expiry' ? 0 : 1);
      expect(fs.readdirSync(root)).toEqual([]); expect(adapter.healthy()).toBe(true);
    } finally { deadline.close(); }
  });
}
