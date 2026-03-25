require('dotenv').config();
const { Worker } = require('bullmq');
const { connection, publishLog, appendLogBuffer } = require('./lib/queue');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const jobRegistry = require('./lib/jobRegistry');
const { JOBS_DIR } = require('./lib/config');

const BIN_PATH = path.join(__dirname, 'bin', 'html2md');
const SCRIPTS_DIR = path.join(__dirname, 'scripts');

// Helper: spawn a child process, stream its output to Redis Pub/Sub, and return a promise
function runProcess(cmd, args, env, jobId) {
  return new Promise((resolve, reject) => {
    let allOutput = '';
    const child = spawn(cmd, args, { cwd: __dirname, env: env || process.env });

    const onData = (chunk) => {
      const text = chunk.toString();
      allOutput += text;
      // Stream each chunk to Redis for real-time SSE
      publishLog(jobId, text);
      appendLogBuffer(jobId, text);
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);

    child.on('error', (err) => {
      jobRegistry.updateJob(jobId, { status: 'failed', error: err.message });
      reject(err);
    });

    child.on('close', (code) => {
      resolve({ code, output: allOutput });
    });
  });
}

// ────────────────────────────────────────────────
// CONVERT WORKER
// ────────────────────────────────────────────────
const convertWorker = new Worker('2md-convert', async (job) => {
  const { jobId, url, cmdArgs, outDir } = job.data;
  console.log(`[Worker:Convert] ${jobId} → ${url}`);
  jobRegistry.updateJob(jobId, { status: 'running' });

  const { output } = await runProcess('node', cmdArgs, process.env, jobId);

  const mdPath = path.join(outDir, 'output', 'page.md');
  const jobJsonPath = path.join(outDir, 'job.json');

  if (!fs.existsSync(mdPath)) {
    jobRegistry.updateJob(jobId, { status: 'failed', error: 'Output markdown not found', inlineLog: output.substring(0, 50000) });
    return;
  }

  const markdown = fs.readFileSync(mdPath, 'utf8');
  const htmlPath = path.join(outDir, 'input', 'rendered.html');
  let htmlTokens = 0;
  if (fs.existsSync(htmlPath)) {
    htmlTokens = Math.ceil(fs.readFileSync(htmlPath, 'utf8').length / 3.7);
  }
  const mdTokens = Math.ceil(markdown.length / 3.7);

  let jobData = {};
  if (fs.existsSync(jobJsonPath)) {
    try { jobData = JSON.parse(fs.readFileSync(jobJsonPath, 'utf8')); } catch(e) {}
  }

  try { fs.rmSync(outDir, { recursive: true, force: true }); } catch(e) {}

  jobRegistry.updateJob(jobId, {
    status: 'done',
    completedAt: new Date().toISOString(),
    resultSummary: { tokens: { html: htmlTokens, md: mdTokens } },
    inlineResult: { success: true, url, markdown, tokens: { html: htmlTokens, md: mdTokens }, metadata: jobData.metadata || {}, quality: jobData.quality || {} },
    inlineLog: output.substring(0, 50000)
  });
}, { connection, concurrency: 5 });

// ────────────────────────────────────────────────
// BATCH WORKER
// ────────────────────────────────────────────────
const batchWorker = new Worker('2md-batch', async (job) => {
  const { jobId, urls, cmdArgs, siteDir, hostname } = job.data;
  console.log(`[Worker:Batch] ${jobId} → ${urls.length} URLs (${hostname})`);
  jobRegistry.updateJob(jobId, { status: 'running' });

  const { output } = await runProcess('node', cmdArgs, process.env, jobId);

  jobRegistry.updateJob(jobId, {
    status: 'done',
    completedAt: new Date().toISOString(),
    resultSummary: { total: urls.length },
    resultPath: siteDir,
    inlineLog: output.substring(0, 50000)
  });
}, { connection, concurrency: 2 });

// ────────────────────────────────────────────────
// CRAWL WORKER
// ────────────────────────────────────────────────
const crawlWorker = new Worker('2md-crawl', async (job) => {
  const { jobId, url, cmdArgs } = job.data;
  console.log(`[Worker:Crawl] ${jobId} → ${url}`);
  jobRegistry.updateJob(jobId, { status: 'running' });

  const { output } = await runProcess('node', cmdArgs, process.env, jobId);

  jobRegistry.updateJob(jobId, {
    status: 'done',
    completedAt: new Date().toISOString(),
    inlineLog: output.substring(0, 50000)
  });
}, { connection, concurrency: 2 });

// ────────────────────────────────────────────────
// AGENTIFY WORKER
// ────────────────────────────────────────────────
const agentifyWorker = new Worker('2md-agentify', async (job) => {
  const { jobId, url, urls, maxPages, includeApiSchema, targetAgent, effectiveApiKey } = job.data;
  console.log(`[Worker:Agentify] ${jobId} → ${url}`);
  jobRegistry.updateJob(jobId, { status: 'running' });

  const scriptPath = path.join(SCRIPTS_DIR, 'agentify.js');
  const env = Object.assign({}, process.env, {
    AGENTIFY_TARGET_URL: url,
    AGENTIFY_MAX_PAGES: maxPages,
    AGENTIFY_INCLUDE_API_SCHEMA: includeApiSchema,
    AGENTIFY_TARGET_AGENT: targetAgent,
    AGENTIFY_ACTIVE_API_KEY: effectiveApiKey || ''
  });

  let urlsTmpFile = null;
  if (urls && Array.isArray(urls) && urls.length > 0) {
    urlsTmpFile = path.join(require('os').tmpdir(), `agentify_worker_${Date.now()}.txt`);
    fs.writeFileSync(urlsTmpFile, urls.join('\n'));
    env.AGENTIFY_URLS_FILE = urlsTmpFile;
  }

  const { output } = await runProcess('node', [scriptPath], env, jobId);

  if (urlsTmpFile) { try { fs.unlinkSync(urlsTmpFile); } catch(e) {} }

  let hostname = '';
  try { hostname = new URL(url).hostname; } catch(e) {}
  const siteDir = hostname ? path.join(JOBS_DIR, hostname) : null;

  jobRegistry.updateJob(jobId, {
    status: 'done',
    completedAt: new Date().toISOString(),
    resultSummary: { hostname, maxPages, selectedUrls: urls || [] },
    resultPath: siteDir,
    inlineLog: output.substring(0, 50000)
  });
}, { connection, concurrency: 1 });

// ────────────────────────────────────────────────
// GRACEFUL SHUTDOWN
// ────────────────────────────────────────────────
const shutdown = async (signal) => {
  console.log(`[Worker] Received ${signal}, shutting down gracefully...`);
  await Promise.all([
    convertWorker.close(),
    batchWorker.close(),
    crawlWorker.close(),
    agentifyWorker.close(),
  ]);
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

console.log('🚀 [Worker] html2md queue workers started. Listening for jobs...');
