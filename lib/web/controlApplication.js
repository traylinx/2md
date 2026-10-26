'use strict';
const express=require('express');
const c=require('./contracts');
const {Deadline}=require('../capture/deadline');
const {createConfirmationControl}=require('./confirmationControl');
const {createConfirmationAuthority}=require('./confirmationAuthority');
const {createPostgresAdmission}=require('./postgresAdmission');
const {createPublicKey}=require('node:crypto');
// Separate listener composition: no proposal, admission, execution or result route.
// The authenticated session resolver remains owned by the human login boundary.
function createControlApplication({enabled=false,origin,privateKey,issuer,keyId,
  resolveSession,pool,authorizeOwner,policyVersion}={}){
 const app=express();app.disable('x-powered-by');
 if(enabled!==true){app.use((_req,res)=>res.status(404).set('Cache-Control','no-store').json({error:'NOT_FOUND'}));return Object.freeze({app});}
 if(typeof resolveSession!=='function'||typeof authorizeOwner!=='function')c.deny('UNAVAILABLE');
 let publicKey;try{publicKey=createPublicKey(privateKey).export({type:'spki',format:'pem'});}catch{c.deny('UNAVAILABLE');}
 const repository=createPostgresAdmission({pool,policyVersion,authorizeConfirmation:createConfirmationAuthority({publicKey,issuer,keyId})});
 async function currentPlan({planId,principal,signal}){
   const actor=c.executionPrincipal(principal),deadline=new Deadline(5000,signal);
   try{
     const plan=await deadline.run(()=>repository.loadPlan({planId,principal:actor}));
     const current=c.executionPrincipal(await deadline.run(()=>authorizeOwner(plan,deadline.signal)));
     c.bindPrincipal(current,plan);c.bindPrincipal(actor,plan);
     return {plan,principal:current};
   }catch(error){if(error instanceof c.WebBoundaryError)throw error;c.deny('UNAVAILABLE');}
   finally{deadline.close();}
 }
 app.use('/confirm',createConfirmationControl({origin,privateKey,issuer,keyId,resolveSession,
   loadPlan:async input=>(await currentPlan(input)).plan,
   confirm:async input=>{
     // Recheck current membership immediately before durable confirmation.
     const current=await currentPlan(input);
     return repository.confirm({...input,principal:current.principal});
   }
 }));
 app.use((_req,res)=>res.status(404).set('Cache-Control','no-store').json({error:'NOT_FOUND'}));
 return Object.freeze({app});
}
module.exports={createControlApplication};
