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
 const approvals=new Map();
 function sweep(){for(const [id,a]of approvals)if(a.record.expiresAt<=Date.now())approvals.delete(id);}
 // Context originates only from the surface's verified HttpOnly owner session.
 const provider=createRemoteCredentialProvider({client,bound,grantId,privateKey,onSupplied:({record,owner})=>{sweep();if(approvals.size>=32)c.deny('CAPACITY');approvals.set(record.interventionId,c.frozen({record,owner}));},verifyOwner:async context=>{
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
    let decision=await decisions.request(input);
    sweep();const approved=approvals.get(input.credentialRef);
    if(!decision.ready&&approved){
     const record=await decisions.inspect(decision.id,approved.owner);
     if(record.sessionId!==approved.record.sessionId||record.origin!==approved.record.origin||c.digest(record.recipients)!==c.digest(approved.record.recipients))c.deny('RECIPIENT_PERMISSION_REQUIRED');
     approvals.delete(input.credentialRef); // One login attempt per supplied set, before transport.
     await decisions.approve(decision.id,approved.owner);decision=await decisions.request(input);
    }
    if(!decision.ready)return c.parseResult(name,{runtimeEpoch:input.runtimeEpoch,actionId:input.actionId,sessionId:input.sessionId,state:'needs_input',output:{state:'needs_input',interventionId:decision.id,reason:'operation_consent',expiresAt:decision.expiresAt,inputUrl:surface.decisionUrl(decision.id)}});
    const result=await client.call(name,input,options);decisions.release(decision.id);return result;
   }
   const result=await client.call(name,input,options);
   if(name==='browser_credentials'&&result.state==='needs_input')return c.parseResult(name,{...result,inputUrl:surface.urlFor(result.interventionId)});
   return result;
  },
  protectedCall:(...args)=>client.protectedCall(...args),
  beginPairing:()=>surface.beginPairing(),credentialUrl:id=>surface.urlFor(id),close:()=>{approvals.clear();return surface.close();}});
}
module.exports={createProtectedHost};
