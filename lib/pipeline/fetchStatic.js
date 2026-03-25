const https = require('https');
const http = require('http');
const { getRandomUA } = require('../userAgents');
const TIMEOUT_MS = 10000;
const MAX_REDIRECTS = 5;

function doFetch(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > MAX_REDIRECTS) {
      return reject(new Error('Too many redirects'));
    }

    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': getRandomUA(),
      },
      timeout: TIMEOUT_MS,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          redirectUrl = new URL(redirectUrl, url).toString();
        }
        res.resume();
        doFetch(redirectUrl, redirectCount + 1).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      const contentType = (res.headers['content-type'] || '').toLowerCase();
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({
          html: body,
          contentType,
          contentLength: parseInt(res.headers['content-length'] || '0', 10) || body.length,
          headers: res.headers,
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
  });
}

async function fetchStatic(url) {
  try {
    const result = await doFetch(url);

    if (!result.html || result.html.trim().length < 50) {
      return { ok: false, reason: 'Response body too short' };
    }

    return {
      ok: true,
      html: result.html,
      contentType: result.contentType,
      contentLength: result.contentLength,
    };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

module.exports = { fetchStatic };
