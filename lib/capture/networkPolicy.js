'use strict';
const { CaptureError } = require('./errors');
const { parseTarget, resolveTarget } = require('./targetPolicy');

class RequestPolicy {
  constructor({ deadline, recipe, resolver = resolveTarget, allowedOrigins = ['*'] }) {
    this.deadline = deadline; this.recipe = recipe; this.resolve = resolver;
    this.allowedOrigins = allowedOrigins;
    this.phase = recipe ? 'login' : 'public'; this.submitted = false;
    this.count = 0; this.bytes = 0; this.denied = false;
  }

  async allow({ url, method, type, mainFrame = true }) {
    this.deadline.remaining();
    if (++this.count > 100) throw new CaptureError('LIMIT_EXCEEDED');
    if (['websocket', 'eventsource', 'other', 'media', 'font', 'image'].includes(type) ||
        (type === 'document' && !mainFrame)) throw new CaptureError('TARGET_DENIED');
    // Even DNS is an external effect. Reject caller scope, path and method
    // before resolving any page-controlled hostname.
    const parsed = parseTarget(url);
    if (!this.allowedOrigins.includes('*') && !this.allowedOrigins.includes(parsed.origin)) throw new CaptureError('FORBIDDEN');
    if (this.recipe && parsed.origin !== this.recipe.origin) throw new CaptureError('TARGET_DENIED');
    if (this.recipe) {
      const allowed = type === 'document' ? [this.recipe.loginPath, this.recipe.submitPath, ...this.recipe.readPaths] : this.recipe.resourcePaths;
      if (!allowed?.includes(parsed.pathname) || parsed.search) throw new CaptureError('TARGET_DENIED');
    }
    if (method !== 'GET' && method !== 'HEAD') {
      const loginPost = this.recipe && this.phase === 'submit' && !this.submitted &&
      method === 'POST' && type === 'document' && mainFrame &&
        parsed.pathname === this.recipe.submitPath && !parsed.search;
      if (!loginPost) throw new CaptureError('TARGET_DENIED');
      // Reserve before awaiting DNS: concurrent events cannot admit two POSTs.
      this.submitted = true; this.phase = 'verify';
    }
    return this.resolve(parsed.href, { deadline: this.deadline });
  }

  received(bytes) {
    this.bytes += Math.max(0, bytes);
    if (this.bytes > 10 * 1024 * 1024) throw new CaptureError('LIMIT_EXCEEDED');
  }
}

module.exports = { RequestPolicy };
