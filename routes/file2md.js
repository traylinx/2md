const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const multer = require('multer');
const jobRegistry = require('../lib/jobRegistry');
const { sendError, ERROR_CODES } = require('../lib/http/errorResponse');

module.exports = function registerFile2mdRoutes(app, { upload }) {
  const file2mdHandler = (req, res) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError || err.message.includes('Unsupported file type')) {
          return sendError(res, 400, err.message, ERROR_CODES.VALIDATION_ERROR);
        }
        return sendError(res, 500, 'Internal server error during upload.', ERROR_CODES.INTERNAL_ERROR);
      }

      const { url, apiKey, enhance, model } = req.body || {};
      const file = req.file;

      if (!url && !file) {
        return sendError(res, 400, 'Missing file or url in request', ERROR_CODES.VALIDATION_ERROR);
      }

      let finalApiKey = apiKey;
      let forceEnhanceFalse = false;

      if (!apiKey) {
        let ext = '';
        if (req.body.declaredExt) {
          ext = req.body.declaredExt.toLowerCase();
        } else {
          const extSource = file ? file.originalname : url;
          const extMatch = extSource ? extSource.match(/\.([^.]+)$/) : null;
          ext = extMatch ? extMatch[1].toLowerCase() : '';
        }
        
        const { getFamily } = require('../lib/formatCapabilities');
        const family = getFamily(ext);
        const isPremium = ['image', 'image-partial', 'media'].includes(family);

        if (isPremium || !family) {
          if (file) {
            try { fs.unlinkSync(file.path); } catch(e) {}
          }
          return sendError(res, 401, `File extraction for ${ext ? ext.toUpperCase() : 'this'} format requires an API key in the request body.`, ERROR_CODES.UNAUTHORIZED);
        }

        finalApiKey = process.env.SYSTEM_FILE_ENGINE_KEY;
        if (!finalApiKey) {
          if (file) try { fs.unlinkSync(file.path); } catch(e) {}
          return sendError(res, 500, 'System file engine key is not configured for free documents.', ERROR_CODES.INTERNAL_ERROR);
        }
        forceEnhanceFalse = true;
      }

      const format = require('../lib/pipeline/resolveFormat').resolveFormat(req);
      const { buildHeaders } = require('../lib/pipeline/buildHeaders');

      const sourceLabel = file ? file.originalname : url;
      const job = jobRegistry.createJob('file2md', url || file.originalname, sourceLabel, req.headers['x-client-id']);

      const redactedKey = finalApiKey ? `${finalApiKey.substring(0, 4)}...${finalApiKey.substring(Math.max(4, finalApiKey.length - 4))}` : 'none';
      console.log(`[API] File2MD: ${sourceLabel} (apiKey: ${redactedKey}, enhance: ${enhance !== 'false'}, job: ${job.id}) format=${format}`);

      if (format === 'stream') {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Accel-Buffering', 'no'); // Prevent NGINX buffering
        res.setHeader('Cache-Control', 'no-cache, no-transform'); // Prevent general proxy buffering
        res.setHeader('X-Job-Id', job.id);
        if (req.id) res.setHeader('X-Request-Id', req.id);
        res.flushHeaders();
      }

      // Start heartbeat to prevent Cloudflare / Load Balancer idle timeouts
      let heartbeatInterval = null;
      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.write(' '.repeat(1024)); // Send initial padding for Some proxies
        heartbeatInterval = setInterval(() => {
          if (!res.writableEnded) {
            res.write(' ');
          }
        }, 15000);
      }

      const scriptPath = path.join(__dirname, '..', 'scripts', 'file2md.js');

      const envVars = {
        FILE2MD_FILE_PATH: file ? file.path : '',
        FILE2MD_ORIGINAL_NAME: file ? file.originalname : '',
        FILE2MD_FILE_URL: url || '',
        FILE2MD_API_KEY: finalApiKey,
        FILE2MD_ENHANCE: forceEnhanceFalse ? 'false' : (enhance !== 'false' ? 'true' : 'false')
      };

      if (model) {
        envVars.FILE2MD_ENHANCE_MODEL = model;
      } else if (process.env.FILE2MD_ENHANCE_MODEL) {
        envVars.FILE2MD_ENHANCE_MODEL = process.env.FILE2MD_ENHANCE_MODEL;
        console.log(`[API] Using global override enhance model: ${process.env.FILE2MD_ENHANCE_MODEL}`);
      }

      const env = Object.assign({}, process.env, envVars);
      let allOutput = '';

      const child = spawn('node', [scriptPath], { cwd: path.join(__dirname, '..'), env });

      res.on('close', () => {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        if (!res.writableEnded && child.exitCode === null) {
          console.log(`[API] Client disconnected early, killing process PID ${child.pid}`);
          require('tree-kill')(child.pid, 'SIGKILL');
          jobRegistry.updateJob(job.id, { status: 'failed', error: 'Client disconnected' });
          if (file) {
            try { fs.unlinkSync(file.path); } catch(e) {}
          }
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
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        const jsonIdx = allOutput.indexOf('__JSON__');
        let result = null;

        if (jsonIdx !== -1) {
          try {
            const afterMarker = allOutput.substring(jsonIdx + 8);
            const firstNewline = afterMarker.indexOf('\n');
            const jsonStr = (firstNewline === -1 ? afterMarker : afterMarker.substring(0, firstNewline)).trim();
            result = JSON.parse(jsonStr);
          } catch(e) { /* parse failed */ }
        }

        if (result && result.success) {
          jobRegistry.updateJob(job.id, {
            status: 'done',
            completedAt: new Date().toISOString(),
            resultSummary: { source: sourceLabel },
            inlineResult: result,
            inlineLog: allOutput.substring(0, 50000)
          });
        } else {
          jobRegistry.updateJob(job.id, {
            status: result ? 'failed' : 'failed',
            error: result?.error || 'No result returned'
          });
        }

        if (format === 'json') {
          const responseData = result || { success: false, error: 'No result returned' };
          const headers = buildHeaders({
            method: 'file2md',
            cache: 'miss',
            tokens: responseData.tokens || { md: 0, html: 0 },
            url: url || (file ? file.originalname : 'document')
          }, format);
          if (req.id) headers['X-Request-Id'] = req.id;
          headers['X-Job-Id'] = job.id;
          
          if (!res.headersSent) {
            res.set(headers).json(responseData);
          } else {
            res.write(JSON.stringify(responseData));
            res.end();
          }
        } else if (format === 'markdown') {
          if (!result || !result.success) {
            return sendError(res, 500, result?.error || 'File conversion failed or returned no result', ERROR_CODES.INTERNAL_ERROR);
          }
          const md = result?.markdown || result?.result?.markdown || (result?.files && result.files['full_document.md']) || '';
          const headers = buildHeaders({
            method: 'file2md',
            cache: 'miss',
            tokens: { md: Math.ceil(md.length / 3.7), html: 0 },
            url: url || (file ? file.originalname : 'document')
          }, format);
          if (req.id) headers['X-Request-Id'] = req.id;
          headers['X-Job-Id'] = job.id;
          res.set(headers).send(md);
        } else {
          // stream — already wrote output, just end
          res.end();
        }
      });
    });
  };

  app.post('/api/file2md', file2mdHandler);
  app.file2mdHandler = file2mdHandler;
};
