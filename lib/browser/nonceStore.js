'use strict';
const c=require('./contracts');
// Shared atomic replay protection; no credential, payload or private content.
// Redis must retain these TTL keys (no eviction) across browser service restarts.
function createNonceStore({redis,now=Date.now}={}){
 if(typeof redis?.set!=='function')c.deny('UNAVAILABLE');
 return async function consume({scope,nonce,expiresAt}){
  c.validate({type:'string',pattern:'^[a-f0-9]{64}$',minLength:64,maxLength:64},scope);c.validate(c.id,nonce);
  const ttl=expiresAt-now();if(!Number.isSafeInteger(ttl)||ttl<=0||ttl>120000)c.deny('FORBIDDEN');
  try{return await redis.set('browser-v1:nonce:'+c.digest({scope,nonce}),'1','PX',ttl,'NX')==='OK';}
  catch{c.deny('UNAVAILABLE');}
 };
}
module.exports={createNonceStore};
