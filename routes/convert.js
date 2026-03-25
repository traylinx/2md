const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const jobRegistry = require('../lib/jobRegistry');
const cacheManager = require('../lib/cacheManager');
const { JOBS_DIR } = require('../lib/config');
const { selectMethod, validateMethod, VALID_METHODS } = require('../lib/pipeline/selectMethod');
const { resolveFormat } = require('../lib/pipeline/resolveFormat');
const { buildHeaders } = require('../lib/pipeline/buildHeaders');
const { sendError, ERROR_CODES } = require('../lib/http/errorResponse');

const BIN_PATH = path.join(__dirname, '..', 'bin', 'html2md');

module.exports = function registerConvertRoutes(app) {
  const convertHandler = async (req, res) => {
    const { url, method: requestedMethod, downloadImages = true, frontMatter = true, screenshot = false, waitMs = 10000, maxImageSizeMb = 10 } = req.body;

    if (!url) {
      return sendError(res, 400, 'Missing url in request body', ERROR_CODES.VALIDATION_ERROR);
    }

    const validatedMethod = validateMethod(requestedMethod);
    if (validatedMethod === null) {
      return sendError(res, 400, `Invalid method "${requestedMethod}". Valid: ${VALID_METHODS.join(', ')}`, ERROR_CODES.VALIDATION_ERROR);
    }

    const format = resolveFormat(req);
    // const { buildHeaders } = require('../lib/pipeline/buildHeaders'); // This line is now redundant due to the import at the top

    const { maxAge, force } = req.query;
    const cached = cacheManager.getCachedPage(url, maxAge, force);

    if (cached) {
      console.log(`[API ${req.id || 'init'}] Cache hit: ${url} (slug: ${cached.slug}) format=${format}`);
      const job = jobRegistry.createJob('convert', url, url, req.headers['x-client-id']);

      const result = {
        success: true,
        url: url,
        markdown: cached.markdown,
        cache: 'hit',
        method: 'local_cache',
        tokens: { html: cached.meta.htmlTokens || 0, md: cached.meta.mdTokens || Math.ceil(cached.markdown.length / 3.7) },
        metadata: {},
        quality: { wordCount: cached.meta.wordCount || 0 }
      };

      try {
        const cachedHost = new URL(url).hostname;
        const diskSlug = cacheManager.getSlug(url);
        const cachedSsPath = path.join(JOBS_DIR, cachedHost, 'pages', diskSlug, 'input', 'screenshot.png');
        if (fs.existsSync(cachedSsPath)) {
          result.screenshotUrl = `/api/screenshot/${cachedHost}/${diskSlug}`;
        }
      } catch(e) { /* noop */ }

      jobRegistry.updateJob(job.id, {
        status: 'done',
        completedAt: new Date().toISOString(),
        resultSummary: { tokens: result.tokens, wordCount: result.quality.wordCount },
        inlineResult: result,
        inlineLog: '[Cache Hit] Served instantly from local storage.'
      });

      const headers = buildHeaders(result, format);
      if (req.id) headers['X-Request-Id'] = req.id;
      headers['X-Job-Id'] = job.id;

      if (format === 'markdown') {
        res.set(headers).send(result.markdown);
      } else if (format === 'json') {
        res.set(headers).json(result);
      } else {
        res.set(headers);
        res.write('[Cache Hit] Served instantly from local storage.\n');
        res.write('\n__JSON__' + JSON.stringify(result));
        res.end();
      }
      return;
    }

    // Phase 2: Try in-process pipeline (native/static) before browser
    if (validatedMethod !== 'browser') {
      try {
        const pipelineResult = await selectMethod(url, validatedMethod);

        if (pipelineResult.ok) {
          const job = jobRegistry.createJob('convert', url, url, req.headers['x-client-id']);
          console.log(`[API ${req.id || 'init'}] Convert via ${pipelineResult.method}: ${url} (job: ${job.id}) format=${format}`);

          const result = {
            success: true,
            url,
            markdown: pipelineResult.markdown,
            cache: pipelineResult.cache || 'miss',
            method: pipelineResult.method,
            tokens: pipelineResult.tokens,
            metadata: pipelineResult.metadata || {},
            quality: pipelineResult.quality || {},
            fallbackReason: pipelineResult.fallbackReason || null,
          };

          cacheManager.writeMeta(url, result, 200, 0);

          jobRegistry.updateJob(job.id, {
            status: 'done',
            completedAt: new Date().toISOString(),
            resultSummary: { tokens: result.tokens, wordCount: result.quality?.wordCount },
            inlineResult: result,
            inlineLog: `[${pipelineResult.method}] Converted in-process without browser.`
          });

          const headers = buildHeaders(result, format);
          if (req.id) headers['X-Request-Id'] = req.id;
          headers['X-Job-Id'] = job.id;

          if (format === 'markdown') {
            res.set(headers).send(result.markdown);
          } else if (format === 'json') {
            res.set(headers).json(result);
          } else {
            res.set(headers);
            res.write(`[${pipelineResult.method}] Converted in-process without browser.\n`);
            res.write('\n__JSON__' + JSON.stringify(result));
            res.end();
          }
          return;
        }

        if (pipelineResult.error && !pipelineResult.useBrowser) {
          // Format stream errors as raw text prefix since client expecting stream
          if (format === 'stream') {
            res.write(`Error: ${pipelineResult.error || pipelineResult.reason}\n`);
            return res.end();
          }
          return sendError(res, pipelineResult.statusCode || 500, pipelineResult.error || pipelineResult.reason, ERROR_CODES.INTERNAL_ERROR, validatedMethod);
        }

        if (pipelineResult.useBrowser) {
          console.log(`[API ${req.id || 'init'}] Pipeline escalation: ${pipelineResult.reason}`);
        }
      } catch (err) {
        console.error(`[API ${req.id || 'init'}] Pipeline error, falling back to browser:`, err.message);
      }
    }

    // Browser path: spawn the existing bin/html2md subprocess
    const hash = crypto.createHash('md5').update(url + Date.now()).digest('hex').substring(0, 8);
    const outDir = path.join(JOBS_DIR, `api_${hash}`);

    let cmdArgs = [`${BIN_PATH}`, url, `-o`, outDir, `-w`, `${waitMs}`, `--max-image-size`, `${maxImageSizeMb}`];
    if (!downloadImages) cmdArgs.push('--no-download-images');
    if (frontMatter) cmdArgs.push('--front-matter');
    if (screenshot) cmdArgs.push('--screenshot');

    const job = jobRegistry.createJob('convert', url, url, req.headers['x-client-id']);

    console.log(`[API ${req.id || 'init'}] Convert via browser: ${url} (job: ${job.id}) format=${format}`);

    if (format === 'stream') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');
      if (req.id) res.setHeader('X-Request-Id', req.id);
      res.setHeader('X-Job-Id', job.id);
    }

    let allOutput = '';
    const child = spawn('node', cmdArgs, { cwd: path.join(__dirname, '..') });

    res.on('close', () => {
      if (!res.writableEnded && child.exitCode === null) {
        console.log(`[API ${req.id || 'init'}] Client disconnected early, killing process PID ${child.pid}`);
        require('tree-kill')(child.pid, 'SIGKILL');
        jobRegistry.updateJob(job.id, { status: 'failed', error: 'Client disconnected' });
      }
    });

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      allOutput += text;
      if (format === 'stream') res.write(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      allOutput += text;
      if (format === 'stream') res.write(text);
    });

    child.on('close', () => {
      const mdPath = path.join(outDir, 'output', 'page.md');
      const jobJsonPath = path.join(outDir, 'job.json');

      if (!fs.existsSync(mdPath)) {
        jobRegistry.updateJob(job.id, { status: 'failed', error: 'Output markdown not found' });
        
        if (format === 'stream') {
          res.write('\n__JSON__' + JSON.stringify({ success: false, error: 'Output markdown not found' }));
          res.end();
        } else {
          sendError(res, 500, 'Output markdown not found', ERROR_CODES.INTERNAL_ERROR);
        }
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

      let screenshotUrl = null;
      if (screenshot) {
        const ssInputPath = path.join(outDir, 'input', 'screenshot.png');
        if (fs.existsSync(ssInputPath)) {
          try {
            const hname = new URL(url).hostname;
            const ssSlug = cacheManager.getSlug(url);
            const permanentSsPath = path.join(JOBS_DIR, hname, 'pages', ssSlug, 'input', 'screenshot.png');
            fs.mkdirSync(path.dirname(permanentSsPath), { recursive: true });
            fs.copyFileSync(ssInputPath, permanentSsPath);
            screenshotUrl = `/api/screenshot/${hname}/${ssSlug}`;
          } catch (e) { console.error('[API] Failed to persist single-page screenshot:', e.message); }
        }
      }

      try { fs.rmSync(outDir, { recursive: true, force: true }); } catch(e) {}

      const result = {
        success: true,
        url: url,
        markdown: markdown,
        cache: 'miss',
        method: 'browser',
        tokens: { html: htmlTokens, md: mdTokens },
        metadata: jobData.metadata || {},
        quality: jobData.quality || {}
      };
      if (screenshotUrl) result.screenshotUrl = screenshotUrl;

      cacheManager.writeMeta(url, result, 200, 0);

      jobRegistry.updateJob(job.id, {
        status: 'done',
        completedAt: new Date().toISOString(),
        resultSummary: { tokens: result.tokens, wordCount: result.quality.wordCount },
        inlineResult: result,
        inlineLog: allOutput.substring(0, 50000)
      });

      const headers = buildHeaders(result, format);
      if (req.id) headers['X-Request-Id'] = req.id;
      headers['X-Job-Id'] = job.id;

      if (format === 'markdown') {
        res.set(headers).send(result.markdown);
      } else if (format === 'json') {
        res.set(headers).json(result);
      } else {
        res.write('\n__JSON__' + JSON.stringify(result));
        res.end();
      }
    });
  };

  app.post('/api/convert', convertHandler);
  app.convertHandler = convertHandler;
};
