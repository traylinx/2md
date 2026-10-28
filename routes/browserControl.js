'use strict';
const express=require('express');
const c=require('../lib/browser/contracts');
const {human}=require('../lib/browser/grantAuthority');
const {captureCredentials}=require('../lib/capture/sentinelPrincipal');
const {Deadline}=require('../lib/capture/deadline');
const {readBody}=require('../lib/capture/readBody');

// Separate human control listener. Not an MCP tool and not a website login API.
function createBrowserControlRouter({enabled=false,resolveHuman,authority}={}) {
  const router=express.Router();
  router.use((_req,res,next)=>{res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});next();});
  if (!enabled) {router.use((_req,res)=>res.status(404).json({error:'NOT_FOUND'}));return router;}
  if (typeof resolveHuman!=='function' || typeof authority?.create!=='function' || typeof authority?.revoke!=='function') c.deny('UNAVAILABLE');
  for (const operation of ['create','revoke']) router.post(operation==='create'?'/grants':'/grants/:grantId/revoke',async(req,res)=>{
    const deadline=new Deadline(5000),close=()=>{if(!res.writableFinished)deadline.abort();}; res.once('close',close);
    try {
      if (req.headers.origin || req.headers.cookie || req.headers['x-agent-user-id']!==undefined || req.headers['x-agent-secret-token']!==undefined) c.deny('FORBIDDEN');
      if (req.body!==undefined) c.deny('UNAVAILABLE');
      const credentials=captureCredentials(req);
      if (!/^Bearer [^\s,]{1,8192}$/.test(credentials.authorization||'')) c.deny('UNAUTHENTICATED');
      const scope=c.parse(c.obj({organizationId:c.id,projectId:c.id}),req.query);
      const check=async()=>{
        const p=human(await deadline.run(()=>resolveHuman({authorization:credentials.authorization,...scope,signal:deadline.signal})));
        if (p.organizationId!==scope.organizationId || p.projectId!==scope.projectId) c.deny('FORBIDDEN');return p;
      };
      const first=await check();
      const input=await readBody(req,8192,deadline);
      if (operation==='revoke') c.parse(c.obj({}),input);
      else c.parseGrant(input);
      const current=await check();
      if (current.authSubject!==first.authSubject || current.workspaceUserId!==first.workspaceUserId) c.deny('FORBIDDEN');
      const result=await deadline.run(()=>operation==='create'?authority.create(input,current,{signal:deadline.signal}):authority.revoke(req.params.grantId,current,{signal:deadline.signal}));
      if (!res.destroyed) res.json(result);
    } catch(e) {const safe=c.publicError(e);if(!res.destroyed&&!res.headersSent)res.status(safe.status).json(safe.body);}
    finally {deadline.close();res.removeListener('close',close);}
  });
  router.use((_req,res)=>res.status(404).json({error:'NOT_FOUND'}));return router;
}
module.exports={createBrowserControlRouter};
