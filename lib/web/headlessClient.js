'use strict';
const c=require('./contracts');const {endpoint,jsonBody}=require('./dispatch');const {Deadline}=require('../capture/deadline');
function createHeadlessClient({url,organizationId,projectId,agentId,sdk,fetchImpl=fetch}={}){
 const base=endpoint(url).replace(/\/$/,'');
 for(const id of [organizationId,projectId,agentId])c.identifier(id);
 if(typeof sdk?.getAgentRequestHeaders!=='function')c.deny('UNAVAILABLE');
 async function call(path,method,body,signal,requestHeaders={}){
 const deadline=new Deadline(10000,signal);
 try{
 const proof=new Headers(await deadline.run(()=>sdk.getAgentRequestHeaders()));
 const token=proof.get('x-agent-secret-token');
 if(proof.get('x-agent-user-id')!==agentId||!token||!/^[^\s,]{1,16384}$/.test(token))c.deny('UNAUTHENTICATED');
 const target=new URL(base+path);target.searchParams.set('organizationId',organizationId);target.searchParams.set('projectId',projectId);
 const response=await deadline.run(()=>fetchImpl(target.href,{method,redirect:'error',cache:'no-store',signal:deadline.signal,
 headers:{...requestHeaders,Accept:'application/json','Content-Type':'application/json','X-Agent-User-Id':agentId,'X-Agent-Secret-Token':token},...(body?{body:JSON.stringify(body)}:{})}));
 const trusted=!response.redirected&&(!response.url||response.url===target.href)&&response.headers.get('cache-control')==='no-store'&&response.headers.get('content-type')?.split(';')[0]==='application/json';
 if(!trusted){void response.body?.cancel().catch(()=>{});c.deny('UNAVAILABLE');}
 if(!response.ok){
 const errors={PUBLIC_READ_PERMISSION_REQUIRED:[403],UNAUTHENTICATED:[401],FORBIDDEN:[403],NOT_FOUND:[404],ARTIFACT_EXPIRED:[410],RESULT_NOT_READY:[409],STALE_PLAN:[409],IDEMPOTENCY_CONFLICT:[409],ALREADY_ADMITTED:[409],INVALID_CONFIRMATION:[403],INVALID_INPUT:[400,413,422],TARGET_DENIED:[422],CAPACITY:[429],UNAVAILABLE:[503]};
 const body=await jsonBody(response,deadline,1024);
 const code=body&&typeof body.error==='string'&&Object.hasOwn(errors,body.error)&&errors[body.error].includes(response.status)?body.error:'UNAVAILABLE';
 c.deny(code);
 }
 return await jsonBody(response,deadline,2*1024*1024+16384);
 }catch(e){if(e instanceof c.WebBoundaryError)throw e;c.deny(signal?.aborted?'CANCELLED':'UNAVAILABLE');}finally{deadline.close();}
 }
 return Object.freeze({capabilities:({signal}={})=>call('/capabilities','GET',null,signal),publicAuthorization:({planId,signal})=>call('/plans/'+c.identifier(planId)+'/authorization','GET',null,signal),admitPublic:({planId,signal})=>call('/public-runs','POST',{planId:c.identifier(planId)},signal),admit:({planId,confirmationId,idempotencyKey,signal})=>call('/runs','POST',{planId:c.identifier(planId),confirmationId:c.identifier(confirmationId)},signal,{'Idempotency-Key':c.identifier(idempotencyKey)}),inspect:({planId,signal})=>call('/plans/'+c.identifier(planId),'GET',null,signal),plan:({spec,signal})=>call('/plans','POST',spec,signal),read:({executionId,result=false,signal})=>call('/runs/'+c.identifier(executionId)+(result?'/result':''),'GET',null,signal)});
}
module.exports={createHeadlessClient};
