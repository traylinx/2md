'use strict';
const c=require('./contracts');
function createSessionLeaseClient({controlUrl,token,allowedPorts=[8291],fetchImpl=fetch}={}) {
  let base;try{base=new URL(controlUrl);}catch{c.deny('UNAVAILABLE');}
  if(!['http:','https:'].includes(base.protocol)||base.username||base.password||base.search||base.hash||
    !token||token.length<32||allowedPorts.some(p=>[8280,8281,8282].includes(p)))c.deny('UNAVAILABLE');
  async function post(path,body,signal) {
    const res=await fetchImpl(new URL(path,base),{method:'POST',redirect:'error',signal,
      headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!res.ok){void res.body?.cancel().catch(()=>{});c.deny(res.status===429?'CAPACITY':'UNAVAILABLE');}
    const text=await res.text();if(Buffer.byteLength(text)>4096)c.deny('UNAVAILABLE');
    try{return JSON.parse(text);}catch{c.deny('UNAVAILABLE');}
  }
  return async function lease({sessionId,limits,expiresAt,signal}) {
    const ttlMs=Math.max(1,Math.min(limits.absoluteMs,expiresAt-Date.now()));
    const value=await post('/lease',{sessionId,ttlMs,maxTrafficBytes:limits.maxTrafficBytes,maxRequests:limits.maxRequests},signal);
    if(typeof value.id!=='string'||!/^[a-f0-9-]{36}$/.test(value.id)||!allowedPorts.includes(value.port)||!Number.isSafeInteger(value.expiresAt))c.deny('UNAVAILABLE');
    let released=false,failure=false,running=false;
    const timer=setInterval(async()=>{
      if(released||running)return;running=true;
      try{await post('/heartbeat',{id:value.id},AbortSignal.timeout(2500));}catch{failure=true;}
      finally{running=false;}
    },15000);timer.unref();
    return {proxyUrl:`http://${base.hostname}:${value.port}`,healthy:()=>!failure&&!released,
      async release(){if(released)return;released=true;clearInterval(timer);return post('/release',{id:value.id},AbortSignal.timeout(2500));}};
  };
}
module.exports={createSessionLeaseClient};
