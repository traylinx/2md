'use strict';
const c=require('./contracts');
const {endpoint,jsonBody}=require('./dispatch');
const {Deadline}=require('../capture/deadline');
// Service-authenticated current membership lookup. No persisted human bearer,
// caller-supplied arbitrary subject, role cache or fallback to plan-time role.
function createOwnerPrincipalResolver({url,sdk,agentUserId,fetchImpl=fetch}={}) {
  const target=endpoint(url);c.identifier(agentUserId);
  if(typeof sdk?.getAgentRequestHeaders!=='function')c.deny('UNAVAILABLE');
  return async (input,signal)=>{
    const plan=c.plan(input),deadline=new Deadline(5000,signal);
    try {
      const raw=await deadline.run(()=>sdk.getAgentRequestHeaders()),headers=new Headers(raw),token=headers.get('x-agent-secret-token');
      if(headers.get('x-agent-user-id')!==agentUserId||!token||!/^[^\s,]{1,16384}$/.test(token))c.deny('UNAUTHENTICATED');
      const response=await deadline.run(()=>fetchImpl(target,{method:'POST',redirect:'error',cache:'no-store',signal:deadline.signal,
        headers:{'Content-Type':'application/json','X-Agent-User-Id':agentUserId,'X-Agent-Secret-Token':token},
        body:JSON.stringify({authSubject:plan.authSubject,workspaceUserId:plan.workspaceUserId,organizationId:plan.organizationId,projectId:plan.projectId,...(plan.principalKind==='agent'?{principalKind:'agent',authorizationRef:c.authorizationRef(plan.authorizationRef)}:{})})}));
      if(response.status!==200 || response.redirected || (response.url&&response.url!==target) ||
         response.headers.get('content-type')?.split(';')[0]!=='application/json'||response.headers.get('cache-control')!=='no-store') {
        void response.body?.cancel().catch(()=>{});c.deny(response.status===401?'UNAUTHENTICATED':[403,404].includes(response.status)?'FORBIDDEN':'UNAVAILABLE');}
      const actor=c.executionPrincipal(await jsonBody(response,deadline,4096));c.bindPrincipal(actor,plan);return actor;
    }catch(error){if(error instanceof c.WebBoundaryError)throw error;c.deny(signal?.aborted?'CANCELLED':'UNAVAILABLE');}
    finally{deadline.close();}
  };
}
module.exports={createOwnerPrincipalResolver};
