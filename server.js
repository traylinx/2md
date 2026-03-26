require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { UPLOADS_DIR } = require('./lib/config');
const { isUploadAllowed, UPLOAD_ALLOWED, BROWSER_ACCEPT_STRING } = require('./lib/formatCapabilities');

const app = express();

app.use(express.json());
app.set('trust proxy', 1);

// ── Rate Limiter ──
const { tieredApiLimiter } = require('./lib/http/rateLimitHeaders');
const apiLimiter = tieredApiLimiter;

// ── CORS ──
const PRODUCTION_ORIGINS = ['https://2md.traylinx.com', 'https://www.2md.traylinx.com'];
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : process.env.NODE_ENV === 'production'
    ? PRODUCTION_ORIGINS
    : ['http://localhost:3000', 'http://localhost:5173'];

// Handle standard CORS for non-API routes (strict)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next(); // Handled separately
  cors({ origin: ALLOWED_ORIGINS })(req, res, next);
});

// Permissive CORS for API routes so developers can use them from any domain
app.use('/api', cors({ origin: '*', methods: ['GET', 'POST', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'x-client-id'] }));

// ── Multer Upload ──
const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (isUploadAllowed(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}. Allowed: ${BROWSER_ACCEPT_STRING}`), false);
    }
  }
});

const PORT = process.env.PORT || 8222;

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    api: 'html2md',
    version: '2.0.0',
    time: new Date().toISOString()
  });
});

app.get('/api/ping', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).json({ error: 'Missing url' });
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(targetUrl, { 
      method: 'GET', 
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' } 
    });
    clearTimeout(timeout);
    
    // Aggressively destroy the incoming HTTP byte stream since we only care if it's a 200
    if (response.body && typeof response.body.cancel === 'function') {
      response.body.cancel().catch(() => {});
    }
    
    if (response.ok) {
      return res.status(200).json({ status: response.status });
    } else {
      return res.status(response.status).json({ error: `HTTP ${response.status}` });
    }
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

app.get('/api/upload-info', (req, res) => {
  res.json({
    extensions: UPLOAD_ALLOWED.map(f => `.${f.ext}`),
    families: [...new Set(UPLOAD_ALLOWED.map(f => f.family))],
    acceptString: BROWSER_ACCEPT_STRING,
    maxFileSizeMb: 100
  });
});

// Dynamically serve llms.txt files with the correct runtime host
const serveDynamicLlms = (req, res, filename) => {
  const filePath = path.join(__dirname, 'public', filename);
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return res.status(500).send('File not found');
    const baseUrl = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}`;
    const dynamicContent = data.replace(/\{\{BASE_URL\}\}/g, baseUrl);
    res.type('text/plain; charset=utf-8').send(dynamicContent);
  });
};

app.get('/llms.txt', (req, res) => serveDynamicLlms(req, res, 'llms.txt'));
app.get('/llms-full.txt', (req, res) => serveDynamicLlms(req, res, 'llms-full.txt'));

app.get('/skills/:skillName.md', (req, res) => {
  const skillName = req.params.skillName;
  if (!/^[a-zA-Z0-9_-]+$/.test(skillName)) {
    return res.status(400).send('Invalid skill name');
  }
  const filePath = path.join(__dirname, '.agents', 'skills', skillName, 'SKILL.md');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return res.status(404).send('Skill not found');
    res.type('text/markdown; charset=utf-8').send(data);
  });
});

// Agent discovery files (served from built frontend dist)
app.get('/.well-known/ai-plugin.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'dist', '.well-known', 'ai-plugin.json'));
});

app.get('/agents.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'dist', 'agents.json'));
});

// ── Global Middleware ──
const { requestIdMiddleware } = require('./lib/http/requestId');
const { backPressureMiddleware } = require('./lib/http/backPressure');
app.use(requestIdMiddleware);
app.use('/api', backPressureMiddleware());

// ── Route Modules ──
const deps = { apiLimiter, upload };

require('./routes/convert')(app);
require('./routes/batch')(app, deps);
require('./routes/crawl')(app, deps);
require('./routes/agentify')(app, deps);
require('./routes/file2md')(app, deps);
require('./routes/download')(app);
require('./routes/jobs')(app);

// ── Crawl URL-Prepend Zero-Friction Route ──
// e.g. GET /crawl/https://docs.example.com?depth=2&email=you@example.com
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (!req.path.startsWith('/crawl/')) return next();

  const targetUrl = req.path.substring('/crawl/'.length);
  if (!/^https?:\/\//i.test(targetUrl)) return next();

  // Rewrite to POST /api/crawl in async mode
  req.method = 'POST';
  req.body = {
    url: targetUrl,
    depth: parseInt(req.query.depth, 10) || 3,
    maxPages: parseInt(req.query.maxPages, 10) || 50,
    treeOnly: false,
    async: true,
    ...(req.query.email ? { email: req.query.email } : {}),
    ...(req.query.webhook_url ? { webhook_url: req.query.webhook_url } : {}),
    ...(req.query.apiKey ? { apiKey: req.query.apiKey } : {}),
  };
  req.url = '/api/crawl';
  return app.handle(req, res);
});

// ── File2MD URL-Prepend Zero-Friction Route ──
// e.g. GET /file2md/https://example.com/document.pdf
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (!req.path.startsWith('/file2md/')) return next();

  const targetUrl = req.path.substring('/file2md/'.length);
  if (!/^https?:\/\//i.test(targetUrl)) return next();

  req.method = 'POST';
  req.body = { 
    url: targetUrl, 
    apiKey: req.query.apiKey, 
    enhance: req.query.enhance, 
    model: req.query.model, 
    format: req.query.format || 'markdown' 
  };
  req.url = '/api/file2md';
  
  if (app.file2mdHandler) {
    return app.file2mdHandler(req, res);
  }
  return res.status(500).json({ error: 'File2md handler not initialized' });
});

// ── URL-Prepend Zero-Friction Route ──
// e.g. GET /https://example.com -> routes to convert with format=markdown
// For file URLs, routes to file2md. Supports extension-less file URLs
// via Content-Type probing (like Firecrawl).
app.use(async (req, res, next) => {
  if (req.method !== 'GET') return next();
  
  // Extract path without leading slash
  const targetUrl = req.path.substring(1);
  
  // Basic validation to see if this resembles an absolute URL.
  // If not, pass it on to the SPA fallback below.
  if (!/^https?:\/\//i.test(targetUrl)) {
    return next();
  }

  const { URL_ALLOWED, getFamily } = require('./lib/formatCapabilities');
  const allowedExts = URL_ALLOWED.map(f => f.ext).join('|');
  const fileMatch = targetUrl.match(new RegExp(`\\.(${allowedExts})(\\?.*)?$`, 'i'));
  let isFileUrl = !!fileMatch;
  let detectedExt = fileMatch ? fileMatch[1].toLowerCase() : null;

  // ── Content-Type probe for extension-less URLs ──
  // URLs like https://arxiv.org/pdf/2406.19314 serve PDFs without a .pdf extension.
  // We do a quick HEAD probe to detect the actual content type.
  const FILE_CONTENT_TYPES = {
    'application/pdf': 'pdf',
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
    'text/csv': 'csv',
    'application/json': 'json',
    'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/mp4': 'm4a',
    'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/octet-stream': null, // needs further inspection — route to file2md
  };

  if (!isFileUrl) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const probe = await fetch(targetUrl, {
        method: 'HEAD',
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' },
        redirect: 'follow',
      });
      clearTimeout(timeout);

      const ct = (probe.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      
      // If it's NOT text/html, check if it's a known file type
      if (ct && !ct.startsWith('text/html') && ct in FILE_CONTENT_TYPES) {
        detectedExt = FILE_CONTENT_TYPES[ct];
        isFileUrl = true;
        console.log(`[URL-Prepend] Content-Type probe: ${ct} → routing to file2md`);
      }
    } catch (e) {
      // Probe failed or timed out — fall through to web converter
    }
  }

  req.method = 'POST';

  if (isFileUrl) {
    const ext = detectedExt;
    const family = ext ? getFamily(ext) : null;
    const isPremium = family && ['image', 'image-partial', 'media'].includes(family);

    if (isPremium && !req.query.apiKey) {
      return res.status(401).json({ success: false, error: `File conversion for ${(ext || 'media').toUpperCase()} media requires an API key. Append ?apiKey=sk-... to your URL.` });
    }

    req.body = { 
      url: targetUrl, 
      apiKey: req.query.apiKey, 
      enhance: req.query.enhance, 
      model: req.query.model, 
      format: req.query.format || 'markdown' 
    };
    req.url = '/api/file2md';
    
    if (app.file2mdHandler) {
      return app.file2mdHandler(req, res);
    }
    return res.status(500).json({ error: 'File2md handler not initialized' });
  }

  // Fake what a JSON POST to /api/convert would look like
  req.body = { url: targetUrl, format: req.query.format || 'markdown' };
  req.url = '/api/convert';
  
  // Call the registered convert handler directly
  if (app.convertHandler) {
    return app.convertHandler(req, res);
  } else {
    // Fallback if not loaded
    return res.status(500).json({ error: 'Convert handler not initialized' });
  }
});

// ── Static / SPA Fallback ──
if (process.env.NODE_ENV !== 'production') {
  app.use(express.static(path.join(__dirname, 'frontend', 'dist')));
  
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(__dirname, 'frontend', 'dist', 'index.html'));
  });
} else {
  // In production, the API server relies on Netlify/Vercel for the frontend.
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api/')) return next();
    
    // Redirect direct browser visits on the API domain to the frontend website
    if (req.path === '/' || req.path === '') {
      return res.redirect('https://2md.traylinx.com');
    }
    
    // Return standard JSON 404 for unhandled API requests
    res.status(404).json({ error: 'Endpoint not found or method not allowed' });
  });
}

// ── Start ──
if (require.main === module) {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`HTML2MD API running on port ${PORT}`);
  });
  // Increase Node's global socket timeout to 20 minutes for long-running video transcriptions
  server.setTimeout(1200000);
  
  // Start the background job expiration sweeper
  require('./lib/jobs/jobSweeper').startJobSweeper();

  // Start proactive memory watchdog (triggers GC when RSS is high between jobs)
  const { startMemoryWatchdog, getMemoryMB } = require('./lib/memoryGC');
  startMemoryWatchdog();
  const mem = getMemoryMB();
  console.log(`  Memory watchdog active (RSS: ${mem.rss}MB, ceiling: ${process.env.RSS_CEILING_MB || 768}MB)`);
}

module.exports = app;
