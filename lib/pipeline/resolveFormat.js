/**
 * Resolves the desired output format for a conversion request.
 * 
 * Precedence:
 * 1. Explicit `format` query parameter (e.g. ?format=markdown)
 * 2. Explicit `format` body parameter
 * 3. Client hints (`x-html2md-client`, `referer`) -> default to stream for UI
 * 4. Content negotiation (`Accept: text/markdown`) -> markdown
 * 5. Content negotiation (`Accept: application/json`) -> json
 * 6. Fallback -> json for programmatic usage
 * 
 * Valid outputs: 'stream', 'json', 'markdown'
 * 
 * @param {import('express').Request} req 
 * @returns {'stream'|'json'|'markdown'}
 */
function resolveFormat(req) {
  // 1 & 2. Explicit format in query or body
  const explicitFormat = req.query.format || (req.body && req.body.format);
  if (['stream', 'json', 'markdown'].includes(explicitFormat)) {
    return explicitFormat;
  }

  // 3. UI client detection
  // If the request explicitly comes from our web UI, or the referer is our own app
  // we default to stream to preserve backward compatibility with the existing UI.
  const host = req.get('host') || '';
  const baseHost = host.replace(/^api\./, '');

  const isWebUI = 
    req.headers['x-html2md-client'] === 'web-ui' || 
    (req.headers.referer && req.headers.referer.includes(baseHost));
  
  if (isWebUI && !explicitFormat) {
    return 'stream';
  }

  // 4 & 5. Content Negotiation
  const accept = req.headers.accept || '';
  
  // Browsers often send text/html,application/xhtml+xml,application/xml...
  // We don't want to accidentally send JSON to a browser hitting the GET endpoint
  // if they didn't explicitly ask for it, but for POST requests from curl/agents,
  // we follow the Accept header.
  if (accept.includes('text/markdown')) {
    return 'markdown';
  }
  if (accept.includes('application/json')) {
    return 'json';
  }

  // 6. Default API behavior (agents, curl, unknown clients)
  // For POST requests parsing JSON bodies, returning JSON is the safest default.
  // For GET requests (e.g. url-prepend), it might be better to return markdown, 
  // but we handle that in the specific route handler.
  return 'json';
}

module.exports = {
  resolveFormat
};
