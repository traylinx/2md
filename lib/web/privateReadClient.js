'use strict';
const {Deadline}=require('../capture/deadline');
const {CaptureError,DEFINITIONS}=require('../capture/errors');
const {endpoint,jsonBody}=require('./dispatch');
function createPrivateReadClient({url,agentId,sdk,backend,fetchImpl=fetch}){
 const base=endpoint(url).replace(/\/$/,'');
 async function invoke(request,signal,inspect=false){
  const target=base+(inspect?'/login-inspection':'/authenticated');
  const deadline=new Deadline(request.budgetMs+5000,signal);
  try{
   // Reuse fresh server project membership checks, not public grant as private permission.
   await deadline.run(()=>backend.capabilities({signal:deadline.signal}));
   const proof=new Headers(await deadline.run(()=>sdk.getAgentRequestHeaders()));
   const token=proof.get('x-agent-secret-token');
   if(proof.get('x-agent-user-id')!==agentId||!token||!/^[^\s,]{1,16384}$/.test(token))throw new CaptureError('UNAUTHENTICATED');
   const response=await deadline.run(()=>fetchImpl(target,{method:'POST',redirect:'error',cache:'no-store',signal:deadline.signal,
    headers:{Accept:'application/json','Content-Type':'application/json','X-Agent-User-Id':agentId,'X-Agent-Secret-Token':token},body:JSON.stringify(request)}));
   if(response.redirected||(response.url&&response.url!==target)||response.headers.get('cache-control')!=='no-store'||response.headers.get('content-type')?.split(';')[0]!=='application/json'){
    void response.body?.cancel().catch(()=>{});throw new CaptureError('UNAVAILABLE');
   }
   const result=await jsonBody(response,deadline,2*1024*1024+16384);
   if(!response.ok){const code=result&&Object.hasOwn(DEFINITIONS,result.code)&&DEFINITIONS[result.code][0]===response.status?result.code:'UNAVAILABLE';throw new CaptureError(code);}
   if(result?.success!==true||typeof result.markdown!=='string'||result.cache!=='miss'||result.url!==request.url||(inspect&&(result.kind!=='login-inspection'||!result.inspection)))throw new CaptureError('UNAVAILABLE');
   await deadline.run(()=>backend.capabilities({signal:deadline.signal}));
   return result;
  }catch(e){if(e instanceof CaptureError)throw e;throw new CaptureError(signal?.aborted?'CANCELLED':'UNAVAILABLE');}finally{deadline.close();}
 }
 const capture=(request,signal)=>invoke(request,signal);capture.inspect=(request,signal)=>invoke(request,signal,true);return capture;
}
module.exports={createPrivateReadClient};
