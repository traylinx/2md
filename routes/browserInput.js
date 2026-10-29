'use strict';
const express=require('express');
const c=require('../lib/browser/contracts');
const {Deadline}=require('../lib/capture/deadline');
const {readBody}=require('../lib/capture/readBody');
const {captureCredentials}=require('../lib/capture/sentinelPrincipal');
const {schemas,outputs}=require('../lib/browser/inputContracts');
// Host channel only: not a CORS endpoint, HTML form action or MCP tool.
function createBrowserInputRouter({enabled=false,resolveCaller,verifyHost,broker,operations}={}){
 const router=express.Router();if(!enabled)return router;
 if(typeof resolveCaller!=='function'||typeof verifyHost!=='function'||!broker)c.deny('UNAVAILABLE');
 for(const [path,schema]of Object.entries(schemas).filter(([path])=>operations||!path.startsWith('/operation-')))router.post(path,async(req,res)=>{
  res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});const deadline=new Deadline(10000);let input;const started=Date.now();let stage='caller_before';
  try{
   if(req.headers.cookie||req.headers.origin||Object.keys(req.query).length)c.deny('FORBIDDEN');if(req.body!==undefined)c.deny('UNAVAILABLE');
   const credentials=captureCredentials(req),bound=c.binding(await deadline.run(()=>resolveCaller({credentials,request:req,deadline})));
   input=c.parse(schema,await readBody(req,65536,deadline));
   stage='host_proof';await deadline.run(()=>verifyHost({bound,request:req,method:'POST',path:'/api/browser/v1'+path,body:input,signal:deadline.signal}));
   stage='service';const result=await deadline.run(()=>path==='/input-agent-supply'?broker.supplyAgent(bound,input):path==='/input-agent-prepare'?broker.prepareAgent(bound,input):path==='/operation-agent-complete'?operations.completeAgent(bound,input):path==='/operation-inspect'?operations.inspect(bound,input.operationId):path==='/operation-complete'?operations.complete(bound,input):path==='/operation-cancel'?operations.cancel(bound,input.operationId):path==='/input-inspect'?broker.inspect(bound,input.interventionId):path==='/input-supply'?broker.supply(bound,input):path==='/input-prepare'?broker.prepare(bound,input):broker.cancel(bound,input.interventionId));
   stage='caller_after';const current=c.binding(await deadline.run(()=>resolveCaller({credentials,request:req,deadline})));if(c.scope(current)!==c.scope(bound))c.deny('FORBIDDEN');
   res.json(c.parse(outputs[path],result));
  }catch(error){const safe=c.publicError(error);require('../lib/browser/diagnostics').emitFailure({operation:'protected_input',stage,code:safe.body.error,elapsedMs:Date.now()-started});if(!res.headersSent)res.status(safe.status).json(safe.body);}
  finally{input=null;deadline.close();}
 });return router;
}
module.exports={createBrowserInputRouter,schemas};
