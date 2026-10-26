// Local-only characterization. Never inherit credentials or load the checkout .env.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
if (process.platform !== 'darwin' || !fs.existsSync('/usr/bin/sandbox-exec')) {
  throw new Error('Compatibility lab requires macOS sandbox-exec. No unsandboxed fallback.');
}
if (process.argv.length > 2) throw new Error('No runner arguments: golden updates are not supported.');
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), '2md-compat-')));
const env = {
  PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: tmp, TMPDIR: tmp,
  NODE_ENV: 'test', TZ: 'UTC', LANG: 'en_US.UTF-8', NO_COLOR: '1',
  APP_DIR: path.join(tmp, 'app'), JOBS_DIR: path.join(tmp, 'jobs'),
  UPLOADS_DIR: path.join(tmp, 'uploads'), COMPAT_LAB_ROOT: tmp, COMPAT_REPO: root,
  API_KEYS: '{"enterprise":["synthetic-compat-key"]}',
  JOB_DOWNLOAD_SECRET: 'synthetic-compat-download-secret-not-for-production',
  SYSTEM_FILE_ENGINE_KEY: 'synthetic-file-key', VIDEO2MD_API_KEY: 'synthetic-video-key',
  VIDEO2MD_HOSTS: 'video.owned.invalid',
  NODE_OPTIONS: `--max-old-space-size=768 --require=${JSON.stringify(`${root}/tests/compat/support/guard.cjs`)}`,
};
const profile = `(version 1)(allow default)
  (deny network*)
  (allow network-inbound (local ip "localhost:*"))
  (allow network-outbound (remote ip "localhost:*"))
  (deny file-write*)
  (allow file-write* (subpath ${JSON.stringify(tmp)}) (literal "/dev/null"))
  (deny file-read* (regex #"/\\.env($|\\.)")
    (subpath ${JSON.stringify(path.join(os.homedir(), '.2md'))})
    (subpath ${JSON.stringify(path.join(os.homedir(), '.ssh'))})
    (subpath ${JSON.stringify(path.join(os.homedir(), '.config'))}))`;
const profilePath = path.join(tmp, 'lab.sb');
fs.writeFileSync(profilePath, profile);
// Vite's temporary bundled config stays inside the lab, not node_modules.
fs.copyFileSync(path.join(root, 'vitest.compat.config.mjs'), path.join(tmp, 'config.mjs'));
async function run() {
  const child = spawn('/usr/bin/sandbox-exec', ['-f', profilePath, process.execPath,
    path.join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--config', path.join(tmp, 'config.mjs')],
  { cwd: root, env, stdio: 'inherit', detached: true });
  const killGroup = () => { if (child.pid) try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already exited */ } };
  process.once('SIGINT', killGroup); process.once('SIGTERM', killGroup);
  const timer = setTimeout(killGroup, 120000);
  try {
    process.exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject); child.once('close', status => resolve(status ?? 1));
    });
    const report = path.join(tmp, 'results.json');
    if (process.env.COMPAT_REPORT && fs.existsSync(report)) {
      fs.copyFileSync(report, path.resolve(process.env.COMPAT_REPORT));
    }
  } finally {
    clearTimeout(timer); killGroup();
    process.removeListener('SIGINT', killGroup); process.removeListener('SIGTERM', killGroup);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });
