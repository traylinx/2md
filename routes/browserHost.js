'use strict';
const express=require('express'),c=require('../lib/browser/contracts');
const {Deadline}=require('../lib/capture/deadline');
const {readBody}=require('../lib/capture/readBody');
const {captureCredentials}=require('../lib/capture/sentinelPrincipal');
const {schemas,outputs}=require('../lib/browser/hostContracts');
// Transport lifecycle only, not a model tool or a source of owner permission.
function createBrowserHostRouter({resolveCaller,verifyHost,manager,pairing,authorize}={}){
 if(typeof resolveCaller!=='function'||typeof verifyHost!=='function'||typeof manager?.heartbeat!=='function')c.deny('UNAVAILABLE');
 const router=express.Router();const paths=pairing?Object.keys(schemas):['/heartbeat'];
 if(pairing&&typeof authorize!=='function')c.deny('UNAVAILABLE');
 for(const path of paths)router.post(path,async(req,res)=>{
  res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});const deadline=new Deadline(10000);
  try{
   if(req.headers.cookie||req.headers.origin||Object.keys(req.query).length)c.deny('FORBIDDEN');if(req.body!==undefined)c.deny('UNAVAILABLE');
   const credentials=captureCredentials(req),bound=c.binding(await deadline.run(()=>resolveCaller({credentials,request:req,deadline})));
   const input=c.parse(schemas[path],await readBody(req,2048,deadline));
   await deadline.run(()=>verifyHost({bound,request:req,method:'POST',path:'/api/browser/v1'+path,body:input,signal:deadline.signal}));
   const result=await deadline.run(async()=>{
    if(path==='/heartbeat')return manager.heartbeat(bound,input.sessionId);
    if(path==='/pair-begin')return pairing.begin(bound,input);
    if(path==='/pair-exchange')return pairing.exchange(bound,input);
    const grant=await authorize(bound,{signal:deadline.signal}),owner=input.owner;
    if(grant.approvedByWorkspaceUserId!==owner.workspaceUserId||owner.organizationId!==bound.principal.organizationId||owner.projectId!==bound.principal.projectId)c.deny('FORBIDDEN');
    return {authorized:true};
   });
   const current=c.binding(await deadline.run(()=>resolveCaller({credentials,request:req,deadline})));
   if(c.scope(current)!==c.scope(bound))c.deny('FORBIDDEN');res.json(c.parse(outputs[path],result));
  }catch(error){const safe=c.publicError(error);if(!res.headersSent)res.status(safe.status).json(safe.body);}
  finally{deadline.close();}
 });return router;
}
module.exports={createBrowserHostRouter};
