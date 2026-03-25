const https = require('https');
const http = require('http');

const MARKDOWN_ACCEPT = 'text/markdown, text/plain;q=0.9, text/html;q=0.8, */*;q=0.1';
const USER_AGENT = 'html2md/1.0 (compatible; +https://2md.traylinx.com)';
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 5;

function fetchWithAccept(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > MAX_REDIRECTS) {
      return reject(new Error('Too many redirects'));
    }

    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'Accept': MARKDOWN_ACCEPT,
        'User-Agent': USER_AGENT,
      },
      timeout: TIMEOUT_MS,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          redirectUrl = new URL(redirectUrl, url).toString();
        }
        res.resume();
        fetchWithAccept(redirectUrl, redirectCount + 1).then(resolve).catch(reject);
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
        resolve({ body, contentType, headers: res.headers });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
  });
}

async function negotiateMarkdown(url) {
  try {
    const { body, contentType } = await fetchWithAccept(url);

    const isMarkdown = contentType.startsWith('text/markdown') ||
                       contentType.includes('text/markdown');

    if (!isMarkdown) {
      return { ok: false, reason: 'Server did not return text/markdown' };
    }

    if (!body || body.trim().length < 10) {
      return { ok: false, reason: 'Markdown response body too short' };
    }

    const mdTokens = Math.ceil(body.length / 3.7);

    return {
      ok: true,
      method: 'native',
      markdown: body,
      metadata: {},
      tokens: { html: 0, md: mdTokens },
      quality: { wordCount: body.split(/\s+/).length },
    };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

module.exports = { negotiateMarkdown };
