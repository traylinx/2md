'use strict';
const express=require('express');
const c=require('./contracts');
const {createSessionManager}=require('./sessionManager');
const {createPersistentWorkerFactory}=require('./workerAdapter');
const {createRemoteInput}=require('./remoteInput');
const {createCompletionVerifier}=require('./completionProof');
const {createConsentVerifier}=require('./consent');
const {createHostVerifier}=require('./hostProof');
const {createBrowserService}=require('./service');
const {createBrowserRouter}=require('../../routes/browser');
const {createBrowserInputRouter}=require('../../routes/browserInput');

function validateWorkerOutput(name,result){
 if(['browser_observe','browser_extract'].includes(name))return c.parseResult(name,result);
 if(['browser_act','browser_navigate','human_input'].includes(name))return c.parse(c.obj({state:{const:'active'}}),result);
 if(name==='browser_authenticate')return c.parse(c.authenticationSchema,result);
 c.deny('UNSUPPORTED');
}
// Dedicated runtime, not imported by the legacy capture server. Mandatory
// authorize resolves CURRENT authority on every call, including sweep callbacks;
// resolveCaller validates current Sentinel identity before reading request bodies.
function createBrowserRuntime({authorize,resolveCaller,consumeNonce,lease,privateEnabled=false,agentInputHosts=[],embeddedFrames=false,humanEnabled=false,
 resolveHuman,pairingOrigin,enrollment,resolveEnrollmentPrincipal,executablePath,tempRoot,workerFactory=createPersistentWorkerFactory,runtimeEpoch,autoSweep=true}={}){
 if(enrollment&&(!resolveHuman||!resolveEnrollmentPrincipal))c.deny('UNAVAILABLE');
 if([authorize,resolveCaller,consumeNonce,lease,workerFactory].some(f=>typeof f!=='function'))c.deny('UNAVAILABLE');
 let manager,stopped=false;const bindings=new Map();
 async function grantFor(id,bound){const g=await authorize(bound);if(!g||g.grantId!==id)c.deny('PERMISSION_REQUIRED');return g;}
 c.validate({type:'array',items:c.id,minItems:0,maxItems:100,uniqueItems:true},agentInputHosts);
 const delegatedHosts=new Set(agentInputHosts);
 // This callback adds only operator delegation policy. Every broker operation
 // already uses manager.describe (fresh current grant + exact session); capabilities
 // already authorize the current grant. Repeating remote authority here caused
 // nested lookups to exhaust the protected transport deadline before admission.
 async function agentAuthorized(bound){return privateEnabled&&!stopped&&delegatedHosts.has(bound.hostId);}
 const pairing=privateEnabled?require('./ownerPairing').createOwnerPairing({authorize:grantFor}):null;
 const completion=createCompletionVerifier({authorize:grantFor,consumeNonce});
 const consent=createConsentVerifier({authorize,consumeNonce});
 const broker=createRemoteInput({describeSession:(b,id)=>manager.describe(b,id),verifyCompletion:completion,verifyDecision:consent,agentAuthorized});
 const operations=require('./operationBroker').createOperationBroker({describeSession:(b,id)=>manager.describe(b,id),verifyDecision:consent,agentAuthorized,humanAuthorized:(b,input)=>manager.verifyHuman(b,input),onPending:(b,p)=>manager.suspend(b,p)});
 const spawn=workerFactory({lease,executablePath,tempRoot,interventionsEnabled:privateEnabled,embeddedFrames,humanEnabled,protectedInputForSession:id=>{
  const b=bindings.get(id);if(!b)c.deny('SESSION_LOST');const credentials=broker.provider(b);return {...credentials,
   async requestDecision(record,options){try{return await operations.request(b,record,options);}finally{if(!options?.signal?.aborted)await manager.resumePending(b,{sessionId:id,interventionId:record.operationId});}},
   verifyDecision:(proof,record)=>operations.has(b,record.operationId)?operations.verified(b,proof,record):credentials.verifyDecision(proof,record),
  };
 }});
 manager=createSessionManager({authorize,runtimeEpoch,autoSweep,privateEnabled,humanEnabled,validateOutput:validateWorkerOutput,
  async createWorker(input,context){
   const bound=c.binding(context.bound);bindings.set(input.sessionId,bound);
   function clear(){operations.discardSession(bound,input.sessionId);broker.discardSession(bound,input.sessionId);bindings.delete(input.sessionId);}
   try{const worker=await spawn(input);return {
    async execute(name,request,options){
     try{return await worker.execute(name,request,options);}
     catch(error){
      if(name==='browser_authenticate'&&['HUMAN_REQUIRED','VERIFICATION_PENDING','VERIFICATION_FAILED'].includes(error.code))broker.allowReplacement(bound,request);
      throw error;
     }
    },
    async dispose(){try{await worker.dispose();}finally{clear();}},
   };}catch(error){clear();throw error;}
  },
 });
 const service=createBrowserService({manager,authorize,credentialService:privateEnabled?input=>broker.request(input):undefined,privateReady:async()=>privateEnabled&&!stopped,agentInputReady:agentAuthorized,embeddedFrames,humanEnabled});
 const verify=createHostVerifier({authorize:grantFor,consumeNonce});
 const identity={resolveCaller,async verifyHost({bound,request,method,path,body}){
  for(const name of ['x-browser-host-proof','x-browser-grant-id']){
   if(request.rawHeaders.filter((x,i)=>i%2===0&&x.toLowerCase()===name).length!==1)c.deny('UNAUTHENTICATED');
  }
  return verify({bound,proof:request.headers['x-browser-host-proof'],grantId:request.headers['x-browser-grant-id'],method,path,body});
 }};
 const app=express();app.disable('x-powered-by');
 app.use((_req,res,next)=>{if(stopped)return res.status(503).set('Cache-Control','no-store').json({error:'UNAVAILABLE'});next();});
 app.get('/health',(_req,res)=>{const healthy=!manager.diagnostics().quarantined;res.status(healthy?200:503).set('Cache-Control','no-store').json({status:healthy?'ok':'quarantined'});});
 app.use('/api/browser/v1',require('../../routes/browserHost').createBrowserHostRouter({...identity,manager,pairing,authorize}));
 app.use('/api/browser/v1',require('../../routes/browserHuman').createBrowserHumanRouter({enabled:humanEnabled&&privateEnabled,...identity,manager,operations}));
 // Protected routes must precede the browser router's terminal 404 handler.
 if(privateEnabled)app.use('/api/browser/v1',createBrowserInputRouter({enabled:true,...identity,broker,operations}));
 if(enrollment)app.use('/api/browser/enrollment/v1',require('../../routes/browserEnrollment').createBrowserEnrollmentRouter({enrollment,resolvePrincipal:resolveEnrollmentPrincipal,consumeNonce}));
 if((pairing||enrollment)&&resolveHuman)app.use('/api/browser/control/v1',require('../../routes/browserControl').createBrowserControlRouter({enabled:true,resolveHuman,grantsEnabled:false,pairing,pairingOrigin,enrollment}));
 app.use('/api/browser/v1',createBrowserRouter({enabled:true,...identity,service}));
 return Object.freeze({app,manager,service,broker,operations,async stop(){stopped=true;try{await manager.shutdown();}finally{operations.close();broker.close();pairing?.close();enrollment?.close();bindings.clear();}}});
}
module.exports={createBrowserRuntime,validateWorkerOutput};
