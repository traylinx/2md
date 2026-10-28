'use strict';
const express=require('express'),c=require('../lib/browser/contracts');
const {Deadline}=require('../lib/capture/deadline');
const {readBody}=require('../lib/capture/readBody');
const {captureCredentials}=require('../lib/capture/sentinelPrincipal');
const {beginSchema}=require('../lib/browser/enrollment');
const {createEnrollmentVerifier}=require('../lib/browser/enrollmentProof');
const exchangeSchema=c.obj({enrollmentId:c.id,state:c.str(128),code:c.str(128),verifier:c.str(128)});
function header(req,name){if(req.rawHeaders.filter((x,i)=>i%2===0&&x.toLowerCase()===name).length!==1||typeof req.headers[name]!=='string')c.deny('UNAUTHENTICATED');return req.headers[name];}
// This listener bootstraps host identity only. It never executes browser actions.
function createBrowserEnrollmentRouter({resolvePrincipal,enrollment,consumeNonce}={}){
 if(typeof resolvePrincipal!=='function'||!enrollment)c.deny('UNAVAILABLE');
 const router=express.Router(),verify=createEnrollmentVerifier({consumeNonce});
 for(const operation of ['identity','begin','exchange'])router.post('/'+operation,async(req,res)=>{
  res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});const deadline=new Deadline(10000);
  try{
   if(req.headers.origin||req.headers.cookie||req.headers.authorization||Object.keys(req.query).length)c.deny('FORBIDDEN');if(req.body!==undefined)c.deny('UNAVAILABLE');
   const credentials=captureCredentials(req),organizationId=header(req,'x-organization-id'),projectId=header(req,'x-project-id');c.validate(c.id,organizationId);c.validate(c.id,projectId);
   const resolve=async()=>{const p=c.actor(await deadline.run(()=>resolvePrincipal({credentials,organizationId,projectId,deadline})));if(p.organizationId!==organizationId||p.projectId!==projectId)c.deny('FORBIDDEN');return p;};
   const principal=await resolve(),input=c.parse(operation==='identity'?c.obj({}):operation==='begin'?beginSchema:exchangeSchema,await readBody(req,8192,deadline));
   let result;
   if(operation==='identity')result=principal;
   else{
    const host=operation==='begin'?{hostId:input.hostId,hostPublicKey:input.hostPublicKey}:await deadline.run(()=>enrollment.host(input.enrollmentId,principal));
    await deadline.run(()=>verify({principal,...host,path:'/api/browser/enrollment/v1/'+operation,body:input,proof:header(req,'x-browser-enrollment-proof')}));
    result=await deadline.run(()=>operation==='begin'?enrollment.begin(principal,input):enrollment.exchange(input.enrollmentId,principal,input));
   }
   const current=await resolve();if(c.digest(current)!==c.digest(principal))c.deny('PERMISSION_REQUIRED');
   const output=JSON.stringify(result);if(Buffer.byteLength(output)>8192)c.deny('LIMIT_EXCEEDED');res.type('application/json').send(output);
  }catch(error){const safe=c.publicError(error);if(!res.headersSent)res.status(safe.status).json(safe.body);}finally{deadline.close();}
 });return router;
}
module.exports={createBrowserEnrollmentRouter};
