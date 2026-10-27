'use strict';
const c=require('./contracts');const {endpoint,jsonBody}=require('./dispatch');const {Deadline}=require('../capture/deadline');
function createHeadlessClient({url,organizationId,projectId,agentId,sdk,fetchImpl=fetch}={}){
 const base=endpoint(url).replace(/\/$/,'');
 for(const id of [organizationId,projectId,agentId])c.identifier(id);
 if(typeof sdk?.getAgentRequestHeaders!=='function')c.deny('UNAVAILABLE');
 async function call(path,method,body,signal){
 const deadline=new Deadline(10000,signal);
 try{
 const proof=new Headers(await deadline.run(()=>sdk.getAgentRequestHeaders()));
 const token=proof.get('x-agent-secret-token');
 if(proof.get('x-agent-user-id')!==agentId||!token||!/^[^\s,]{1,16384}$/.test(token))c.deny('UNAUTHENTICATED');
 const target=new URL(base+path);target.searchParams.set('organizationId',organizationId);target.searchParams.set('projectId',projectId);
 const response=await deadline.run(()=>fetchImpl(target.href,{method,redirect:'error',cache:'no-store',signal:deadline.signal,
 headers:{Accept:'application/json','Content-Type':'application/json','X-Agent-User-Id':agentId,'X-Agent-Secret-Token':token},...(body?{body:JSON.stringify(body)}:{})}));
 if(!response.ok||response.redirected||(response.url&&response.url!==target.href)||response.headers.get('cache-control')!=='no-store'||response.headers.get('content-type')?.split(';')[0]!=='application/json'){
 void response.body?.cancel().catch(()=>{});c.deny(response.status===401?'UNAUTHENTICATED':response.status===403?'FORBIDDEN':response.status===404?'NOT_FOUND':response.status===410?'ARTIFACT_EXPIRED':response.status===409?'RESULT_NOT_READY':'UNAVAILABLE');}
 return await jsonBody(response,deadline,2*1024*1024+16384);
 }catch(e){if(e instanceof c.WebBoundaryError)throw e;c.deny(signal?.aborted?'CANCELLED':'UNAVAILABLE');}finally{deadline.close();}
 }
 return Object.freeze({inspect:({planId,signal})=>call('/plans/'+c.identifier(planId),'GET',null,signal),plan:({spec,signal})=>call('/plans','POST',spec,signal),read:({executionId,result=false,signal})=>call('/runs/'+c.identifier(executionId)+(result?'/result':''),'GET',null,signal)});
}
module.exports={createHeadlessClient};
