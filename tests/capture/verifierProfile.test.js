import { it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs');
const path = require('node:path');
it('controlled100caller before/after exchange counts and bounded warm lifecycle', async () => {
  const result = await promisify(execFile)(process.execPath, ['--expose-gc', path.join(process.env.COMPAT_REPO, 'tests/capture/verifier.profile.cjs')],
    { env: process.env, timeout: 60000, maxBuffer: 16384 });
  expect(result.stdout).toContain('profile PASS');
  const report = JSON.parse(fs.readFileSync(path.join(process.env.COMPAT_LAB_ROOT, 'verifier-profile.json')));
  expect(report.totalCaptures).toBe(700); expect(report.totalLiveProofs).toBe(1400);
  expect(report.totalVerifierExchanges).toBe(201);
}, 65000);
