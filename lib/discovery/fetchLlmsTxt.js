const https = require('https');
const http = require('http');

const TIMEOUT_MS = 5000;

async function fetchLlmsTxt(baseUrl) {
  try {
    const parsed = new URL(baseUrl);
    const llmsUrl = `${parsed.protocol}//${parsed.host}/llms.txt`;

    return new Promise((resolve) => {
      const client = llmsUrl.startsWith('https') ? https : http;
      const req = client.get(llmsUrl, { timeout: TIMEOUT_MS }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return resolve({ found: false, reason: `HTTP ${res.statusCode}` });
        }

        const contentType = (res.headers['content-type'] || '').toLowerCase();
        if (!contentType.includes('text/') && !contentType.includes('application/octet-stream')) {
          res.resume();
          return resolve({ found: false, reason: 'Non-text content type' });
        }

        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (!body || body.trim().length < 10) {
            return resolve({ found: false, reason: 'Empty or trivially small response' });
          }
          resolve({ found: true, content: body.trim(), url: llmsUrl });
        });
      });

      req.on('error', (err) => {
        resolve({ found: false, reason: err.message });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ found: false, reason: 'Timeout' });
      });
    });
  } catch (err) {
    return { found: false, reason: err.message };
  }
}

module.exports = { fetchLlmsTxt };
