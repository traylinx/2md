'use strict';
const c=require('./contracts');
const {Deadline}=require('../capture/deadline');
const {readJson}=require('./httpClient');
const {signEnrollment}=require('./enrollmentProof');
const {beginSchema}=require('./enrollment');
const pendingSchema=c.obj({enrollmentId:c.id,grantId:c.id,expiresAt:c.num(1,Number.MAX_SAFE_INTEGER)});
const exchangeSchema=c.obj({enrollmentId:c.id,state:c.str(128),code:c.str(128),verifier:c.str(128)});
const completeSchema=c.obj({owner:c.obj({workspaceUserId:c.id,organizationId:c.id,projectId:c.id}),hostId:c.id,hostKeyFingerprint:c.str(64),grantId:c.id});
function createEnrollmentClient({url,organizationId,projectId,agentId,sdk,identity,fetchImpl=fetch}={}){
 let base;try{base=new URL(url);}catch{c.deny('UNAVAILABLE');}
 if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||base.pathname!=='/api/browser/enrollment/v1'||typeof sdk?.getAgentRequestHeaders!=='function')c.deny('UNAVAILABLE');
 for(const id of [organizationId,projectId,agentId,identity?.hostId])c.validate(c.id,id);
 async function request(operation,body,principal,{signal}={}){
  const deadline=new Deadline(10000,signal),target=base.href+'/'+operation;
  try{
   const h=new Headers(await deadline.run(()=>sdk.getAgentRequestHeaders())),token=h.get('x-agent-secret-token');
   if(h.get('x-agent-user-id')!==agentId||!token||!/^[^\s,]{1,16384}$/.test(token))c.deny('UNAUTHENTICATED');
   const headers={'Content-Type':'application/json',Accept:'application/json','X-Agent-User-Id':agentId,'X-Agent-Secret-Token':token,'X-Organization-Id':organizationId,'X-Project-Id':projectId};
   if(principal)headers['X-Browser-Enrollment-Proof']=signEnrollment({...identity,principal,path:base.pathname+'/'+operation,body});
   const response=await deadline.run(()=>fetchImpl(target,{method:'POST',redirect:'error',cache:'no-store',credentials:'omit',signal:deadline.signal,headers,body:JSON.stringify(body)}));
   if(response.redirected||response.url&&response.url!==target||response.headers.get('cache-control')!=='no-store'||response.headers.get('content-type')?.split(';')[0]!=='application/json'){void response.body?.cancel().catch(()=>{});c.deny('UNAVAILABLE');}
   const value=await readJson(response,deadline,8192);
   if(!response.ok){const safe=c.publicError(new c.BrowserError(value?.error));if(safe.body.error===value?.error&&safe.status===response.status)c.deny(value.error);c.deny('UNAVAILABLE');}
   return value;
  }catch(e){if(e instanceof c.BrowserError)throw e;c.deny(signal?.aborted?'CANCELLED':'UNAVAILABLE');}finally{deadline.close();}
 }
 function scope(p){const value=c.actor(p);if(value.organizationId!==organizationId||value.projectId!==projectId)c.deny('FORBIDDEN');return value;}
 return Object.freeze({
  async identify(options){return scope(await request('identity',{},null,options));},
  async begin(principal,input,options){const parsed=c.parse(beginSchema,input);if(parsed.hostId!==identity.hostId||parsed.hostPublicKey!==identity.hostPublicKey)c.deny('FORBIDDEN');const result=c.parse(pendingSchema,await request('begin',parsed,scope(principal),options));if(result.expiresAt<=Date.now()||result.expiresAt>Date.now()+120000)c.deny('UNAVAILABLE');return result;},
  async exchange(principal,input,options){const p=scope(principal),result=c.parse(completeSchema,await request('exchange',c.parse(exchangeSchema,input),p,options));if(result.hostId!==identity.hostId||result.hostKeyFingerprint!==identity.hostKeyFingerprint||result.owner.organizationId!==organizationId||result.owner.projectId!==projectId)c.deny('FORBIDDEN');return result;},
 });
}
module.exports={createEnrollmentClient};
