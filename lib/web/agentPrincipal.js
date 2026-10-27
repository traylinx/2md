'use strict';
const c=require('./contracts');const {endpoint,jsonBody}=require('./dispatch');const {Deadline}=require('../capture/deadline');
function createAgentPrincipalResolver({url,fetchImpl=fetch}={}){
 const target=endpoint(url);
 return async({agentProof,authorization,organizationId,projectId,signal}={})=>{
 if(authorization)c.deny('UNAUTHENTICATED');c.exact(agentProof,['agentId','token']);
 const agentId=c.identifier(agentProof.agentId),token=agentProof.token;
 if(typeof token!=='string'||!/^[^\s,\x00-\x1f\x7f]{1,16384}$/.test(token))c.deny('UNAUTHENTICATED');
 c.identifier(organizationId);c.identifier(projectId);const deadline=new Deadline(5000,signal);
 try{
 const u=new URL(target);u.searchParams.set('organization_id',organizationId);u.searchParams.set('project_id',projectId);
 const response=await deadline.run(()=>fetchImpl(u.href,{method:'GET',redirect:'error',cache:'no-store',signal:deadline.signal,
 headers:{Accept:'application/json','X-Agent-User-Id':agentId,'X-Agent-Secret-Token':token}}));
 if(response.status!==200||response.redirected||(response.url&&response.url!==u.href)||response.headers.get('cache-control')!=='no-store'||response.headers.get('content-type')?.split(';')[0]!=='application/json'){
 void response.body?.cancel().catch(()=>{});c.deny(response.status===401?'UNAUTHENTICATED':[403,404].includes(response.status)?'FORBIDDEN':'UNAVAILABLE');}
 const actor=c.principal(await jsonBody(response,deadline,4096));
 if(actor.kind!=='agent'||actor.authSubject!==agentId||actor.organizationId!==organizationId||actor.projectId!==projectId)c.deny('FORBIDDEN');
 return actor;
 }catch(error){if(error instanceof c.WebBoundaryError)throw error;c.deny(signal?.aborted?'CANCELLED':'UNAVAILABLE');}finally{deadline.close();}
 };
}
function createCallerResolver({human,agent}){
 if(typeof human!=='function'||typeof agent!=='function')c.deny('UNAVAILABLE');
 return input=>{if(input.agentProof){if(input.authorization)c.deny('UNAUTHENTICATED');return agent(input);}return human(input);};
}
module.exports={createAgentPrincipalResolver,createCallerResolver};
