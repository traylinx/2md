const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const jobRegistry = require('../lib/jobRegistry');
const { JOBS_DIR } = require('../lib/config');
const { sendError, ERROR_CODES } = require('../lib/http/errorResponse');

module.exports = function registerAgentifyRoutes(app, { apiLimiter }) {
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
    const job = jobRegistry.createJob('agentify', url, `${hostname || url} (agentify)`, req.headers['x-client-id'], { webhookUrl: req.body.webhook_url || null });

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

      const { runAsyncJob } = require('../lib/jobs/asyncJobRunner');
      runAsyncJob({
        jobId: job.id,
        spawnArgs: [scriptPath],
        cwd: path.join(__dirname, '..'),
        webhookUrl: req.body.webhook_url,
        buildResult: (code, logBuffer) => {
          const siteDir = hostname ? path.join(JOBS_DIR, hostname) : null;
          return {
            success: code === 0,
            jobPatch: {
              resultSummary: { hostname, maxPages, selectedUrls: urls || [] },
              resultPath: siteDir,
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

    const child = spawn('node', [scriptPath], { cwd: path.join(__dirname, '..'), env });
    let clientDisconnected = false;
    let agentifyLogBuffer = '';

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

    child.on('close', () => {
      const siteDir = hostname ? path.join(JOBS_DIR, hostname) : null;
      jobRegistry.updateJob(job.id, {
        status: 'done',
        completedAt: new Date().toISOString(),
        resultSummary: { hostname, maxPages, selectedUrls: urls || [] },
        resultPath: siteDir,
        inlineLog: agentifyLogBuffer.substring(0, 50000)
      });
      if (!clientDisconnected) res.end();
    });
  });
};
