'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');
const { CaptureError } = require('./errors');

function killGroup(pid) {
  if (!Number.isInteger(pid) || pid < 2 || pid === process.pid) return;
  try { process.kill(-pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
}

async function terminate(child) {
  if (!child?.pid) return;
  killGroup(child.pid);
  if (child.exitCode !== null || child.signalCode !== null) return;
  let timer;
  try {
    await Promise.race([new Promise(resolve => child.once('exit', resolve)),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new CaptureError('CLEANUP_FAILED')), 1500); })]);
  } finally { clearTimeout(timer); }
}

function createWorkerAdapter({ lease, executablePath = '/usr/bin/chromium', tempRoot = os.tmpdir(),
  workerPath = path.resolve(__dirname, '../../scripts/capture-worker.js'), onQuarantine = () => {} } = {}) {
  let quarantined = false;
  const active = new Set();
  async function capture(request, { deadline, recipe, allowedOrigins = [], allowedResourceOrigins = [] }) {
    if (quarantined || !lease) throw new CaptureError('UNAVAILABLE');
    const proxy = await lease(deadline);
    let child, output, failure, abort, profile, abortFailure;
    try {
      deadline.remaining();
      profile = fs.mkdtempSync(path.join(tempRoot, '2md-capture-'));
      fs.chmodSync(profile, 0o700);
      child = fork(workerPath, [], { detached: true, silent: true,
        // Existing Turndown/domino uses __proto__ during module initialization.
        // Preserve its supported runtime; strict request schemas reject prototype keys.
        execArgv: ['--max-old-space-size=256'],
        env: { PATH: '/usr/bin:/bin', HOME: profile, TMPDIR: profile, LANG: 'C.UTF-8',
          PUPPETEER_EXECUTABLE_PATH: executablePath }, serialization: 'json' });
      active.add(child);
      // Never pipe browser errors, page console, or child stdout into app logs.
      child.stdout.resume(); child.stderr.resume();
      abort = () => { try { killGroup(child.pid); } catch (error) { abortFailure = error; } };
      deadline.signal.addEventListener('abort', abort, { once: true });
      let dispatchFailed;
      const exited = new Promise((resolve, reject) => {
        dispatchFailed = () => reject(new CaptureError('UPSTREAM_FAILED'));
        child.once('error', reject);
        child.on('message', message => {
          if (message?.type === 'result') output = message.result;
          else if (message?.type === 'error') failure = new CaptureError(message.code);
        });
        child.once('exit', code => code === 0 ? resolve() : reject(new CaptureError('UPSTREAM_FAILED')));
      });
      // Observe immediately: a synchronous deadline/send failure below enters
      // cleanup before deadline.run can observe the child's subsequent exit.
      // Keep awaiting the original promise so failures are never swallowed.
      void exited.catch(() => {});
      child.send({ type: 'capture', request, recipe, allowedOrigins, allowedResourceOrigins, profile, proxyUrl: proxy.proxyUrl,
        budgetMs: deadline.remaining() }, error => { if (error) dispatchFailed(); });
      await deadline.run(() => exited);
      if (failure) throw failure;
      if (!output?.success || typeof output.markdown !== 'string') throw new CaptureError('UPSTREAM_FAILED');
      return output;
    } finally {
      deadline.signal.removeEventListener('abort', abort);
      let proxyStatus, cleanupFailure = abortFailure;
      try {
        await terminate(child);
        if (profile) fs.rmSync(profile, { recursive: true, force: true });
        if (profile && fs.existsSync(profile)) throw new CaptureError('CLEANUP_FAILED');
      } catch (error) { cleanupFailure = error; }
      // Revoke egress even if OS process cleanup fails. Never keep an uncertain
      // browser connected while quarantining the runtime.
      try { proxyStatus = await proxy.release(); } catch (error) { cleanupFailure ||= error; }
      active.delete(child);
      if (cleanupFailure) {
        quarantined = true; onQuarantine(['EPERM', 'EACCES', 'ESRCH'].includes(cleanupFailure.code) ? cleanupFailure.code : 'CLEANUP_FAILED');
        throw new CaptureError('CLEANUP_FAILED');
      }
      if (proxyStatus?.limited) throw new CaptureError('LIMIT_EXCEEDED');
    }
  }
  return { capture, healthy: () => !quarantined,
    stop: () => { for (const child of active) killGroup(child.pid); } };
}

module.exports = { createWorkerAdapter, killGroup };
