const fs = require('node:fs');
const path = require('node:path');
function readReleaseRevision(file = path.join(__dirname, '..', '.release-revision')) {
  try {
    const revision = fs.readFileSync(file, 'utf8').trim();
    return /^[a-f0-9]{40}$/.test(revision) ? revision : null;
  } catch { return null; }
}
function readVerifiedRelease(revision, file = path.join(require('./config').JOBS_DIR, '.deployment', 'verified.json')) {
  if (!revision) return false;
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return value.status === 'verified' && value.revision === revision &&
      /^ghcr\.io\/traylinx\/2md@sha256:[a-f0-9]{64}$/.test(value.image);
  } catch { return false; }
}
function readCaptureRevision(file = path.join(require('./config').JOBS_DIR, '.deployment', 'capture-verified.json')) {
  try {
    const value=JSON.parse(fs.readFileSync(file,'utf8'));
    return value.status==='verified' && /^[a-f0-9]{40}$/.test(value.revision) &&
      /^ghcr\.io\/traylinx\/2md-capture@sha256:[a-f0-9]{64}$/.test(value.image) ? value.revision : null;
  } catch { return null; }
}
module.exports = { readReleaseRevision, readVerifiedRelease, readCaptureRevision };
