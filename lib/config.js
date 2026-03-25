const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");

const APP_DIR = process.env.APP_DIR || path.join(os.homedir(), ".2md");
const JOBS_DIR = process.env.JOBS_DIR || path.join(APP_DIR, "jobs");
const REGISTRY_DIR = path.join(JOBS_DIR, "_registry");
const UPLOADS_DIR =
  process.env.UPLOADS_DIR || path.join(os.tmpdir(), "html2md_uploads");

const PORT = parseInt(process.env.PORT || "8222", 10);
const MAX_CONCURRENT_PAGES = parseInt(process.env.MAX_CONCURRENT_PAGES || "5", 10);
const MEMORY_THRESHOLD = parseFloat(process.env.MEMORY_THRESHOLD || "0.85");

const JOB_TTL_HOURS = parseInt(process.env.JOB_TTL_HOURS || "72", 10);
const JOB_DOWNLOAD_SECRET = process.env.JOB_DOWNLOAD_SECRET || crypto.randomBytes(32).toString('hex');

function validateConfig() {
  const errors = [];

  if (isNaN(PORT) || PORT < 1 || PORT > 65535) {
    errors.push(`PORT must be a number between 1 and 65535, got: "${process.env.PORT}"`);
  }

  if (isNaN(MAX_CONCURRENT_PAGES) || MAX_CONCURRENT_PAGES < 1 || MAX_CONCURRENT_PAGES > 50) {
    errors.push(`MAX_CONCURRENT_PAGES must be between 1 and 50, got: "${process.env.MAX_CONCURRENT_PAGES}"`);
  }

  if (isNaN(MEMORY_THRESHOLD) || MEMORY_THRESHOLD < 0.1 || MEMORY_THRESHOLD > 1.0) {
    errors.push(`MEMORY_THRESHOLD must be between 0.1 and 1.0, got: "${process.env.MEMORY_THRESHOLD}"`);
  }

  if (errors.length > 0) {
    console.error('[Config] Validation errors:');
    for (const err of errors) console.error(`  ✘ ${err}`);
    throw new Error(`Invalid configuration: ${errors.join('; ')}`);
  }
}

function ensureDirs() {
  for (const dir of [APP_DIR, JOBS_DIR, REGISTRY_DIR, UPLOADS_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

validateConfig();
ensureDirs();

module.exports = {
  APP_DIR, JOBS_DIR, REGISTRY_DIR, UPLOADS_DIR,
  PORT, MAX_CONCURRENT_PAGES, MEMORY_THRESHOLD,
  JOB_TTL_HOURS, JOB_DOWNLOAD_SECRET,
};

