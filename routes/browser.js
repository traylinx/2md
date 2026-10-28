'use strict';

const express = require('express');
const c = require('../lib/browser/contracts');
const {Deadline} = require('../lib/capture/deadline');
const {readBody} = require('../lib/capture/readBody');
const {captureCredentials} = require('../lib/capture/sentinelPrincipal');

// Mount only on a dedicated browser listener, before body parsers. Nothing in the
// legacy server imports this module. The caller resolver MUST verify both current
// Sentinel/project identity. verifyHost checks enrolled key possession over the
// exact parsed body once; the fresh resolver call must not consume its nonce again.
const ROUTES = Object.freeze({
  '/capabilities':'get_browser_capabilities', '/sessions':'browser_open',
  '/observe':'browser_observe', '/navigate':'browser_navigate', '/act':'browser_act',
  '/credentials':'browser_credentials', '/authenticate':'browser_authenticate',
  '/extract':'browser_extract', '/action-status':'browser_action_status', '/close':'browser_close',
});
function createBrowserRouter({enabled=false,resolveCaller,verifyHost,service}={}) {
  const router=express.Router();
  router.use((_req,res,next)=>{res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});next();});
  if (enabled!==true) {
    router.use((_req,res)=>res.status(404).json({error:'NOT_FOUND'})); return router;
  }
  if (typeof resolveCaller!=='function' || typeof verifyHost!=='function' || typeof service?.call!=='function') c.deny('UNAVAILABLE');
  for (const [path,name] of Object.entries(ROUTES)) router.post(path,async(req,res)=>{
    const deadline=new Deadline(35000);
    const closed=()=>{if (!res.writableFinished) deadline.abort();}; res.once('close',closed);
    try {
      // No cookies/ambient browser authority; do not expose this listener as CORS.
      if (req.headers.origin || req.headers.cookie || Object.keys(req.query).length) c.deny('FORBIDDEN');
      // A pre-parsed body would break the auth-before-payload guarantee.
      if (req.body!==undefined) c.deny('UNAVAILABLE');
      const credentials=captureCredentials(req);
      const verified=c.binding(await deadline.run(()=>resolveCaller({credentials,request:req,deadline})));
      const input=c.parseTool(name,await readBody(req,16384,deadline));
      await deadline.run(()=>verifyHost({bound:verified,request:req,method:'POST',path:'/api/browser/v1'+path,body:input,signal:deadline.signal}));
      const result=await deadline.run(()=>service.call(name,input,verified,{signal:deadline.signal}));
      const current=c.binding(await deadline.run(()=>resolveCaller({credentials,request:req,deadline})));
      if (c.scope(current)!==c.scope(verified)) c.deny('FORBIDDEN');
      let clean;
      try {clean=c.parseResult(name,result);} catch {c.deny('UNAVAILABLE');}
      const output=JSON.stringify(clean);
      if (output===undefined || Buffer.byteLength(output)>c.LIMITS.maxResultBytes) c.deny('LIMIT_EXCEEDED');
      if (!res.destroyed) res.type('application/json').send(output);
    } catch(error) {
      const safe=c.publicError(error);
      if (!res.destroyed && !res.headersSent) res.status(safe.status).json(safe.body);
    } finally { deadline.close(); res.removeListener('close',closed); }
  });
  router.use((_req,res)=>res.status(404).json({error:'NOT_FOUND'}));
  return router;
}
module.exports={createBrowserRouter,ROUTES};
