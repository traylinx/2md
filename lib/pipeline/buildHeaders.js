/**
 * Sanitizes a URL string into a clean filename slug.
 */
function slugFromUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const raw = parsed.pathname.replace(/\/+$/, '').replace(/^\/+/, '').replace(/\//g, '-') || 'index';
    return raw.replace(/[^a-z0-9\-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'page';
  } catch (e) {
    const rawName = typeof urlStr === 'string' ? urlStr.split('/').pop() || 'page' : 'page';
    return rawName.replace(/[^a-z0-9\-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'page';
  }
}

/**
 * Builds standard conversion response headers including
 * token estimates and methods.
 * 
 * @param {Object} result - The normalized conversion result
 * @param {'stream'|'json'|'markdown'} format - The resolved output format
 * @returns {Record<string, string>} A dictionary of HTTP headers
 */
function buildHeaders(result, format) {
  const headers = {};

  // Tokens
  if (result.tokens) {
    if (result.tokens.md > 0) headers['X-Markdown-Tokens'] = String(result.tokens.md);
    if (result.tokens.html > 0) headers['X-Source-Tokens'] = String(result.tokens.html);
  }

  // Method & Cache
  if (result.method) headers['X-Conversion-Method'] = result.method;
  headers['X-Cache'] = result.cache === 'hit' ? 'HIT' : 'MISS';
  headers['X-Native-Markdown'] = result.method === 'native' ? 'true' : 'false';

  // Vary by Accept header since we support Content Negotiation
  headers['Vary'] = 'Accept';

  // Content-Type and Disposition based on format
  if (format === 'markdown') {
    headers['Content-Type'] = 'text/markdown; charset=utf-8';
    if (result.url) {
      const slug = slugFromUrl(result.url);
      headers['Content-Disposition'] = `attachment; filename="${slug}.md"`;
    }
  } else if (format === 'json') {
    headers['Content-Type'] = 'application/json; charset=utf-8';
    if (result.url) {
      const slug = slugFromUrl(result.url);
      headers['Content-Disposition'] = `attachment; filename="${slug}.json"`;
    }
  } else if (format === 'stream') {
    headers['Content-Type'] = 'text/plain; charset=utf-8';
    headers['Transfer-Encoding'] = 'chunked';
  }

  return headers;
}

module.exports = {
  buildHeaders,
  slugFromUrl
};
