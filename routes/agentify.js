const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const jobRegistry = require('../lib/jobRegistry');
const { JOBS_DIR } = require('../lib/config');
const { sendError, ERROR_CODES } = require('../lib/http/errorResponse');
const { runAsyncJob: defaultRunAsyncJob } = require('../lib/jobs/asyncJobRunner');

module.exports = function registerAgentifyRoutes(app, {
  apiLimiter,
  spawnProcess = spawn,
  runAsyncJob = defaultRunAsyncJob,
  registry = jobRegistry,
} = {}) {
  app.post('/api/agentify', apiLimiter, (req, res) => {
    const defaultMaxPages = process.env.AGENTIFY_MAX_PAGES ? parseInt(process.env.AGENTIFY_MAX_PAGES, 10) : 50;
    const { url, urls, maxPages = defaultMaxPages, includeApiSchema = false, targetAgent = 'web', apiKey } = req.body;

    if (!url) {
      return sendError(res, 400, 'Missing url in request body', ERROR_CODES.VALIDATION_ERROR);
    }

    const byokEnabled = process.env.AGENTIFY_BYOK === 'true';
    const effectiveApiKey = byokEnabled ? apiKey : process.env.AGENTIFY_LLM_API_KEY;

    if (byokEnabled && !effectiveApiKey) {
      return sendError(res, 400, 'AGENTIFY_BYOK is enabled. Missing apiKey in request body.', ERROR_CODES.UNAUTHORIZED);
    }

    let hostname = '';
    try { hostname = new URL(url).hostname; } catch(e) {}
    const job = registry.createJob('agentify', url, `${hostname || url} (agentify)`, req.headers['x-client-id'], { webhookUrl: req.body.webhook_url || null });

    const redactedKey = effectiveApiKey ? `${effectiveApiKey.substring(0, 4)}...${effectiveApiKey.substring(Math.max(4, effectiveApiKey.length - 4))}` : 'none';
    console.log(`[API] Agentify: ${url} (maxPages: ${maxPages}, urls: ${urls ? urls.length : 'auto'}, apiKey: ${redactedKey}, job: ${job.id}) async=${!!req.body.async}`);

    // ─── Async mode: return 202 immediately, process in background ───
    if (req.body.async) {
      res.status(202).json({
        success: true,
        job_id: job.id,
        status: 'running',
        status_url: `/api/jobs/${job.id}`,
        result_url: `/api/jobs/${job.id}/result`,
      });

      const scriptPath = path.join(__dirname, '..', 'scripts', 'agentify.js');
      const env = Object.assign({}, process.env, {
        AGENTIFY_TARGET_URL: url,
        AGENTIFY_MAX_PAGES: maxPages,
        AGENTIFY_INCLUDE_API_SCHEMA: includeApiSchema,
        AGENTIFY_TARGET_AGENT: targetAgent,
        AGENTIFY_ACTIVE_API_KEY: effectiveApiKey || ''
      });

      let urlsTmpFile = null;
      if (urls && Array.isArray(urls) && urls.length > 0) {
        urlsTmpFile = path.join(require('os').tmpdir(), `agentify_preselected_${Date.now()}.txt`);
        fs.writeFileSync(urlsTmpFile, urls.join('\n'));
        env.AGENTIFY_URLS_FILE = urlsTmpFile;
      }

      runAsyncJob({
        jobId: job.id,
        spawnArgs: [scriptPath],
        cwd: path.join(__dirname, '..'),
        env,
        webhookUrl: req.body.webhook_url,
        buildResult: (code, logBuffer) => {
          const siteDir = hostname ? path.join(JOBS_DIR, hostname) : null;
          const succeeded = code === 0;
          return {
            success: succeeded,
            error: succeeded ? null : `Agentify process exited with code ${code}`,
            jobPatch: {
              resultSummary: { hostname, maxPages, selectedUrls: urls || [] },
              resultPath: succeeded ? siteDir : null,
            },
            webhookData: { hostname, url },
          };
        },
      });
      return;
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Job-Id', job.id);

    const scriptPath = path.join(__dirname, '..', 'scripts', 'agentify.js');

    const env = Object.assign({}, process.env, {
      AGENTIFY_TARGET_URL: url,
      AGENTIFY_MAX_PAGES: maxPages,
      AGENTIFY_INCLUDE_API_SCHEMA: includeApiSchema,
      AGENTIFY_TARGET_AGENT: targetAgent,
      AGENTIFY_ACTIVE_API_KEY: effectiveApiKey || ''
    });

    let urlsTmpFile = null;
    if (urls && Array.isArray(urls) && urls.length > 0) {
      urlsTmpFile = path.join(require('os').tmpdir(), `agentify_preselected_${Date.now()}.txt`);
      fs.writeFileSync(urlsTmpFile, urls.join('\n'));
      env.AGENTIFY_URLS_FILE = urlsTmpFile;
    }

    const child = spawnProcess('node', [scriptPath], { cwd: path.join(__dirname, '..'), env });
    let clientDisconnected = false;
    let agentifyLogBuffer = '';
    let finalized = false;

    res.on('close', () => {
      if (!res.writableEnded && child.exitCode === null) {
        clientDisconnected = true;
        console.log(`[API] Client disconnected, agentify continues in background (job: ${job.id}, PID ${child.pid})`);
      }
    });

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      agentifyLogBuffer += text;
      if (!clientDisconnected) res.write(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      agentifyLogBuffer += text;
      if (!clientDisconnected) res.write(text);
    });

    const finalizeJob = (code, spawnError = null) => {
      if (finalized) return;
      finalized = true;
      const succeeded = code === 0 && !spawnError;
      const siteDir = hostname ? path.join(JOBS_DIR, hostname) : null;
      registry.updateJob(job.id, {
        status: succeeded ? 'done' : 'failed',
        completedAt: new Date().toISOString(),
        resultSummary: { hostname, maxPages, selectedUrls: urls || [] },
        resultPath: succeeded ? siteDir : null,
        inlineLog: agentifyLogBuffer.substring(0, 50000),
        error: succeeded ? null : (spawnError?.message || `Agentify process exited with code ${code}`),
      });
      if (!clientDisconnected) res.end();
    };

    child.on('close', (code) => finalizeJob(code));
    child.on('error', (err) => finalizeJob(null, err));
  });
};
