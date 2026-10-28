'use strict';
const c=require('./contracts');
const {signRequest}=require('./hostProof');
const {Deadline}=require('../capture/deadline');
const paths=Object.freeze({get_browser_capabilities:'capabilities',browser_open:'sessions',browser_observe:'observe',browser_navigate:'navigate',browser_act:'act',browser_credentials:'credentials',browser_authenticate:'authenticate',browser_extract:'extract',browser_action_status:'action-status',browser_close:'close'});
async function readJson(response,deadline,limit){
 if(!response.body)c.deny('UNAVAILABLE');const reader=response.body.getReader(),chunks=[];let size=0;
 try{for(;;){const {done,value}=await deadline.run(()=>reader.read());if(done)break;size+=value.length;if(size>limit)c.deny('LIMIT_EXCEEDED');chunks.push(Buffer.from(value));}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
 finally{await reader.cancel().catch(()=>{});for(const chunk of chunks)chunk.fill(0);}
}
function createBrowserHttpClient({url,bound,grantId,privateKey,agentId,sdk,fetchImpl=fetch}={}){
 const binding=c.binding(bound);c.validate(c.id,grantId);c.validate(c.id,agentId);
 let base;try{base=new URL(url);}catch{c.deny('UNAVAILABLE');}
 if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||base.pathname.replace(/\/$/,'')!=='/api/browser/v1'||typeof sdk?.getAgentRequestHeaders!=='function')c.deny('UNAVAILABLE');
 base=base.origin+'/api/browser/v1';
 async function transmit(route,input,parseResult,{signal}={}){
  const path='/api/browser/v1/'+route,target=base+'/'+route,deadline=new Deadline(35000,signal);
  try{
   const headers=new Headers(await deadline.run(()=>sdk.getAgentRequestHeaders()));const token=headers.get('x-agent-secret-token');
   if(headers.get('x-agent-user-id')!==agentId||!token||!/^[^\s,]{1,16384}$/.test(token))c.deny('UNAUTHENTICATED');
   const proof=signRequest({bound:binding,grantId,privateKey,method:'POST',path,body:input});
   const response=await deadline.run(()=>fetchImpl(target,{method:'POST',redirect:'error',cache:'no-store',signal:deadline.signal,
    headers:{'Content-Type':'application/json',Accept:'application/json','X-Agent-User-Id':agentId,'X-Agent-Secret-Token':token,
      'X-Browser-Grant-Id':grantId,'X-Browser-Host-Id':binding.hostId,'X-Browser-Host-Proof':proof,
      'X-Organization-Id':binding.principal.organizationId,'X-Project-Id':binding.principal.projectId},body:JSON.stringify(input)}));
   if(response.redirected||response.url&&response.url!==target||response.headers.get('cache-control')!=='no-store'||response.headers.get('content-type')?.split(';')[0]!=='application/json'){void response.body?.cancel().catch(()=>{});c.deny('UNAVAILABLE');}
   const result=await readJson(response,deadline,response.ok?c.LIMITS.maxResultBytes:2048);
   if(!response.ok){const safe=c.publicError(new c.BrowserError(result?.error));if(safe.body.error===result?.error&&safe.status===response.status)c.deny(result.error);c.deny('UNAVAILABLE');}
   return parseResult(result);
  }catch(error){if(error instanceof c.BrowserError)throw error;c.deny(signal?.aborted?'CANCELLED':'UNAVAILABLE');}finally{deadline.close();}
 }
 return Object.freeze({
  call(name,raw,options){const input=c.parseTool(name,raw);return transmit(paths[name],input,result=>c.parseResult(name,result),options);},
  protectedCall(route,raw,options){const schema=require('./inputContracts').schemas['/'+route];if(!schema)c.deny('UNSUPPORTED');const input=c.parse(schema,raw);return transmit(route,input,result=>c.parse(require('./inputContracts').outputs['/'+route],result),options);},
 });
}
module.exports={createBrowserHttpClient,readJson,paths};
