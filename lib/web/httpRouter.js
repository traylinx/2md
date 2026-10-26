'use strict';
const express=require('express');
const c=require('./contracts');
// Mount before legacy wildcard CORS/body parsers. This router has no CORS wildcard
// and never accepts cookie-only auth, provider credentials, or admin bypass headers.
function createWebRouter({enabled=false,runtime,allowedOrigins=[]}={}) {
  const router=express.Router();
  if(enabled!==true){router.use((_req,res)=>res.status(404).set('Cache-Control','no-store').json({error:'NOT_FOUND'}));return router;}
  if(['plan','confirm','admit','read','grant'].some(k=>typeof runtime?.[k]!=='function') ||
     !Array.isArray(allowedOrigins) || allowedOrigins.length===0)c.deny('UNAVAILABLE');
  const origins=new Set(allowedOrigins.map(value=>{const u=new URL(value);if(u.protocol!=='https:' || u.origin!==value)c.deny('UNAVAILABLE');return value;}));
  router.use((req,res,next)=>{
    res.set('Cache-Control','no-store');res.set('X-Content-Type-Options','nosniff');res.set('Vary','Origin');
    const seen=new Set();for(let i=0;i<req.rawHeaders.length;i+=2){const k=req.rawHeaders[i].toLowerCase();
      if(['authorization','x-agent-user-id','x-agent-secret-token','idempotency-key','origin','x-web-confirmation'].includes(k)){
        if(seen.has(k))return res.status(400).json({error:'INVALID_INPUT'});seen.add(k);}}
    const origin=req.get('origin');if(origin&&!origins.has(origin))return res.status(403).json({error:'FORBIDDEN'});
    if(origin){res.set('Access-Control-Allow-Origin',origin);res.set('Access-Control-Allow-Headers','Authorization, Content-Type, Idempotency-Key, X-Web-Confirmation');res.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');}
    if(req.method==='OPTIONS')return res.status(204).end();
    next();
  });
  router.use(express.json({limit:'16kb',strict:true}));
  const status={UNAUTHENTICATED:401,FORBIDDEN:403,NOT_FOUND:404,INVALID_INPUT:422,TARGET_DENIED:422,
    IDEMPOTENCY_CONFLICT:409,RESULT_NOT_READY:409,STALE_PLAN:409,INVALID_CONFIRMATION:403,ALREADY_ADMITTED:409,
    ARTIFACT_EXPIRED:410,CAPACITY:429};
  const wrap=fn=>async(req,res)=>{
    const controller=new AbortController();const cancel=()=>{if(!res.writableEnded)controller.abort();};
    res.on('close',cancel);req.on('aborted',cancel);
    try{await fn(req,res,controller.signal);}catch(e){const code=e instanceof c.WebBoundaryError?e.code:'UNAVAILABLE';res.status(status[code]||503).json({error:status[code]?code:'UNAVAILABLE'});}
    finally{res.removeListener('close',cancel);req.removeListener('aborted',cancel);}
  };
  function human(req){const authorization=req.get('authorization');
    if(typeof authorization!=='string'||!/^Bearer [^\s,]{1,8192}$/.test(authorization)||req.get('x-agent-user-id')||req.get('x-agent-secret-token'))c.deny('UNAUTHENTICATED');
    return {authorization,organizationId:req.query.organizationId,projectId:req.query.projectId};}
  router.post('/plans',wrap(async(req,res,signal)=>{c.exact(req.body,['urls','deadlineMs','maxResponseBytes']);
    res.status(201).json(await runtime.plan({...human(req),spec:req.body,signal}));}));
  router.post('/plans/:planId/confirmations',wrap(async(req,res,signal)=>{
    // Browser confirmation channel additionally requires an allowlisted Origin.
    if(!origins.has(req.get('origin')))c.deny('FORBIDDEN');c.exact(req.body,['confirmationId']);
    const confirmationProof=req.get('x-web-confirmation');
    if(typeof confirmationProof!=='string'||confirmationProof.length>4096||!/^[-A-Za-z0-9_]+\.[-A-Za-z0-9_]+\.[-A-Za-z0-9_]+$/.test(confirmationProof))c.deny('INVALID_CONFIRMATION');
    res.json(await runtime.confirm({...human(req),planId:req.params.planId,confirmationId:req.body.confirmationId,confirmationProof,signal}));}));
  router.post('/runs',wrap(async(req,res,signal)=>{c.exact(req.body,['planId','confirmationId']);
    const result=await runtime.admit({...human(req),...req.body,idempotencyKey:req.get('idempotency-key'),signal});res.status(result.replayed?200:202).json(result);}));
  router.get('/runs/:id',wrap(async(req,res,signal)=>res.json(await runtime.read({...human(req),executionId:req.params.id,result:false,signal}))));
  router.get('/runs/:id/result',wrap(async(req,res,signal)=>res.json(await runtime.read({...human(req),executionId:req.params.id,result:true,signal}))));
  router.post('/internal/dispatch-grants',wrap(async(req,res,signal)=>{
    if(req.get('origin'))c.deny('FORBIDDEN');
    const headers=new Headers();for(const name of ['content-type','authorization','x-agent-user-id','x-agent-secret-token']){const value=req.get(name);if(value)headers.set(name,value);}
    const reply=await runtime.grant(new Request('https://read.internal/internal/dispatch-grants',{method:'POST',headers,body:JSON.stringify(req.body),signal}));
    res.status(reply.status).type('application/json').send(await reply.text());
  }));
  router.use((_req,res)=>res.status(404).json({error:'NOT_FOUND'}));
  router.use((error,_req,res,_next)=>res.status(error.type==='entity.too.large'?413:400).json({error:'INVALID_INPUT'}));
  return router;
}
module.exports={createWebRouter};
