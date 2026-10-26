'use strict';
// One operation, then exit. No dotenv, job registry, disk outputs or inherited keys.
const fs = require('node:fs');
const childProcess = require('node:child_process');
const { Deadline } = require('../lib/capture/deadline');
const { CaptureError } = require('../lib/capture/errors');
const { captureWithBrowser } = require('../lib/capture/browserCapture');

const spawn = childProcess.spawn;
childProcess.spawn = function (file, args, options) {
  // Keep Chromium in the operation's process group. Parent cancellation then
  // kills ALL descendants even if launch fails before Puppeteer returns a handle.
  if (file === process.env.PUPPETEER_EXECUTABLE_PATH) options = { ...options, detached: false };
  const child = spawn.call(this, file, args, options);
  if (file === process.env.PUPPETEER_EXECUTABLE_PATH && child.pid) process.send?.({ type: 'browser', pid: child.pid });
  return child;
};
let used = false;
process.on('message', async message => {
  if (used || message?.type !== 'capture') return;
  used = true;
  const { request, recipe, allowedOrigins, proxyUrl, profile, budgetMs } = message;
  const deadline = new Deadline(Math.max(1, budgetMs - 1000));
  let browser, result, failure;
  try {
    if (!/^http:\/\/[a-zA-Z0-9.-]+:\d+$/.test(proxyUrl)) throw new CaptureError('UNAVAILABLE');
    const puppeteer = require('puppeteer');
    browser = await deadline.run(() => puppeteer.launch({ executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      headless: true, userDataDir: profile, pipe: true, dumpio: false,
      handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false, timeout: deadline.remaining(),
      env: { HOME: profile, TMPDIR: profile, PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-breakpad',
        '--disable-crash-reporter', '--disable-component-update', '--disable-sync', '--no-first-run',
        '--disable-quic', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
        `--proxy-server=${proxyUrl}`, '--proxy-bypass-list=<-loopback>',
        `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${new URL(proxyUrl).hostname}`],
    }));
    result = await captureWithBrowser(browser, request, { deadline, recipe, allowedOrigins });
  } catch (error) { failure = error instanceof CaptureError ? error.code : 'UPSTREAM_FAILED'; }
  finally {
    deadline.close();
    if (request.auth) { request.auth.username = ''; request.auth.password = ''; }
    try { if (browser) await browser.close(); fs.rmSync(profile, { recursive: true, force: true }); }
    catch { failure = 'CLEANUP_FAILED'; result = undefined; }
  }
  process.send?.(failure ? { type: 'error', code: failure } : { type: 'result', result }, () => process.exit(0));
});
process.on('disconnect', () => process.exit(1));
