'use strict';
const express=require('express');
const c=require('../lib/browser/contracts');
const {Deadline}=require('../lib/capture/deadline');
const {readBody}=require('../lib/capture/readBody');
const {captureCredentials}=require('../lib/capture/sentinelPrincipal');
const decisionSchema=c.obj({sessionId:c.id,operationId:c.id,operationDigest:c.str(64),recipients:{type:'array',items:c.origin,minItems:1,maxItems:32,uniqueItems:true},nonce:c.id,expiresAt:c.num(1,Number.MAX_SAFE_INTEGER)});
const schemas=Object.freeze({
 '/input-inspect':c.obj({interventionId:c.id}),
 '/input-supply':c.obj({interventionId:c.id,username:{type:'string',maxLength:4096},password:c.str(4096),proof:c.str(8192)}),
 '/input-prepare':c.obj({request:c.schemas.browser_authenticate,proof:c.str(8192),decision:decisionSchema,recipients:{type:'array',items:c.origin,minItems:1,maxItems:32,uniqueItems:true}}),
 '/input-cancel':c.obj({interventionId:c.id}),
});
// Host channel only: not a CORS endpoint, HTML form action or MCP tool.
function createBrowserInputRouter({enabled=false,resolveCaller,verifyHost,broker}={}){
 const router=express.Router();if(!enabled)return router;
 if(typeof resolveCaller!=='function'||typeof verifyHost!=='function'||!broker)c.deny('UNAVAILABLE');
 for(const [path,schema]of Object.entries(schemas))router.post(path,async(req,res)=>{
  res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});const deadline=new Deadline(10000);let input;
  try{
   if(req.headers.cookie||req.headers.origin||Object.keys(req.query).length)c.deny('FORBIDDEN');if(req.body!==undefined)c.deny('UNAVAILABLE');
   const credentials=captureCredentials(req),bound=c.binding(await deadline.run(()=>resolveCaller({credentials,request:req,deadline})));
   input=c.parse(schema,await readBody(req,65536,deadline));
   await deadline.run(()=>verifyHost({bound,request:req,method:'POST',path:'/api/browser/v1'+path,body:input,signal:deadline.signal}));
   const result=await deadline.run(()=>path==='/input-inspect'?broker.inspect(bound,input.interventionId):path==='/input-supply'?broker.supply(bound,input):path==='/input-prepare'?broker.prepare(bound,input):broker.cancel(bound,input.interventionId));
   const current=c.binding(await deadline.run(()=>resolveCaller({credentials,request:req,deadline})));if(c.scope(current)!==c.scope(bound))c.deny('FORBIDDEN');
   res.json(result);
  }catch(error){const safe=c.publicError(error);if(!res.headersSent)res.status(safe.status).json(safe.body);}
  finally{input=null;deadline.close();}
 });return router;
}
module.exports={createBrowserInputRouter,schemas};
