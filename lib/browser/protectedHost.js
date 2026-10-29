'use strict';
const c=require('./contracts');
const {createLocalOwnerSession}=require('./localOwnerSession');
const {createCredentialSurface}=require('./credentialSurface');
const {createRemoteCredentialProvider}=require('./remoteCredentialProvider');
// Generic local host setup, with no vendor or website branch. All authority
// checks/exchanges use signed transport, never model tool arguments.
async function createProtectedHost({client,bound,grantId,privateKey,ownerSetupUrl}={}){
 if(typeof client?.protectedCall!=='function')c.deny('UNAVAILABLE');
 let setupBase,pendingPairing;if(ownerSetupUrl){setupBase=new URL(ownerSetupUrl);if(setupBase.protocol!=='https:'||setupBase.username||setupBase.password||setupBase.search||setupBase.hash||setupBase.pathname!=='/admin/browser/connect')c.deny('UNAVAILABLE');}
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
 const operations=require('./operationHost').createOperationHost({client,bound,grantId,privateKey,verifyOwner});
 let surface;
 try{surface=await createCredentialSurface({provider,pairing,decisions,operations,ownerContext:pairing.ownerContext});}
 catch(error){pairing.close();decisions.close();operations.close();throw error;}
 function decorate(result){if(result.state==='needs_input'&&['recipient_consent','operation_consent'].includes(result.output?.reason))return {...result,output:{...result.output,inputUrl:surface.operationUrl(result.output.interventionId)}};return result;}
 return Object.freeze({
  async call(name,input,options){
   if(name==='browser_authenticate'){
    const status=await client.call('browser_action_status',{runtimeEpoch:input.runtimeEpoch,actionId:input.actionId,sessionId:input.sessionId},options);
    // An existing server receipt is authoritative; original endpoint enforces digest/idempotency.
    if(status.state!=='outcome_unknown')return decorate(await client.call(name,input,options));
    if(status.sessionId)return status; // Known uncertain outcome is never re-executed.
    let decision=await decisions.request(input);
    sweep();const approved=approvals.get(input.credentialRef);
    if(!decision.ready&&approved){
     if(approved.usernameSubmitted&&!Array.isArray(input.fields)&&!input.fields.passwordRef){decisions.release(decision.id);c.deny('PERMISSION_REQUIRED');}
     const record=await decisions.inspect(decision.id,approved.owner);
     if(!require('./fieldInput').matches(approved.record,input))c.deny('PERMISSION_REQUIRED');
     if(record.sessionId!==approved.record.sessionId||record.origin!==approved.record.origin||c.digest(record.recipients)!==c.digest(approved.record.recipients))c.deny('RECIPIENT_PERMISSION_REQUIRED');
     // One username stage followed by one password attempt, never password retries.
     if(Array.isArray(input.fields)||input.fields.passwordRef)approvals.delete(input.credentialRef);
     else approvals.set(input.credentialRef,c.frozen({...approved,usernameSubmitted:true}));
     await decisions.approve(decision.id,approved.owner);decision=await decisions.request(input);
    }
    if(!decision.ready)return c.parseResult(name,{runtimeEpoch:input.runtimeEpoch,actionId:input.actionId,sessionId:input.sessionId,state:'needs_input',output:{state:'needs_input',interventionId:decision.id,reason:'operation_consent',expiresAt:decision.expiresAt,inputUrl:surface.decisionUrl(decision.id)}});
    try{const result=await client.call(name,input,options);if(!['running','needs_input'].includes(result.state)&&result.output?.state!=='login_submitted')approvals.delete(input.credentialRef);return decorate(result);}catch(error){approvals.delete(input.credentialRef);throw error;}finally{decisions.release(decision.id);}
   }
   const result=await client.call(name,input,options);
   if(name==='get_browser_capabilities'&&setupBase&&result.available.includes('browser_credentials')&&!await pairing.isPaired()){
    if(!pendingPairing||pendingPairing.expiresAt<=Date.now())pendingPairing=await surface.beginPairing();
    const url=new URL(setupBase);url.searchParams.set('pairingId',pendingPairing.pairingId);url.searchParams.set('organizationId',bound.principal.organizationId);url.searchParams.set('projectId',bound.principal.projectId);
    return c.parseResult(name,{...result,ownerConnection:{url:url.href,hostKeyFingerprint:bound.hostKeyFingerprint,expiresAt:pendingPairing.expiresAt}});
   }
   if(name==='browser_credentials'&&result.state==='needs_input')return c.parseResult(name,{...result,inputUrl:surface.urlFor(result.interventionId)});
   return decorate(result);
  },
  protectedCall:(...args)=>client.protectedCall(...args),
  beginPairing:()=>surface.beginPairing(),credentialUrl:id=>surface.urlFor(id),close:()=>{approvals.clear();return surface.close();}});
}
module.exports={createProtectedHost};
