const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { JOBS_DIR } = require('./config');

/**
 * Manages the job directory structure and metadata
 */
class Job {
  static urlToSlug(url) {
    try {
      const parsed = new URL(url);
      let slug = parsed.hostname || url;
      slug = slug.replace(/^www\./, '');
      slug = slug.replace(/[^a-z0-9]+/gi, '-');
      slug = slug.replace(/^-|-$/g, '');
      return slug.toLowerCase().substring(0, 50);
    } catch (e) {
      let slug = url.replace(/[^a-z0-9]+/gi, '-');
      slug = slug.replace(/^-|-$/g, '');
      return slug.toLowerCase().substring(0, 50);
    }
  }

  static writeJson(jobDir, data) {
    const pageJsonPath = path.join(jobDir, 'page.json');
    const jobJsonPath = path.join(jobDir, 'job.json');
    const targetPath = fs.existsSync(pageJsonPath) ? pageJsonPath : jobJsonPath;
    
    fs.writeFileSync(
      targetPath,
      JSON.stringify(data, null, 2)
    );
  }

  static readJson(jobDir) {
    const pageJsonPath = path.join(jobDir, 'page.json');
    const jobJsonPath = path.join(jobDir, 'job.json');
    const sourcePath = fs.existsSync(pageJsonPath) ? pageJsonPath : jobJsonPath;
    
    if (!fs.existsSync(sourcePath)) {
      return {};
    }
    return JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  }

  static create(url, baseDir = null) {
    baseDir = baseDir || JOBS_DIR;
    
    const now = new Date();
    const timestamp = now.toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];
    const slug = this.urlToSlug(url);
    const jobId = `${timestamp}_${slug}`;
    const jobDir = path.join(baseDir, jobId);

    fs.mkdirSync(path.join(jobDir, 'input'), { recursive: true });
    fs.mkdirSync(path.join(jobDir, 'processing'), { recursive: true });
    fs.mkdirSync(path.join(jobDir, 'output', 'assets'), { recursive: true });

    const jobData = {
      id: jobId,
      url: url,
      status: 'created',
      createdAt: now.toISOString(),
      steps: {},
      metadata: {}
    };

    this.writeJson(jobDir, jobData);
    return jobDir;
  }

  static createFromFile(filePath, baseDir = null) {
    baseDir = baseDir || JOBS_DIR;
    
    const now = new Date();
    const timestamp = now.toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];
    const basename = path.basename(filePath, path.extname(filePath));
    let slug = basename.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const jobId = `${timestamp}_${slug}`;
    const jobDir = path.join(baseDir, jobId);

    fs.mkdirSync(path.join(jobDir, 'input'), { recursive: true });
    fs.mkdirSync(path.join(jobDir, 'processing'), { recursive: true });
    fs.mkdirSync(path.join(jobDir, 'output', 'assets'), { recursive: true });

    // Copy the local file to input
    const absoluteFilePath = path.resolve(filePath);
    fs.copyFileSync(absoluteFilePath, path.join(jobDir, 'input', 'raw.html'));
    fs.copyFileSync(absoluteFilePath, path.join(jobDir, 'input', 'rendered.html'));

    const jobData = {
      id: jobId,
      url: `file://${absoluteFilePath}`,
      sourceFile: absoluteFilePath,
      status: 'created',
      createdAt: now.toISOString(),
      steps: {},
      metadata: {}
    };

    this.writeJson(jobDir, jobData);
    return jobDir;
  }

  static updateStatus(jobDir, status, stepName = null, stepData = null) {
    const data = this.readJson(jobDir);
    data.status = status;
    data.updatedAt = new Date().toISOString();

    if (stepName && stepData) {
      data.steps = data.steps || {};
      data.steps[stepName] = {
        ...stepData,
        completedAt: new Date().toISOString()
      };
    }

    this.writeJson(jobDir, data);
  }

  static updateMetadata(jobDir, metadata) {
    const data = this.readJson(jobDir);
    data.metadata = { ...(data.metadata || {}), ...metadata };
    this.writeJson(jobDir, data);
  }

  static log(jobDir, message) {
    const logPath = path.join(jobDir, 'processing', 'log.txt');
    const now = new Date();
    const timeString = now.toTimeString().split(' ')[0]; // HH:MM:SS
    fs.appendFileSync(logPath, `[${timeString}] ${message}\n`);
  }

  static urlToPageSlug(urlPath) {
    if (!urlPath || urlPath === '/') return '_root';
    let slug = urlPath.replace(/^\//, '').replace(/\/$/, '');
    slug = slug.replace(/\//g, '--');
    slug = slug.replace(/[^a-z0-9\-]/gi, '-').toLowerCase();
    return slug || '_root';
  }

  static createSiteDir(hostname, baseDir = null) {
    baseDir = baseDir || JOBS_DIR;
    const siteDir = path.join(baseDir, hostname);
    fs.mkdirSync(path.join(siteDir, 'pages'), { recursive: true });

    const siteJsonPath = path.join(siteDir, 'site.json');
    if (!fs.existsSync(siteJsonPath)) {
      fs.writeFileSync(siteJsonPath, JSON.stringify({
        hostname,
        createdAt: new Date().toISOString(),
        lastCrawledAt: null,
        pageCount: 0,
        tree: null
      }, null, 2));
    }
    return siteDir;
  }

  static createPageDir(siteDir, url) {
    const parsed = new URL(url);
    const slug = this.urlToPageSlug(parsed.pathname);
    const pageDir = path.join(siteDir, 'pages', slug);

    fs.mkdirSync(path.join(pageDir, 'input'), { recursive: true });
    fs.mkdirSync(path.join(pageDir, 'processing'), { recursive: true });
    fs.mkdirSync(path.join(pageDir, 'output', 'assets'), { recursive: true });

    const pageJsonPath = path.join(pageDir, 'page.json');
    if (!fs.existsSync(pageJsonPath)) {
      fs.writeFileSync(pageJsonPath, JSON.stringify({
        url,
        slug,
        files: {},
        htmlHash: null,
        lastFetched: null,
        lastConverted: null,
        status: 'created',
        steps: {},
        metadata: {}
      }, null, 2));
    }

    return pageDir;
  }

  static computeHash(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  static getPageHash(pageDir) {
    const pageJsonPath = path.join(pageDir, 'page.json');
    if (!fs.existsSync(pageJsonPath)) return null;
    try {
      const data = JSON.parse(fs.readFileSync(pageJsonPath, 'utf8'));
      return data.htmlHash || null;
    } catch (e) {
      return null;
    }
  }

  static updatePageHash(pageDir, hash) {
    const pageJsonPath = path.join(pageDir, 'page.json');
    let data = {};
    if (fs.existsSync(pageJsonPath)) {
      try { data = JSON.parse(fs.readFileSync(pageJsonPath, 'utf8')); } catch (e) {}
    }
    data.htmlHash = hash;
    data.lastConverted = new Date().toISOString();
    fs.writeFileSync(pageJsonPath, JSON.stringify(data, null, 2));
  }

  static isCached(pageDir, newHash) {
    const storedHash = this.getPageHash(pageDir);
    if (!storedHash || !newHash) return false;
    const mdPath = path.join(pageDir, 'output', 'page.md');
    if (!fs.existsSync(mdPath)) return false;
    return storedHash === newHash;
  }

  static updateSiteJson(siteDir, updates) {
    const siteJsonPath = path.join(siteDir, 'site.json');
    let data = {};
    if (fs.existsSync(siteJsonPath)) {
      try { data = JSON.parse(fs.readFileSync(siteJsonPath, 'utf8')); } catch (e) {}
    }
    Object.assign(data, updates);
    fs.writeFileSync(siteJsonPath, JSON.stringify(data, null, 2));
  }

  static buildPageFiles(pageDir) {
    const files = {};

    const val = (relPath) => fs.existsSync(path.join(pageDir, relPath)) ? relPath : null;

    files.raw = val('input/raw.html');
    files.rendered = val('input/rendered.html');
    files.screenshot = val('input/screenshot.png');
    files.extracted = val('processing/extracted.md');
    files.log = val('processing/log.txt');
    files.markdown = val('output/page.md');

    const assetsDir = path.join(pageDir, 'output', 'assets');
    if (fs.existsSync(assetsDir)) {
      const assetFiles = fs.readdirSync(assetsDir).filter(f => !f.startsWith('.'));
      files.assets = assetFiles.map(f => `output/assets/${f}`);
    } else {
      files.assets = [];
    }

    return files;
  }

  static updatePageFiles(pageDir) {
    const pageJsonPath = path.join(pageDir, 'page.json');
    let data = {};
    if (fs.existsSync(pageJsonPath)) {
      try { data = JSON.parse(fs.readFileSync(pageJsonPath, 'utf8')); } catch (e) {}
    }
    data.files = this.buildPageFiles(pageDir);
    fs.writeFileSync(pageJsonPath, JSON.stringify(data, null, 2));
    return data;
  }

  static rebuildSiteFiles(siteDir) {
    const pagesDir = path.join(siteDir, 'pages');
    if (!fs.existsSync(pagesDir)) return;

    const pages = fs.readdirSync(pagesDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && fs.existsSync(path.join(pagesDir, d.name, 'page.json')));

    const files = pages.map(page => {
      const pageJsonPath = path.join(pagesDir, page.name, 'page.json');
      try {
        const pageData = JSON.parse(fs.readFileSync(pageJsonPath, 'utf8'));
        return pageData;
      } catch (e) {
        return null;
      }
    }).filter(Boolean);

    this.updateSiteJson(siteDir, { files, pageCount: files.length });
  }
}

module.exports = Job;
