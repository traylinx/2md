'use strict';
const c=require('./contracts');
const {createLocalOwnerSession}=require('./localOwnerSession');
const {createCredentialSurface}=require('./credentialSurface');
const {createRemoteCredentialProvider}=require('./remoteCredentialProvider');
// Generic local host setup, with no vendor or website branch. All authority
// checks/exchanges use signed transport, never model tool arguments.
async function createProtectedHost({client,bound,grantId,privateKey}={}){
 if(typeof client?.protectedCall!=='function')c.deny('UNAVAILABLE');
 const pairing=createLocalOwnerSession({bound,grantId,control:{
  begin:(_bound,input)=>client.protectedCall('pair-begin',input),
  exchange:(_bound,input)=>client.protectedCall('pair-exchange',input),
 },authorizeOwner:async({owner})=>(await client.protectedCall('owner-check',{owner})).authorized===true});
 // Context originates only from the surface's verified HttpOnly owner session.
 const provider=createRemoteCredentialProvider({client,bound,grantId,privateKey,verifyOwner:async context=>{
  if((await client.protectedCall('owner-check',{owner:context})).authorized!==true)c.deny('FORBIDDEN');return context;
 }});
 const verifyOwner=async context=>{if((await client.protectedCall('owner-check',{owner:context})).authorized!==true)c.deny('FORBIDDEN');return context;};
 const decisions=require('./authDecisionHost').createAuthDecisionHost({client,bound,grantId,privateKey,verifyOwner});
 let surface;
 try{surface=await createCredentialSurface({provider,pairing,decisions,ownerContext:pairing.ownerContext});}
 catch(error){pairing.close();decisions.close();throw error;}
 return Object.freeze({
  async call(name,input,options){
   if(name==='browser_authenticate'){
    const status=await client.call('browser_action_status',{runtimeEpoch:input.runtimeEpoch,actionId:input.actionId,sessionId:input.sessionId},options);
    // An existing server receipt is authoritative; original endpoint enforces digest/idempotency.
    if(status.state!=='outcome_unknown')return client.call(name,input,options);
    if(status.sessionId)return status; // Known uncertain outcome is never re-executed.
    const decision=await decisions.request(input);
    if(!decision.ready)return c.parseResult(name,{runtimeEpoch:input.runtimeEpoch,actionId:input.actionId,sessionId:input.sessionId,state:'needs_input',output:{state:'needs_input',interventionId:decision.id,reason:'operation_consent',expiresAt:decision.expiresAt,inputUrl:surface.decisionUrl(decision.id)}});
    const result=await client.call(name,input,options);decisions.release(decision.id);return result;
   }
   const result=await client.call(name,input,options);
   if(name==='browser_credentials'&&result.state==='needs_input')return c.parseResult(name,{...result,inputUrl:surface.urlFor(result.interventionId)});
   return result;
  },
  protectedCall:(...args)=>client.protectedCall(...args),
  beginPairing:()=>surface.beginPairing(),credentialUrl:id=>surface.urlFor(id),close:()=>surface.close()});
}
module.exports={createProtectedHost};
