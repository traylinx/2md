const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { REGISTRY_DIR } = require('./config');

function ensureDir() {
  if (!fs.existsSync(REGISTRY_DIR)) {
    fs.mkdirSync(REGISTRY_DIR, { recursive: true });
  }
}

function generateId() {
  return 'j_' + crypto.randomBytes(6).toString('hex');
}

function jobPath(id) {
  return path.join(REGISTRY_DIR, `${id}.json`);
}

function createJob(type, url, label, clientId = null, { webhookUrl = null, email = null } = {}) {
  ensureDir();
  const { JOB_TTL_HOURS } = require('./config');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + JOB_TTL_HOURS * 60 * 60 * 1000).toISOString();

  const job = {
    id: generateId(),
    type,
    clientId,
    status: 'running',
    url: url || '',
    label: label || url || '',
    createdAt: now.toISOString(),
    completedAt: null,
    expiresAt,
    lastActivity: now.toISOString(),
    resultSummary: null,
    resultPath: null,
    inlineResult: null,
    downloadUrl: null,
    error: null,
    webhookUrl: webhookUrl || null,
    webhookStatus: webhookUrl ? 'pending' : null,
    webhookError: null,
    email: email || null,
    emailStatus: email ? 'pending' : null,
    emailError: null,
  };
  fs.writeFileSync(jobPath(job.id), JSON.stringify(job, null, 2));
  return job;
}

function updateJob(id, patch) {
  const fp = jobPath(id);
  if (!fs.existsSync(fp)) return null;
  try {
    const job = JSON.parse(fs.readFileSync(fp, 'utf8'));
    Object.assign(job, patch, { lastActivity: new Date().toISOString() });
    fs.writeFileSync(fp, JSON.stringify(job, null, 2));
    return job;
  } catch (e) {
    return null;
  }
}

function getJob(id) {
  const fp = jobPath(id);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch (e) {
    return null;
  }
}

function listJobs(clientId = null) {
  ensureDir();
  const files = fs.readdirSync(REGISTRY_DIR).filter(f => f.endsWith('.json'));
  const jobs = [];
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(REGISTRY_DIR, file), 'utf8');
      const job = JSON.parse(raw);
      
      // Filter by clientId if provided
      if (clientId && job.clientId !== clientId) continue;

      // Strip inlineResult from listing (too large) — keep everything else
      const { inlineResult, inlineLog, ...meta } = job;
      meta.hasResult = !!inlineResult || !!job.resultPath;
      jobs.push(meta);
    } catch (e) {
      // Skip corrupt files
    }
  }
  jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return jobs;
}

function getJobResult(id) {
  const job = getJob(id);
  if (!job) return null;

  // If result is stored inline (convert, file2md, crawl discovery)
  if (job.inlineResult) {
    return { type: job.type, result: job.inlineResult, log: job.inlineLog || '' };
  }

  // If result is on disk (batch, agentify)
  if (job.resultPath) {
    return reconstructResultFromDisk(job);
  }

  return null;
}

function reconstructResultFromDisk(job) {
  const basePath = job.resultPath;
  if (!fs.existsSync(basePath)) return null;

  if (job.type === 'agentify') {
    const vfs = {};
    // Read top-level files
    const topFiles = ['SKILL.md', 'llms.txt', 'integration-guide.md', 'validation-report.md'];
    for (const f of topFiles) {
      const fp = path.join(basePath, f);
      if (fs.existsSync(fp)) vfs[f] = fs.readFileSync(fp, 'utf8');
    }
    // Read references/
    const refsDir = path.join(basePath, 'references');
    if (fs.existsSync(refsDir)) {
      for (const f of fs.readdirSync(refsDir)) {
        if (f.endsWith('.md')) {
          vfs[`references/${f}`] = fs.readFileSync(path.join(refsDir, f), 'utf8');
        }
      }
    }
    return { type: 'agentify', result: { success: true, files: vfs }, log: job.inlineLog || '' };
  }

  if (job.type === 'batch') {
    const pagesDir = path.join(basePath, 'pages');
    if (!fs.existsSync(pagesDir)) return null;
    const results = [];
    const { JOBS_DIR } = require('./config');

    // Matches CLI's Job.urlToPageSlug — uses '_root' for root paths
    function toSlug(urlStr) {
      try {
        const p = new URL(urlStr).pathname;
        if (!p || p === '/') return '_root';
        let s = p.replace(/^\//, '').replace(/\/$/, '');
        s = s.replace(/\//g, '--');
        s = s.replace(/[^a-z0-9\-]/gi, '-').toLowerCase();
        return s || '_root';
      } catch(e) { return '_root'; }
    }

    // Build a set of expected {slug, url} pairs from the job's stored URLs
    const expectedSlugMap = new Map(); // slug -> original url
    if (job.jobUrls && Array.isArray(job.jobUrls)) {
      for (const u of job.jobUrls) {
        expectedSlugMap.set(toSlug(u), u);
      }
    }

    const slugs = fs.readdirSync(pagesDir);
    for (const slug of slugs) {
      // If we have jobUrls, only include matching slugs
      if (expectedSlugMap.size > 0 && !expectedSlugMap.has(slug)) continue;

      const mdPath = path.join(pagesDir, slug, 'output', 'page.md');
      const jobJsonPath = path.join(pagesDir, slug, 'job.json');
      let url = expectedSlugMap.get(slug) || slug;
      try {
        const jd = JSON.parse(fs.readFileSync(jobJsonPath, 'utf8'));
        url = jd.url || url;
      } catch (e) {}

      if (fs.existsSync(mdPath)) {
        const markdown = fs.readFileSync(mdPath, 'utf8');
        let hostname = '';
        try { hostname = new URL(url).hostname; } catch(e) {}
        const entry = {
          url,
          success: true,
          markdown,
          htmlTokens: 0,
          mdTokens: Math.ceil(markdown.length / 3.7)
        };
        // Add screenshotUrl if a screenshot exists on disk
        const ssPath = path.join(JOBS_DIR, hostname, 'pages', slug, 'input', 'screenshot.png');
        if (hostname && fs.existsSync(ssPath)) {
          entry.screenshotUrl = `/api/screenshot/${hostname}/${slug}`;
        }
        results.push(entry);
      }
    }
    return { type: 'batch', result: { success: true, results }, log: job.inlineLog || '' };
  }

  return null;
}

function deleteJobsBefore(isoDate, clientId = null) {
  ensureDir();
  const cutoff = new Date(isoDate);
  const files = fs.readdirSync(REGISTRY_DIR).filter(f => f.endsWith('.json'));
  let deleted = 0;
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(REGISTRY_DIR, file), 'utf8');
      const job = JSON.parse(raw);
      
      if (clientId && job.clientId !== clientId) continue;
      
      if (new Date(job.createdAt) <= cutoff) {
        fs.unlinkSync(path.join(REGISTRY_DIR, file));
        deleted++;
      }
    } catch (e) {}
  }
  return deleted;
}

function deleteAllJobs(clientId = null) {
  ensureDir();
  const files = fs.readdirSync(REGISTRY_DIR).filter(f => f.endsWith('.json'));
  let deleted = 0;
  for (const file of files) {
    try {
      if (clientId) {
        const raw = fs.readFileSync(path.join(REGISTRY_DIR, file), 'utf8');
        const job = JSON.parse(raw);
        if (job.clientId !== clientId) continue;
      }
      fs.unlinkSync(path.join(REGISTRY_DIR, file)); 
      deleted++;
    } catch (e) {}
  }
  return deleted;
}

module.exports = {
  createJob,
  updateJob,
  getJob,
  listJobs,
  getJobResult,
  deleteJobsBefore,
  deleteAllJobs
};
