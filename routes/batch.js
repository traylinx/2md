const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const jobRegistry = require('../lib/jobRegistry');
const cacheManager = require('../lib/cacheManager');
const { JOBS_DIR } = require('../lib/config');
const { selectMethod, validateMethod } = require('../lib/pipeline/selectMethod');
const { applyPreset, validatePreset } = require('../lib/pipeline/outputPreset');
const { sendError, ERROR_CODES } = require('../lib/http/errorResponse');
const { tryGC } = require('../lib/memoryGC');

const BIN_PATH = path.join(__dirname, '..', 'bin', 'html2md');

function pageSlug(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const p = parsed.pathname;
    if (!p || p === '/') return '_root';
    let s = p.replace(/^\//, '').replace(/\/$/, '');
    s = s.replace(/\//g, '--');
    s = s.replace(/[^a-z0-9\-]/gi, '-').toLowerCase();
    return s || '_root';
  } catch(e) { return '_root'; }
}

module.exports = function registerBatchRoutes(app, { apiLimiter }) {
  app.post('/api/batch', apiLimiter, async (req, res) => {
    const { urls, method: requestedMethod, preset: requestedPreset, downloadImages = true, frontMatter = true, screenshot = false } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return sendError(res, 400, 'Missing urls array in request body', ERROR_CODES.VALIDATION_ERROR);
    }

    const validatedPreset = validatePreset(requestedPreset);
    if (validatedPreset === null) {
      return sendError(res, 400, `Invalid preset "${requestedPreset}".`, ERROR_CODES.VALIDATION_ERROR);
    }

    const format = require('../lib/pipeline/resolveFormat').resolveFormat(req);
    const { buildHeaders } = require('../lib/pipeline/buildHeaders');

    let hostname = '';
    try { hostname = new URL(urls[0]).hostname; } catch(e) {}
    const siteDir = hostname ? path.join(JOBS_DIR, hostname) : null;

    const { maxAge, force } = req.query;
    const cachedResults = [];
    const uncachedUrls = [];

    for (const u of urls) {
      const cached = cacheManager.getCachedPage(u, maxAge, force);
      if (cached) {
        // If screenshots were requested but this cached page has none, re-fetch it
        let hasCachedScreenshot = false;
        try {
          const cachedHost = new URL(u).hostname;
          const diskSlug = pageSlug(u);
          const cachedSsPath = path.join(JOBS_DIR, cachedHost, 'pages', diskSlug, 'input', 'screenshot.png');
          hasCachedScreenshot = fs.existsSync(cachedSsPath);
        } catch(e) { /* noop */ }

        if (screenshot && !hasCachedScreenshot) {
          // Force re-processing so the screenshot can be taken
          uncachedUrls.push(u);
          continue;
        }

        const cachedResult = {
          url: u,
          success: true,
          markdown: cached.markdown,
          htmlTokens: cached.meta.htmlTokens || 0,
          mdTokens: cached.meta.mdTokens || 0
        };

        if (hasCachedScreenshot) {
          try {
            const cachedHost = new URL(u).hostname;
            const diskSlug = pageSlug(u);
            cachedResult.screenshotUrl = `/api/screenshot/${cachedHost}/${diskSlug}`;
          } catch(e) { /* noop */ }
        }

        cachedResults.push(cachedResult);
      } else {
        uncachedUrls.push(u);
      }
    }

    const job = jobRegistry.createJob('batch', urls[0], `${hostname || 'batch'} (${urls.length} pages)`, req.headers['x-client-id'], { webhookUrl: req.body.webhook_url || null, email: req.body.email || null });

    if (uncachedUrls.length > 0 && hostname) {
      try {
        const { deleteArchive } = require('../lib/storage');
        deleteArchive(hostname).catch(e => console.error(`[API] Failed to delete archive for ${hostname}:`, e));
        const dotted = hostname.replace(/-/g, '.');
        if (dotted !== hostname) {
           deleteArchive(dotted).catch(e => console.error(`[API] Failed to delete archive for ${dotted}:`, e));
        }
      } catch(err) {
        console.error('[API] Error initiating archive deletion:', err);
      }
    }

    console.log(`[API] Batch request: ${urls.length} URLs, ${cachedResults.length} cached, ${uncachedUrls.length} to crawl (job: ${job.id}) format=${format} async=${!!req.body.async}`);

    // ─── Async mode: return 202 immediately, process in background ───
    if (req.body.async) {
      res.status(202).json({
        success: true,
        job_id: job.id,
        status: 'running',
        status_url: `/api/jobs/${job.id}`,
        result_url: `/api/jobs/${job.id}/result`,
      });

      // Continue processing in background (don't return — fall through to the processing logic)
      // Override format to json to collect results properly
      const bgFormat = 'json';
      const { runAsyncJob } = require('../lib/jobs/asyncJobRunner');

      // If all cached, finalize immediately
      if (uncachedUrls.length === 0) {
        let allResults = cachedResults;
        allResults = allResults.map(r => {
          if (!r.success || !r.markdown) return r;
          const presetResult = applyPreset(r.markdown, validatedPreset);
          if (presetResult.ok) {
            if (validatedPreset === 'chunks') return { ...r, markdown: undefined, chunks: presetResult.chunks };
            return { ...r, markdown: presetResult.markdown };
          }
          return r;
        });

        jobRegistry.updateJob(job.id, {
          status: 'done',
          completedAt: new Date().toISOString(),
          resultSummary: { total: urls.length, success: allResults.filter(r => r.success).length },
          resultPath: siteDir,
          jobUrls: urls,
          inlineLog: `[Cache Hit] All ${urls.length} pages served from cache (async).`
        });

        if (req.body.webhook_url) {
          const { deliverWebhook } = require('../lib/jobs/webhookDelivery');
          const secret = process.env.WEBHOOK_SECRET || null;
          const delivery = await deliverWebhook(req.body.webhook_url, {
            job_id: job.id, status: 'done', type: 'batch', results: allResults,
          }, { secret, jobId: job.id });
          jobRegistry.updateJob(job.id, { webhookStatus: delivery.delivered ? 'delivered' : 'failed', webhookError: delivery.error || null });
        }

        if (req.body.email) {
          const { publishJobNotification } = require('../lib/jobs/snsNotify');
          const { generateDownloadToken } = require('../lib/jobs/downloadToken');
          const { token } = generateDownloadToken(job.id);
          const downloadUrl = `/api/download/job/${job.id}?token=${token}`;
          jobRegistry.updateJob(job.id, { downloadUrl });

          const baseUrl = process.env.PRODUCTION_API_URL || 'https://2md.traylinx.com';
          const absoluteDownloadUrl = `${baseUrl}${downloadUrl}`;
          
          const notifyResult = await publishJobNotification({
            jobId: job.id,
            email: req.body.email,
            url: urls[0] || 'Batch Crawl',
            downloadUrl: absoluteDownloadUrl,
            pageCount: urls.length,
          });

          jobRegistry.updateJob(job.id, {
            emailStatus: notifyResult.published ? 'sent' : 'failed',
            emailError: notifyResult.error || null,
          });
        }
        
        return;
      }

      // Spawn browser subprocess for remaining URLs in background
      const tmpFile = path.join(require('os').tmpdir(), `html2md_batch_${Date.now()}.txt`);
      fs.writeFileSync(tmpFile, uncachedUrls.join('\n'));
      let cmdArgs = [`${BIN_PATH}`, '--batch', tmpFile];
      if (!req.body.downloadImages) cmdArgs.push('--no-images');
      if (req.body.frontMatter) cmdArgs.push('--front-matter');
      if (req.body.screenshot) cmdArgs.push('--screenshot');

      runAsyncJob({
        jobId: job.id,
        spawnArgs: cmdArgs,
        cwd: path.join(__dirname, '..'),
        webhookUrl: req.body.webhook_url,
        buildResult: (code, logBuffer) => {
          try { fs.unlinkSync(tmpFile); } catch(e) {}

          const freshResults = uncachedUrls.map(u => {
            const slug = cacheManager.getSlug(u);
            const parsed = new URL(u);
            const hname = parsed.hostname;
            const mdPath = path.join(JOBS_DIR, hname, 'pages', slug, 'output', 'page.md');
            if (fs.existsSync(mdPath)) {
              const markdown = fs.readFileSync(mdPath, 'utf8');
              const result = { url: u, success: true, markdown, htmlTokens: 0, mdTokens: Math.ceil(markdown.length / 3.7) };
              cacheManager.writeMeta(u, result, 200, 0);
              return result;
            }
            return { url: u, success: false };
          });

          let allResults = [...cachedResults, ...freshResults];
          allResults = allResults.map(r => {
            if (!r.success || !r.markdown) return r;
            const presetResult = applyPreset(r.markdown, validatedPreset);
            if (presetResult.ok) {
              if (validatedPreset === 'chunks') return { ...r, markdown: undefined, chunks: presetResult.chunks };
              return { ...r, markdown: presetResult.markdown };
            }
            return r;
          });

          const successCount = allResults.filter(r => r.success).length;
          return {
            success: successCount > 0,
            jobPatch: {
              resultSummary: { total: allResults.length, success: successCount },
              resultPath: siteDir,
              jobUrls: urls,
            },
            webhookData: { results: allResults },
          };
        },
      });
      return;
    }

    // ─── Try in-process pipeline for uncached URLs when format is json ───
    if (format === 'json' && uncachedUrls.length > 0) {
      const validatedMethod = validateMethod(requestedMethod);
      if (validatedMethod && validatedMethod !== 'browser') {
        const pipelineResults = [];
        const remainingUrls = [];

        for (const u of uncachedUrls) {
          try {
            const pipelineResult = await selectMethod(u, validatedMethod);
            if (pipelineResult.ok) {
              const result = {
                url: u,
                success: true,
                markdown: pipelineResult.markdown,
                method: pipelineResult.method,
                htmlTokens: pipelineResult.tokens?.html || 0,
                mdTokens: pipelineResult.tokens?.md || 0,
              };
              cacheManager.writeMeta(u, { ...result, tokens: pipelineResult.tokens, cache: 'miss' }, 200, 0);
              pipelineResults.push(result);
            } else if (pipelineResult.useBrowser) {
              remainingUrls.push(u);
            } else {
              pipelineResults.push({ url: u, success: false, error: pipelineResult.error || pipelineResult.reason });
            }
          } catch (err) {
            remainingUrls.push(u);
          }
        }

        // If all URLs resolved in-process, return immediately
        if (remainingUrls.length === 0) {
          let allResults = [...cachedResults, ...pipelineResults];

          // Apply preset to all results
          allResults = allResults.map(r => {
            if (!r.success || !r.markdown) return r;
            const presetResult = applyPreset(r.markdown, validatedPreset);
            if (presetResult.ok) {
              if (validatedPreset === 'chunks') {
                return { ...r, markdown: undefined, chunks: presetResult.chunks };
              }
              return { ...r, markdown: presetResult.markdown };
            }
            return r;
          });

          jobRegistry.updateJob(job.id, {
            status: 'done',
            completedAt: new Date().toISOString(),
            resultSummary: { total: allResults.length, success: allResults.filter(r => r.success).length },
            resultPath: siteDir,
            jobUrls: urls,
            inlineLog: `[Pipeline] All ${urls.length} URLs resolved in-process.`
          });

          const payload = { success: true, results: allResults };
          const headers = buildHeaders({ method: 'static', cache: 'miss', tokens: { md: 0, html: 0 } }, format);
          if (req.id) headers['X-Request-Id'] = req.id;
          headers['X-Job-Id'] = job.id;

          return res.set(headers).json(payload);
        }

        // Some URLs remaining — fall through to browser subprocess with reduced list
        uncachedUrls.length = 0;
        uncachedUrls.push(...remainingUrls);
        cachedResults.push(...pipelineResults);
      }
    }

    // ─── Stream path (default) or browser fallback for remaining URLs ───
    if (format === 'stream') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Job-Id', job.id);
      if (req.id) res.setHeader('X-Request-Id', req.id);
    }

    if (cachedResults.length > 0 && format === 'stream') {
      res.write(`[Cache] Using ${cachedResults.length} previously cached pages.\n`);
    }

    if (uncachedUrls.length === 0) {
      console.log(`[API] Batch fully resolved, returning immediately (job: ${job.id})`);
      let allResults = cachedResults;

      // Apply preset
      allResults = allResults.map(r => {
        if (!r.success || !r.markdown) return r;
        const presetResult = applyPreset(r.markdown, validatedPreset);
        if (presetResult.ok) {
          if (validatedPreset === 'chunks') {
            return { ...r, markdown: undefined, chunks: presetResult.chunks };
          }
          return { ...r, markdown: presetResult.markdown };
        }
        return r;
      });

      jobRegistry.updateJob(job.id, {
        status: 'done',
        completedAt: new Date().toISOString(),
        resultSummary: { total: urls.length, success: allResults.filter(r => r.success).length },
        resultPath: siteDir,
        jobUrls: urls,
        inlineLog: `[Cache Hit] All ${urls.length} pages served instantly from local storage.`
      });

      const payload = { success: true, results: allResults };
      if (format === 'json') {
        const headers = buildHeaders({ method: 'local_cache', cache: 'hit', tokens: { md: 0, html: 0 } }, format);
        if (req.id) headers['X-Request-Id'] = req.id;
        headers['X-Job-Id'] = job.id;
        return res.set(headers).json(payload);
      }
      res.write('\n__JSON__' + JSON.stringify(payload));
      return res.end();
    }

    // Spawn browser subprocess for remaining URLs
    const tmpFile = path.join(require('os').tmpdir(), `html2md_batch_${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, uncachedUrls.join('\n'));

    let cmdArgs = [`${BIN_PATH}`, '--batch', tmpFile];
    if (!downloadImages) cmdArgs.push('--no-images');
    if (frontMatter) cmdArgs.push('--front-matter');
    if (screenshot) cmdArgs.push('--screenshot');

    const child = spawn('node', cmdArgs, { cwd: path.join(__dirname, '..') });
    let logBuffer = '';
    let clientDisconnected = false;

    res.on('close', () => {
      if (!res.writableEnded && child.exitCode === null) {
        clientDisconnected = true;
        console.log(`[API] Client disconnected, batch continues in background (job: ${job.id}, PID ${child.pid})`);
      }
    });

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      logBuffer += text;
      if (!clientDisconnected && format === 'stream') res.write(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      logBuffer += text;
      if (!clientDisconnected && format === 'stream') res.write(text);
    });

    child.on('close', () => {
      try { fs.unlinkSync(tmpFile); } catch(e) {}

      const freshResults = uncachedUrls.map(url => {
        let result = { url, success: false };

        const slug = cacheManager.getSlug(url);
        const parsed = new URL(url);
        const hname = parsed.hostname;
        const mdPath = path.join(JOBS_DIR, hname, 'pages', slug, 'output', 'page.md');
        const htmlPath = path.join(JOBS_DIR, hname, 'pages', slug, 'input', 'rendered.html');

        if (fs.existsSync(mdPath)) {
          const markdown = fs.readFileSync(mdPath, 'utf8');
          let htmlTokens = 0;
          if (fs.existsSync(htmlPath)) {
            const html = fs.readFileSync(htmlPath, 'utf8');
            htmlTokens = Math.ceil(html.length / 3.7);
          }

          result = { url, success: true, markdown, htmlTokens, mdTokens: Math.ceil(markdown.length / 3.7) };

          const ssSlug = pageSlug(url);
          const ssPath = path.join(JOBS_DIR, hname, 'pages', ssSlug, 'input', 'screenshot.png');
          if (fs.existsSync(ssPath)) {
            result.screenshotUrl = `/api/screenshot/${hname}/${ssSlug}`;
          }

          cacheManager.writeMeta(url, result, 200, 0);
        } else {
          const resultJsonPath = path.join(JOBS_DIR, hname, 'pages', cacheManager.getSlug(url), 'output', 'result.json');
          if (fs.existsSync(resultJsonPath)) {
            try {
              const resultData = JSON.parse(fs.readFileSync(resultJsonPath, 'utf8'));
              if (resultData.error) {
                result.error = resultData.error;
              }
            } catch(e) {}
          }
        }
        return result;
      });

      let allResults = [...cachedResults, ...freshResults];

      // Apply preset
      allResults = allResults.map(r => {
        if (!r.success || !r.markdown) return r;
        const presetResult = applyPreset(r.markdown, validatedPreset);
        if (presetResult.ok) {
          if (validatedPreset === 'chunks') {
            return { ...r, markdown: undefined, chunks: presetResult.chunks };
          }
          return { ...r, markdown: presetResult.markdown };
        }
        return r;
      });

      const successCount = allResults.filter(r => r.success).length;

      jobRegistry.updateJob(job.id, {
        status: 'done',
        completedAt: new Date().toISOString(),
        resultSummary: { total: allResults.length, success: successCount },
        resultPath: siteDir,
        jobUrls: urls,
        inlineLog: logBuffer.substring(0, 50000)
      });

      // Free large buffers and trigger GC to reclaim memory between jobs
      logBuffer = null;
      tryGC();

      const payload = { success: true, results: allResults };

      if (!clientDisconnected) {
        if (format === 'json') {
          const headers = buildHeaders({ method: 'browser', cache: 'miss', tokens: { md: 0, html: 0 } }, format);
          if (req.id) headers['X-Request-Id'] = req.id;
          headers['X-Job-Id'] = job.id;
          res.set(headers).json(payload);
        } else {
          res.write('\n__JSON__' + JSON.stringify(payload));
          res.end();
        }
      }
    });
  });
};
