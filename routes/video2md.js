/**
 * POST /api/video2md — video URL → transcript markdown (yt-dlp captions).
 *
 * Mirrors routes/file2md.js's json/heartbeat/job machinery byte-for-byte (incl.
 * the 2026-06-13 proxy-idle-cut fix: X-Job-Id before the padding write, 5s
 * heartbeat, "let json finish on disconnect for job-poll recovery") so the
 * bridge's existing extract2md poll code works against it unchanged. Differs from
 * file2md in three ways the lope review demanded:
 *   - JSON body, no multipart (no file bytes).
 *   - apiKey REQUIRED from day one + per-route rate limit + a concurrency cap
 *     (yt-dlp forks are not resource-free; a burst can OOM the container).
 *   - SSRF guard before any work (app-layer; egress is the real boundary).
 */
const path = require('path');
const { spawn } = require('child_process');
const jobRegistry = require('../lib/jobRegistry');
const { sendError, ERROR_CODES } = require('../lib/http/errorResponse');
const { resolveFormat } = require('../lib/pipeline/resolveFormat');
const { buildHeaders } = require('../lib/pipeline/buildHeaders');
const { validateVideoUrl, parseAllowedHosts } = require('../lib/video/ssrfGuard');
const { tryAcquire, release, maxConcurrency } = require('../lib/video/concurrency');

module.exports = function registerVideo2mdRoutes(app, deps = {}) {
  const apiLimiter = deps.apiLimiter || ((req, res, next) => next());

  const video2mdHandler = async (req, res) => {
    const { url, apiKey, lang, translateTo } = req.body || {};

    if (!url) {
      return sendError(res, 400, 'Missing url in request', ERROR_CODES.VALIDATION_ERROR);
    }
    // Auth required from day one — captions are NOT resource-free (yt-dlp forks).
    if (!apiKey) {
      return sendError(res, 401, 'video2md requires an API key in the request body.', ERROR_CODES.UNAUTHORIZED);
    }

    // SSRF (app-layer defense-in-depth; droplet egress is the authoritative boundary).
    const allowedHosts = parseAllowedHosts(process.env.VIDEO2MD_HOSTS);
    const verdict = await validateVideoUrl(url, allowedHosts);
    if (!verdict.ok) {
      return sendError(res, 400, `URL rejected (${verdict.reason}). Allowed video hosts: ${allowedHosts.join(', ')}.`, ERROR_CODES.VALIDATION_ERROR);
    }

    // Concurrency cap — reject past the limit rather than queue held connections.
    if (!tryAcquire()) {
      res.setHeader('Retry-After', '15');
      return sendError(res, 429, `video2md busy (max ${maxConcurrency()} concurrent). Retry shortly.`, ERROR_CODES.RATE_LIMITED);
    }

    let released = false;
    const releaseOnce = () => { if (!released) { released = true; release(); } };

    const format = resolveFormat(req);
    const job = jobRegistry.createJob('video2md', verdict.url, verdict.url, req.headers['x-client-id']);
    console.log(`[API] Video2MD: ${verdict.url} (lang: ${lang || 'auto'}, job: ${job.id}) format=${format}`);

    let heartbeatInterval = null;
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      // X-Job-Id MUST be set before the padding write (res.write flushes headers).
      res.setHeader('X-Job-Id', job.id);
      if (req.id) res.setHeader('X-Request-Id', req.id);
      res.write(' '.repeat(1024)); // proxy keep-alive padding
      heartbeatInterval = setInterval(() => {
        if (!res.writableEnded && !res.destroyed) res.write(' ');
      }, 5000);
    } else if (format === 'stream') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('X-Job-Id', job.id);
      if (req.id) res.setHeader('X-Request-Id', req.id);
      res.flushHeaders();
    }

    const scriptPath = path.join(__dirname, '..', 'scripts', 'video2md.js');
    const env = Object.assign({}, process.env, {
      VIDEO2MD_URL: verdict.url,
      VIDEO2MD_LANG: lang || '',
      VIDEO2MD_TRANSLATE_TO: translateTo || '',
    });
    const child = spawn('node', [scriptPath], { cwd: path.join(__dirname, '..'), env });
    let allOutput = '';

    res.on('close', () => {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (res.writableEnded || child.exitCode !== null) return;
      // json is recoverable via the job registry + X-Job-Id poll → let the child
      // finish (same rule as file2md's proxy-idle-cut fix). stream/markdown have
      // no async handle → abandon promptly.
      if (format === 'json') {
        console.log(`[API] Client disconnected (video job ${job.id}) — letting conversion finish for job-poll recovery.`);
        return;
      }
      console.log(`[API] Client disconnected early, killing video2md PID ${child.pid}`);
      try { require('tree-kill')(child.pid, 'SIGKILL'); } catch (e) { /* noop */ }
      jobRegistry.updateJob(job.id, { status: 'failed', error: 'Client disconnected' });
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
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      releaseOnce();
      const clientGone = res.writableEnded || res.destroyed;
      const jsonIdx = allOutput.indexOf('__JSON__');
      let result = null;
      if (jsonIdx !== -1) {
        try {
          const afterMarker = allOutput.substring(jsonIdx + 8);
          const firstNewline = afterMarker.indexOf('\n');
          const jsonStr = (firstNewline === -1 ? afterMarker : afterMarker.substring(0, firstNewline)).trim();
          result = JSON.parse(jsonStr);
        } catch (e) { /* parse failed → handled below */ }
      }

      if (result && result.success) {
        jobRegistry.updateJob(job.id, {
          status: 'done',
          completedAt: new Date().toISOString(),
          resultSummary: { source: verdict.url },
          inlineResult: result,
          inlineLog: allOutput.substring(0, 50000),
        });
      } else {
        jobRegistry.updateJob(job.id, {
          status: 'failed',
          error: (result && result.error) || 'No result returned',
          // Surface the typed terminal so the job record carries it for the bridge.
          ...(result && result.needsTranscription ? { needsTranscription: true } : {}),
        });
      }

      if (clientGone) return; // result is parked for the poll — never write a dead socket

      if (format === 'json') {
        const responseData = result || { success: false, error: 'No result returned' };
        const headers = buildHeaders({ method: 'video2md', cache: 'miss', tokens: { md: 0, html: 0 }, url: verdict.url }, format);
        if (req.id) headers['X-Request-Id'] = req.id;
        headers['X-Job-Id'] = job.id;
        if (!res.headersSent) res.set(headers).json(responseData);
        else { res.write(JSON.stringify(responseData)); res.end(); }
      } else if (format === 'markdown') {
        if (!result || !result.success) {
          return sendError(res, result && result.needsTranscription ? 422 : 500, (result && result.error) || 'Video conversion failed', result && result.needsTranscription ? 'NO_CAPTIONS' : 'INTERNAL_ERROR');
        }
        const md = (result.files && result.files['full_document.md']) || '';
        const headers = buildHeaders({ method: 'video2md', cache: 'miss', tokens: { md: Math.ceil(md.length / 3.7), html: 0 }, url: verdict.url }, format);
        if (req.id) headers['X-Request-Id'] = req.id;
        headers['X-Job-Id'] = job.id;
        res.set(headers).send(md);
      } else {
        res.end();
      }
    });

    child.on('error', (err) => {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      releaseOnce();
      jobRegistry.updateJob(job.id, { status: 'failed', error: `spawn failed: ${err.message}` });
      if (!res.writableEnded && !res.destroyed) {
        if (!res.headersSent) sendError(res, 500, 'Failed to start video conversion', 'INTERNAL_ERROR');
        else res.end();
      }
    });
  };

  app.post('/api/video2md', apiLimiter, video2mdHandler);
  app.video2mdHandler = video2mdHandler;
};
