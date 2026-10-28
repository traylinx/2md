'use strict';
const express=require('express'),c=require('../lib/browser/contracts');
const {Deadline}=require('../lib/capture/deadline');
const {readBody}=require('../lib/capture/readBody');
const {captureCredentials}=require('../lib/capture/sentinelPrincipal');
const {schemas,outputs}=require('../lib/browser/hostContracts');
// Transport lifecycle only, not a model tool or a source of owner permission.
function createBrowserHostRouter({resolveCaller,verifyHost,manager}={}){
 if(typeof resolveCaller!=='function'||typeof verifyHost!=='function'||typeof manager?.heartbeat!=='function')c.deny('UNAVAILABLE');
 const router=express.Router();router.post('/heartbeat',async(req,res)=>{
  res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});const deadline=new Deadline(10000);
  try{
   if(req.headers.cookie||req.headers.origin||Object.keys(req.query).length)c.deny('FORBIDDEN');if(req.body!==undefined)c.deny('UNAVAILABLE');
   const credentials=captureCredentials(req),bound=c.binding(await deadline.run(()=>resolveCaller({credentials,request:req,deadline})));
   const input=c.parse(schemas['/heartbeat'],await readBody(req,2048,deadline));
   await deadline.run(()=>verifyHost({bound,request:req,method:'POST',path:'/api/browser/v1/heartbeat',body:input,signal:deadline.signal}));
   const result=await deadline.run(()=>manager.heartbeat(bound,input.sessionId));
   const current=c.binding(await deadline.run(()=>resolveCaller({credentials,request:req,deadline})));
   if(c.scope(current)!==c.scope(bound))c.deny('FORBIDDEN');res.json(c.parse(outputs['/heartbeat'],result));
  }catch(error){const safe=c.publicError(error);if(!res.headersSent)res.status(safe.status).json(safe.body);}
  finally{deadline.close();}
 });return router;
}
module.exports={createBrowserHostRouter};
