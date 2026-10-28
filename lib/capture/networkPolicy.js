'use strict';
const { CaptureError } = require('./errors');
const { resourceOrigins } = require('./resourceScope');
const { parseTarget, resolveTarget } = require('./targetPolicy');

class RequestPolicy {
  constructor({ deadline, recipe, resolver = resolveTarget, allowedOrigins = ['*'], allowedResourceOrigins = [] }) {
    this.deadline = deadline; this.recipe = recipe; this.resolve = resolver;
    this.allowedOrigins = allowedOrigins;
    this.resourceOrigins = resourceOrigins({ resourceOrigins: allowedResourceOrigins });
    this.phase = recipe ? 'login' : 'public'; this.submitted = false;
    this.postIndex = 0; this.accountVerified = false; this.privateSecrets = [];
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
    const resourceOnly = !this.recipe && ['script', 'stylesheet'].includes(type) &&
      ['GET', 'HEAD'].includes(method) && this.resourceOrigins.includes(parsed.origin);
    if (!this.allowedOrigins.includes('*') && !this.allowedOrigins.includes(parsed.origin) && !resourceOnly) throw new CaptureError('FORBIDDEN');
    if (this.recipe?.mode === 'xhr') {
      this.allowXhr({parsed,method,type,mainFrame});
      return this.resolve(parsed.href, {deadline:this.deadline});
    }
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

  allowXhr({parsed,method,type,mainFrame}) {
    const r=this.recipe,url=parsed.href;
    if(parsed.search&&!(r.readUrls.includes(url)&&['GET','HEAD','OPTIONS'].includes(method)))throw new CaptureError('TARGET_DENIED');
    const data=['xhr','fetch','preflight'].includes(type);
    if(method==='OPTIONS'&&data&&(r.readUrls.includes(url)||this.phase==='submit'&&r.postUrls[this.postIndex]===url))return;
    if(method==='POST'&&data&&type!=='preflight'&&this.phase==='submit'&&r.postUrls[this.postIndex]===url){
      // Reserve synchronously, before DNS. Each declared login POST at most once.
      this.postIndex++;this.submitted=this.postIndex===r.postUrls.length;
      if(this.submitted)this.phase='verify';return;
    }
    if(!['GET','HEAD'].includes(method))throw new CaptureError('TARGET_DENIED');
    if(type==='document'&&mainFrame&&parsed.origin===r.origin&&[r.loginPath,...r.readPaths].includes(parsed.pathname))return;
    if(['script','stylesheet'].includes(type)&&(parsed.origin===r.origin||r.resourceUrls.includes(url)))return;
    if(data&&r.readUrls.includes(url))return;
    throw new CaptureError('TARGET_DENIED');
  }

  received(bytes) {
    this.bytes += Math.max(0, bytes);
    if (this.bytes > 10 * 1024 * 1024) throw new CaptureError('LIMIT_EXCEEDED');
  }
}

module.exports = { RequestPolicy };
