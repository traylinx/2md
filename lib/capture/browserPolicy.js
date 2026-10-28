'use strict';
const { CaptureError } = require('./errors');

function responseHeaders(event, recipe) {
  const headers = (event.responseHeaders || []).filter(item => !['report-to', 'nel', 'refresh'].includes(item.name.toLowerCase()));
  const connect = recipe?.mode==='xhr' ? [...new Set([recipe.origin,...recipe.postUrls.concat(recipe.readUrls).map(u=>new URL(u).origin)])].join(' ') : recipe ? recipe.origin : 'http: https:';
  headers.push({ name: 'Content-Security-Policy', value: `worker-src 'none'; frame-src 'none'; object-src 'none'; ` +
    `base-uri 'none'; manifest-src 'none'; connect-src ${connect}; form-action ${recipe ? recipe.origin : "'none'"}` });
  return headers;
}

async function applyBrowserPolicy(page, browser, policy, deadline, recipe) {
  const session = await page.createCDPSession();
  const warnings = new Set();
  const blockedResources = [];
  await page.setBypassServiceWorker(true);
  await page.setCacheEnabled(false);
  await session.send('Network.enable');
  await session.send('Network.setBypassServiceWorker', { bypass: true });
  await session.send('Page.setDownloadBehavior', { behavior: 'deny' });
  await session.send('Fetch.enable', { patterns: [
    { urlPattern: '*', requestStage: 'Request' }, { urlPattern: '*', requestStage: 'Response' },
  ] });
  const { frameTree } = await session.send('Page.getFrameTree');
  const mainFrame = frameTree.frame.id;
  session.on('Network.dataReceived', event => {
    try { policy.received(event.dataLength); } catch { deadline.abort('LIMIT_EXCEEDED'); }
  });
  session.on('Fetch.requestPaused', event => {
    handlePaused(event).catch(() => deadline.abort('UPSTREAM_FAILED'));
  });
  async function handlePaused(event) {
    const document = event.resourceType === 'Document';
    const main = event.frameId === mainFrame;
    try {
      deadline.remaining();
      if (event.responseStatusCode || event.responseErrorReason) {
        if (document) {
          const attachment = event.responseHeaders?.some(header => header.name.toLowerCase() === 'content-disposition' && /attachment/i.test(header.value));
          if (attachment || event.responseErrorReason) throw new CaptureError('TARGET_DENIED');
          return await session.send('Fetch.continueResponse', { requestId: event.requestId,
            responseCode: event.responseStatusCode, responseHeaders: responseHeaders(event, recipe) });
        }
        return await session.send('Fetch.continueResponse', { requestId: event.requestId });
      }
      await policy.allow({ url: event.request.url, method: event.request.method,
        type: event.resourceType.toLowerCase(), mainFrame: main });
      await session.send('Fetch.continueRequest', { requestId: event.requestId });
    } catch (error) {
      if(blockedResources.length<32&&['Document','Script','Stylesheet','XHR','Fetch'].includes(event.resourceType)){
        try{const u=new URL(event.request.url);blockedResources.push({origin:u.origin,path:u.pathname.slice(0,256),type:event.resourceType});}catch{}
      }
      // A failed CSS @import also rejects its parent's load event. Lazy SPA
      // loaders can then refuse to mount the entire login page. Omit denied
      // CSS locally; never fetch it or turn this into resource permission.
      if(event.resourceType==='Stylesheet'&&event.request.method==='GET'&&!event.responseStatusCode&&!event.responseErrorReason&&
         ['FORBIDDEN','TARGET_DENIED'].includes(error.code)&&!deadline.signal.aborted){
        warnings.add('RESOURCE_BLOCKED');warnings.add('STYLESHEET_OMITTED');
        return await session.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:200,responseHeaders:[
          {name:'Content-Type',value:'text/css; charset=utf-8'},{name:'Cache-Control',value:'no-store'}],body:''});
      }
      await session.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' }).catch(() => {});
      if ((document && main) || error.code === 'LIMIT_EXCEEDED' || deadline.signal.aborted) deadline.abort(error.code || 'TARGET_DENIED');
      else warnings.add('RESOURCE_BLOCKED');
    }
  }
  // New targets start paused, then close. No popup/worker code gets a free turn.
  const targets = await browser.target().createCDPSession();
  const currentTarget = (await session.send('Target.getTargetInfo')).targetInfo.targetId;
  targets.on('Target.attachedToTarget', event => {
    if (event.targetInfo.targetId === currentTarget) return;
    targets.send('Target.closeTarget', { targetId: event.targetInfo.targetId }).catch(() => {});
  });
  await targets.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true,
    filter: [{ type: 'browser', exclude: true }, { type: 'page' }, { type: 'service_worker' },
      { type: 'shared_worker' }, { type: 'worker' }] });
  await page.evaluateOnNewDocument(() => {
    window.open = () => null;
    const denied = () => { throw new Error('CAPTURE_POLICY'); };
    for (const name of ['WebSocket', 'EventSource', 'Worker', 'SharedWorker']) {
      Object.defineProperty(window, name, { value: denied, configurable: false, writable: false });
    }
    if (navigator.serviceWorker) navigator.serviceWorker.register = denied;
    navigator.sendBeacon = () => false;
  });
  return { warnings, blockedResources, session, targets };
}

module.exports = { applyBrowserPolicy, responseHeaders };
