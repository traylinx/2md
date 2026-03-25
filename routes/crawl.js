const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const jobRegistry = require('../lib/jobRegistry');
const { JOBS_DIR } = require('../lib/config');
const { fetchLlmsTxt } = require('../lib/discovery/fetchLlmsTxt');
const { parseLlmsTxt } = require('../lib/discovery/parseLlmsTxt');
const { sendError, ERROR_CODES } = require('../lib/http/errorResponse');
const { tryGC } = require('../lib/memoryGC');

const BIN_PATH = path.join(__dirname, '..', 'bin', 'html2md');

module.exports = function registerCrawlRoutes(app, { apiLimiter }) {
  app.post('/api/crawl', apiLimiter, async (req, res) => {
    const { url, depth = 3, maxPages = 50, treeOnly = false, ignoreRobots = false } = req.body;

    if (!url) {
      return sendError(res, 400, 'Missing url in request body', ERROR_CODES.VALIDATION_ERROR);
    }

    // Phase 4: llms.txt pre-check
    let llmsGuided = false;
    let llmsUrls = [];
    let seedFile = null;

    try {
      console.log(`[API] Checking for llms.txt on ${url}`);
      const llmsResult = await fetchLlmsTxt(url);

      if (llmsResult.found) {
        const parsed = parseLlmsTxt(llmsResult.content, url);
        llmsUrls = parsed.urls.map(u => u.url);
        llmsGuided = llmsUrls.length > 0;

        if (llmsGuided) {
          console.log(`[API] llms.txt found: ${llmsUrls.length} URLs from "${parsed.title || 'untitled'}"`);
          // Write seed URLs to temp file for the crawl script
          seedFile = path.join(require('os').tmpdir(), `html2md_seeds_${Date.now()}.txt`);
          fs.writeFileSync(seedFile, llmsUrls.join('\n'));
        } else {
          console.log(`[API] llms.txt found but no URLs extracted`);
        }
      } else {
        console.log(`[API] No llms.txt: ${llmsResult.reason}`);
      }
    } catch (err) {
      console.log(`[API] llms.txt check failed: ${err.message}`);
    }

    let cmdArgs = [`${BIN_PATH}`, '--crawl', url, '--depth', `${depth}`, '--max-pages', `${maxPages}`];
    if (treeOnly) cmdArgs.push('--tree-only');
    if (seedFile) cmdArgs.push('--seed-urls', seedFile);
    if (ignoreRobots) cmdArgs.push('--ignore-robots');

    const job = treeOnly ? null : jobRegistry.createJob('crawl', url, url, req.headers['x-client-id'], { webhookUrl: req.body.webhook_url || null, email: req.body.email || null });

    console.log(`[API] Crawl: ${url} (depth: ${depth}, max: ${maxPages}, treeOnly: ${treeOnly}, llmsGuided: ${llmsGuided}${job ? `, job: ${job.id}` : ''}) async=${!!req.body.async}`);

    // ─── Async mode: return 202 immediately, process in background ───
    if (req.body.async && !treeOnly && job) {
      res.status(202).json({
        success: true,
        job_id: job.id,
        status: 'running',
        status_url: `/api/jobs/${job.id}`,
        result_url: `/api/jobs/${job.id}/result`,
      });

      const { runAsyncJob } = require('../lib/jobs/asyncJobRunner');
      runAsyncJob({
        jobId: job.id,
        spawnArgs: cmdArgs,
        cwd: path.join(__dirname, '..'),
        webhookUrl: req.body.webhook_url,
        buildResult: (code, logBuffer) => {
          if (seedFile) {
            try { fs.unlinkSync(seedFile); } catch(e) {}
          }
          return {
            success: code === 0,
            jobPatch: {
              resultSummary: { url, depth, maxPages, llmsGuided },
            },
            webhookData: { url, depth, maxPages, llmsGuided, llmsUrlCount: llmsUrls.length },
          };
        },
      });
      return;
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (job) res.setHeader('X-Job-Id', job.id);
    if (req.id) res.setHeader('X-Request-Id', req.id);

    let allOutput = '';
    const child = spawn('node', cmdArgs, { cwd: path.join(__dirname, '..') });

    res.on('close', () => {
      if (!res.writableEnded && child.exitCode === null) {
        console.log(`[API] Client disconnected early, killing process PID ${child.pid}`);
        require('tree-kill')(child.pid, 'SIGKILL');
        if (job) jobRegistry.updateJob(job.id, { status: 'failed', error: 'Client disconnected' });
      }
    });

    let crawlLogBuffer = '';
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      allOutput += text;
      crawlLogBuffer += text;
      res.write(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      allOutput += text;
      crawlLogBuffer += text;
      res.write(text);
    });

    child.on('close', () => {
      // Clean up seed file if created
      if (seedFile) {
        try { fs.unlinkSync(seedFile); } catch(e) {}
      }

      if (treeOnly) {
        const lines = allOutput.trim().split('\n');
        const ansiStrip = s => s.replace(/\x1b\[[0-9;]*m/g, '');
        const treeLines = lines.filter(line => {
          const clean = ansiStrip(line);
          return !clean.includes('Tree generation complete') &&
            !clean.includes('html2md') &&
            !clean.includes('Discovering') &&
            !clean.includes('Discovered') &&
            !clean.startsWith('{"urls"');
        });
        const tree = treeLines.map(l => ansiStrip(l)).join('\n').trim();

        let urls = [];
        for (const line of lines) {
          try {
            const clean = ansiStrip(line).trim();
            if (clean.startsWith('{')) {
              const parsed = JSON.parse(clean);
              if (parsed.urls && Array.isArray(parsed.urls)) {
                urls = parsed.urls;
              } else if (parsed.event === 'discover' && parsed.data && parsed.data.url) {
                urls.push(parsed.data.url);
              }
            }
          } catch(e) {}
        }

        let hostname = '';
        try { hostname = new URL(url).hostname; } catch(e) {}
        const siteJsonPath = hostname ? path.join(JOBS_DIR, hostname, 'site.json') : null;

        const crawlResult = {
          success: true,
          tree,
          urls,
          stats: { depth, maxPages },
          siteJson: siteJsonPath,
          llmsGuided,
          llmsUrlCount: llmsUrls.length,
        };

        if (job) {
          jobRegistry.updateJob(job.id, {
            status: 'done',
            completedAt: new Date().toISOString(),
            resultSummary: { pagesFound: urls.length, depth, llmsGuided },
            inlineResult: crawlResult,
            inlineLog: crawlLogBuffer.substring(0, 50000)
          });
        }

        res.write('\n__JSON__' + JSON.stringify(crawlResult));
      } else {
        if (job) jobRegistry.updateJob(job.id, { status: 'done', completedAt: new Date().toISOString() });
      }

      // Free large buffers and trigger GC
      allOutput = null;
      crawlLogBuffer = null;
      tryGC();

      res.end();
    });
  });
};
