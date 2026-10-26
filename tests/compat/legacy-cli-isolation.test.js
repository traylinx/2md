import { test, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const root = process.env.COMPAT_REPO;
const fixtures = path.join(root, 'tests/fixtures/compat');
test.each([['help', ['--help']], ['missing', []]])('CLI %s matches frozen stdout, stderr and exit', (name, args) => {
  const r = spawnSync(process.execPath, [path.join(root, 'bin/html2md'), ...args], { env: process.env, encoding: 'utf8', timeout: 5000 });
  expect({ status: r.status, stdout: r.stdout, stderr: r.stderr }).toEqual(JSON.parse(fs.readFileSync(path.join(fixtures, `cli-${name}.json`), 'utf8')));
});
test('fixture and golden digests cannot silently change', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(fixtures, 'MANIFEST.json'), 'utf8'));
  for (const [name, hash] of Object.entries(manifest.sha256)) {
    expect(crypto.createHash('sha256').update(fs.readFileSync(path.join(fixtures, name))).digest('hex'), name).toBe(hash);
  }
});
test('no host credentials inherited and dotenv never loads', () => {
  for (const key of ['AIL_API_KEY', 'OPENAI_API_KEY', 'AWS_ACCESS_KEY_ID', 'REDIS_URL']) expect(process.env[key]).toBeUndefined();
  expect(require('dotenv').config()).toEqual({ parsed: {} });
  expect(process.env.HOME).toBe(process.env.COMPAT_LAB_ROOT);
});
test('network guard rejects external IPs and unregistered loopback ports before connecting', () => {
  expect(() => net.connect(443, '203.0.113.1')).toThrow('COMPAT_EGRESS_DENIED');
  expect(() => net.connect(9222, '127.0.0.1')).toThrow('COMPAT_EGRESS_DENIED');
  expect(() => net.connect('/tmp/not-an-authorized-socket')).toThrow('COMPAT_EGRESS_DENIED');
});
test('OS sandbox blocks external network even without JavaScript guard', () => {
  const code = "const s=require('net').connect(443,'203.0.113.1');s.on('error',e=>{console.log(e.code);s.destroy()});setTimeout(()=>{s.destroy();process.exit(2)},500).unref()";
  const r = spawnSync(process.execPath, ['-e', code], { env: { ...process.env, NODE_OPTIONS: '' }, encoding: 'utf8', timeout: 1500 });
  expect(r.status).toBe(0); expect(r.stdout.trim()).toMatch(/^(EPERM|EACCES)$/);
});
test('OS sandbox blocks checkout writes and .env reads', () => {
  expect(() => fs.writeFileSync(path.join(root, 'compat-write-canary'), 'not allowed')).toThrow();
  const file = path.join(process.env.COMPAT_LAB_ROOT, '.env');
  fs.writeFileSync(file, 'SYNTHETIC_CANARY=not-a-secret');
  expect(() => fs.readFileSync(file, 'utf8')).toThrow();
});
