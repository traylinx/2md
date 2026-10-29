'use strict';
const authorityScope=require('../lib/browser/authorityScope');
const express=require('express'),c=require('../lib/browser/contracts');
const {schemas,outputs}=require('../lib/browser/humanContracts');
const {Deadline}=require('../lib/capture/deadline'),{readBody}=require('../lib/capture/readBody'),{captureCredentials}=require('../lib/capture/sentinelPrincipal');
// Signed host transport only. Pixels and raw input are never MCP tool outputs.
function createBrowserHumanRouter({enabled=false,resolveCaller,verifyHost,manager,operations}={}){
 const router=express.Router();if(!enabled)return router;
 for(const [path,schema]of Object.entries(schemas))router.post(path,(req,res)=>authorityScope.run(async()=>{
  res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});const deadline=new Deadline(35000);let input;
  try{
   if(req.headers.origin||req.headers.cookie||Object.keys(req.query).length)c.deny('FORBIDDEN');if(req.body!==undefined)c.deny('UNAVAILABLE');
   const credentials=captureCredentials(req),bound=c.binding(await deadline.run(()=>resolveCaller({credentials,request:req,deadline})));
   input=c.parse(schema,await readBody(req,20000,deadline));
   await deadline.run(()=>verifyHost({bound,request:req,method:'POST',path:'/api/browser/v1'+path,body:input,signal:deadline.signal}));
   const result=await deadline.run(async()=>{
    if(path==='/human-begin')return manager.beginHuman(bound,input.sessionId,input);
    if(path==='/human-activate')return manager.activateHuman(bound,input);
    if(path==='/human-frame')return manager.humanFrame(bound,input);
    if(path==='/human-input')return manager.humanInput(bound,input);
    if(path==='/human-finish')return manager.finishHuman(bound,input);
    const state=await manager.humanState(bound,input);
    if(path==='/human-decide'){
     await manager.verifyHuman(bound,input);
     if(state.action?.output?.interventionId!==input.operationId)c.deny('FORBIDDEN');
     const record=await operations.inspect(bound,input.operationId);
     if(record.sessionId!==input.sessionId||record.operationDigest!==input.operationDigest)c.deny('FORBIDDEN');
     return input.decision==='deny'?operations.cancel(bound,input.operationId):operations.completeHuman(bound,input);
    }
    if(state.action?.state==='needs_input'){
     const {ownerId,...pending}=await operations.inspect(bound,state.action.output.interventionId);return {...state,pending};
    }
    // One authorized round trip for both status/decision and a fresh frame.
    // No private pixels returned for pending, uncertain or running operations.
    if(path==='/human-view'&&state.state==='human_control'&&!['running','needs_input','outcome_unknown'].includes(state.action?.state))return {...state,frame:await manager.humanFrame(bound,input)};
    return state;
   });
   authorityScope.after();const after=c.binding(await deadline.run(()=>resolveCaller({credentials,request:req,deadline})));if(c.scope(after)!==c.scope(bound))c.deny('FORBIDDEN');
   res.json(c.parse(outputs[path],result));
  }catch(error){const safe=c.publicError(error);if(!res.headersSent)res.status(safe.status).json(safe.body);}
  finally{input=null;deadline.close();}
 }));return router;
}
module.exports={createBrowserHumanRouter};
