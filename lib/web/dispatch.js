'use strict';
const c = require('./contracts');
const { Deadline } = require('../capture/deadline');
function reference(input) {
  c.exact(input, ['executionId','planDigest','workerId','fence']);
  if (typeof input.planDigest !== 'string' || !/^[a-f0-9]{64}$/.test(input.planDigest) ||
      typeof input.fence !== 'string' || !/^[1-9][0-9]{0,18}$/.test(input.fence)) c.deny();
  return Object.freeze({executionId:c.identifier(input.executionId),planDigest:input.planDigest,
    workerId:c.identifier(input.workerId),fence:input.fence});
}
function endpoint(value) {
  let u;try { u=new URL(value); } catch { c.deny('UNAVAILABLE'); }
  if(u.protocol!=='https:' || u.username || u.password || u.search || u.hash) c.deny('UNAVAILABLE');
  return u.href;
}
async function jsonBody(response, deadline, limit) {
  if(!response.body) c.deny('UNAVAILABLE');
  const reader=response.body.getReader(), chunks=[];let size=0;
  try {
    for(;;) {const {done,value}=await deadline.run(()=>reader.read());if(done) break;
      size+=value.length;if(size>limit) c.deny('UNAVAILABLE');chunks.push(Buffer.from(value));}
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {void reader.cancel().catch(()=>{});}
}
// Uses only service SDK proof. Never forwards a customer Authorization header.
function createDispatchClient({url,sdk,agentUserId,fetchImpl=fetch}={}) {
  const target=endpoint(url);c.identifier(agentUserId);
  if(typeof sdk?.getAgentRequestHeaders!=='function') c.deny('UNAVAILABLE');
  return async (input,signal)=>{
    const ref=reference(input),deadline=new Deadline(180000,signal);
    try {
      const raw=await deadline.run(()=>sdk.getAgentRequestHeaders());
      const headers=new Headers(raw),token=headers.get('x-agent-secret-token');
      if(headers.get('x-agent-user-id')!==agentUserId || !token || !/^[^\s,]{1,16384}$/.test(token)) c.deny('UNAUTHENTICATED');
      const response=await deadline.run(()=>fetchImpl(target,{method:'POST',redirect:'error',cache:'no-store',signal:deadline.signal,
        headers:{'Content-Type':'application/json','X-Agent-User-Id':agentUserId,'X-Agent-Secret-Token':token},body:JSON.stringify(ref)}));
      if(response.status!==200 || response.redirected || (response.url && response.url!==target) ||
         response.headers.get('content-type')?.split(';')[0]!=='application/json' || response.headers.get('cache-control')!=='no-store') {
        void response.body?.cancel().catch(()=>{});c.deny('UNAVAILABLE');}
      const result=await jsonBody(response,deadline,2*1024*1024+16384);
      c.exact(result,['executionId','planDigest','state','result']);
      if(result.executionId!==ref.executionId || result.planDigest!==ref.planDigest || !['complete','partial','failed'].includes(result.state)) c.deny('UNAVAILABLE');
      return Object.freeze(result);
    } catch {c.deny(signal?.aborted?'CANCELLED':'UNAVAILABLE');} finally {deadline.close();}
  };
}
module.exports={reference,endpoint,jsonBody,createDispatchClient};
