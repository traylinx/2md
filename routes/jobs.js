const path = require('path');
const fs = require('fs');
const jobRegistry = require('../lib/jobRegistry');
const cacheManager = require('../lib/cacheManager');
const { JOBS_DIR } = require('../lib/config');
const { connection: redisConnection, getLogBuffer } = require('../lib/queue');

module.exports = function registerJobsRoutes(app) {
  // ── CACHE CONTROL API ──
  app.get('/api/cache/stats', (req, res) => {
    try {
      const jobDirs = fs.existsSync(JOBS_DIR) ? fs.readdirSync(JOBS_DIR) : [];
      let totalPages = 0;
      const sites = [];

      for (const host of jobDirs) {
        const pagesDir = path.join(JOBS_DIR, host, 'pages');
        if (fs.existsSync(pagesDir)) {
          const pages = fs.readdirSync(pagesDir).length;
          totalPages += pages;
          sites.push({ hostname: host, cachedPages: pages });
        }
      }

      res.json({
        status: 'ok',
        totalCachedPages: totalPages,
        cachedSites: sites.length,
        sites: sites.sort((a,b) => b.cachedPages - a.cachedPages)
      });
    } catch (e) {
      res.status(500).json({ error: 'Failed to read cache stats' });
    }
  });

  app.delete('/api/cache/:hostname', (req, res) => {
    const purged = cacheManager.purgeHost(req.params.hostname);
    if (purged) {
      res.json({ status: 'ok', message: `Purged all cached pages for ${req.params.hostname}` });
    } else {
      res.status(404).json({ error: `No cache found for ${req.params.hostname}` });
    }
  });

  // ── JOB HISTORY API ──
  app.get('/api/jobs', (req, res) => {
    const jobs = jobRegistry.listJobs(req.headers['x-client-id']);
    res.json({ jobs });
  });

  app.get('/api/jobs/:id', (req, res) => {
    const job = jobRegistry.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const privateTypes = ['file2md', 'convert'];
    if (privateTypes.includes(job.type) && job.clientId && job.clientId !== req.headers['x-client-id']) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const { inlineResult, ...meta } = job;
    meta.hasResult = !!inlineResult || !!job.resultPath;
    res.json(meta);
  });

  app.get('/api/jobs/:id/result', (req, res) => {
    const job = jobRegistry.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job result not found or expired' });

    const privateTypes = ['file2md', 'convert'];
    if (privateTypes.includes(job.type) && job.clientId && job.clientId !== req.headers['x-client-id']) {
      return res.status(404).json({ error: 'Job result not found or expired' });
    }

    const result = jobRegistry.getJobResult(req.params.id);
    if (!result) return res.status(404).json({ error: 'Job result not found or expired' });
    res.json(result);
  });

  app.delete('/api/jobs', (req, res) => {
    const { before } = req.query;
    const clientId = req.headers['x-client-id'];
    let deleted = 0;
    if (before) {
      deleted = jobRegistry.deleteJobsBefore(before, clientId);
    } else {
      deleted = jobRegistry.deleteAllJobs(clientId);
    }
    res.json({ deleted });
  });

  // ── REAL-TIME LOG STREAMING (SSE) ──
  app.get('/api/jobs/:id/logs', async (req, res) => {
    const jobId = req.params.id;
    const job = jobRegistry.getJob(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    if (job.status === 'done' || job.status === 'failed') {
      const buffer = await getLogBuffer(jobId);
      res.type('text/plain').send(buffer || job.inlineLog || '');
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const existingBuffer = await getLogBuffer(jobId);
    if (existingBuffer) {
      res.write(`data: ${JSON.stringify({ type: 'log', text: existingBuffer })}\n\n`);
    }

    const subscriber = redisConnection.duplicate();
    const channel = `job:logs:${jobId}`;
    await subscriber.subscribe(channel);

    subscriber.on('message', (ch, message) => {
      if (ch === channel) {
        res.write(`data: ${JSON.stringify({ type: 'log', text: message })}\n\n`);
      }
    });

    const completionCheck = setInterval(() => {
      const current = jobRegistry.getJob(jobId);
      if (current && (current.status === 'done' || current.status === 'failed')) {
        res.write(`data: ${JSON.stringify({ type: 'status', status: current.status })}\n\n`);
        clearInterval(completionCheck);
        subscriber.unsubscribe(channel);
        subscriber.quit();
        res.end();
      }
    }, 2000);

    req.on('close', () => {
      clearInterval(completionCheck);
      subscriber.unsubscribe(channel);
      subscriber.quit();
    });
  });

  // ── SECURE JOB DOWNLOAD API ──
  app.get('/api/download/job/:id', async (req, res) => {
    const jobId = req.params.id;
    const token = req.query.token;
    
    if (!token) {
      return res.status(401).json({ error: 'Missing download token' });
    }

    const { verifyDownloadToken } = require('../lib/jobs/downloadToken');
    const verification = verifyDownloadToken(jobId, token);
    
    if (!verification.valid) {
      return res.status(403).json({ error: 'Invalid or expired download token', details: verification.reason });
    }
    
    const job = jobRegistry.getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found or has been deleted' });
    }

    if (!job.resultPath && !job.inlineResult) {
      return res.status(404).json({ error: 'Job has no download payload available' });
    }

    const archiver = require('archiver');
    const archive = archiver('zip', { zlib: { level: 6 } });
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="job_${jobId}_results.zip"`);
    
    archive.on('error', (err) => {
      console.error(`[API] Error zipping job ${jobId}:`, err);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to create zip archive' });
    });
    
    archive.pipe(res);
    
    if (job.resultPath && fs.existsSync(job.resultPath)) {
      // Zip the entire result directory
      archive.directory(job.resultPath, `job_${jobId}`);
    } else if (job.inlineResult) {
      // Zip the inline result JSON
      archive.append(JSON.stringify(job.inlineResult, null, 2), { name: `job_${jobId}/result.json` });
    }
    
    // Also include the job manifest
    archive.append(JSON.stringify(job, null, 2), { name: `job_${jobId}/manifest.json` });
    
    archive.finalize();
  });
};
