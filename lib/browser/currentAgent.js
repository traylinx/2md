'use strict';
const c=require('./contracts');
const {endpoint,jsonBody}=require('../web/dispatch');
const {Deadline}=require('../capture/deadline');
// Same service-authenticated owner-access contract used by READ. Revalidate the
// exact token generation by reference; no customer bearer is retained for sweeps.
function createCurrentAgentResolver({url,sdk,agentId,fetchImpl=fetch}={}){
 const target=endpoint(url);c.validate(c.id,agentId);
 if(typeof sdk?.getAgentRequestHeaders!=='function')c.deny('UNAVAILABLE');
 return async function current(value,{signal}={}){
  const prior=c.actor(value);return require('./authorityScope').memo('current:'+c.digest(prior),async()=>{
  const deadline=new Deadline(5000,signal);
  try{
   const headers=new Headers(await deadline.run(()=>sdk.getAgentRequestHeaders())),token=headers.get('x-agent-secret-token');
   if(headers.get('x-agent-user-id')!==agentId||!token||!/^[^\s,]{1,16384}$/.test(token))c.deny('UNAUTHENTICATED');
   const response=await deadline.run(()=>fetchImpl(target,{method:'POST',redirect:'error',cache:'no-store',signal:deadline.signal,headers:{'Content-Type':'application/json','X-Agent-User-Id':agentId,'X-Agent-Secret-Token':token},body:JSON.stringify({...c.identity(prior),principalKind:'agent',authorizationRef:prior.authorizationRef})}));
   if(response.status!==200||response.redirected||(response.url&&response.url!==target)||response.headers.get('cache-control')!=='no-store'||response.headers.get('content-type')?.split(';')[0]!=='application/json'){
    void response.body?.cancel().catch(()=>{});c.deny([401,403,404].includes(response.status)?'PERMISSION_REQUIRED':'AUTHORITY_UNAVAILABLE');
   }
   const fresh=c.actor(await jsonBody(response,deadline,4096));
   if(c.digest(c.identity(fresh))!==c.digest(c.identity(prior))||c.digest(fresh.authorizationRef)!==c.digest(prior.authorizationRef)||fresh.authorizationRef.expiresAt<=Date.now())c.deny('PERMISSION_REQUIRED');
   return fresh;
  }catch(error){if(error instanceof c.BrowserError)throw error;c.deny(signal?.aborted?'CANCELLED':'AUTHORITY_UNAVAILABLE');}finally{deadline.close();}
  });
 };
}
module.exports={createCurrentAgentResolver};
