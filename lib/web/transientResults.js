'use strict';
const {createHash,randomBytes,createCipheriv,createDecipheriv}=require('node:crypto');
const c=require('./contracts');
const {readResult}=require('./readResult');
const prefix='web-read:{transient-results}:';
const putScript=`
local clock=redis.call('TIME')
local now=tonumber(clock[1])*1000+math.floor(tonumber(clock[2])/1000)
local stale=redis.call('ZRANGEBYSCORE',KEYS[1],'-inf',now)
for _,id in ipairs(stale) do redis.call('HDEL',KEYS[2],id); redis.call('ZREM',KEYS[1],id) end
if redis.call('EXISTS',KEYS[3])==1 then return 0 end
local size=0
for _,n in ipairs(redis.call('HVALS',KEYS[2])) do size=size+tonumber(n) end
if redis.call('ZCARD',KEYS[1])>=128 or size+string.len(ARGV[4])>tonumber(ARGV[5]) then return -1 end
-- Reserve first. A failed payload SET stays conservatively reserved until expiry.
redis.call('ZADD',KEYS[1],now+tonumber(ARGV[1]),ARGV[3])
redis.call('HSET',KEYS[2],ARGV[3],string.len(ARGV[4]))
redis.call('SET',KEYS[3],ARGV[4],'PX',ARGV[1],'NX')
return 1`;
function binding({executionId,planDigest,fence,plan}) {
  const p=c.plan(plan);c.identifier(executionId);
  if(planDigest!==c.digest(p) || typeof fence!=='string' || !/^[1-9][0-9]{0,18}$/.test(fence)) c.deny();
  return JSON.stringify([executionId,planDigest,fence,p.authSubject,p.workspaceUserId,p.organizationId,p.projectId]);
}
function createTransientResults({redis,key,ttlMs=300000,maxBytes=32*1024*1024}={}) {
  if(typeof redis?.eval!=='function' || typeof redis?.get!=='function' || !Buffer.isBuffer(key) || key.length!==32 ||
     !Number.isSafeInteger(ttlMs) || ttlMs<1000 || ttlMs>300000 || !Number.isSafeInteger(maxBytes) || maxBytes<4096 || maxBytes>64*1024*1024) c.deny('UNAVAILABLE');
  const secret=Buffer.from(key);
  function location(ref) {const aad=binding(ref);return {aad,id:createHash('sha256').update(aad).digest('hex')};}
  return Object.freeze({
    async put(ref,value) {
      const result=readResult(value,ref.plan),{aad,id}=location(ref),now=Date.now(),expiresAt=now+ttlMs;
      const nonce=randomBytes(12),enc=createCipheriv('aes-256-gcm',secret,nonce);enc.setAAD(Buffer.from(aad));
      const bytes=Buffer.concat([enc.update(JSON.stringify({expiresAt,result}),'utf8'),enc.final()]);
      const payload=Buffer.concat([nonce,enc.getAuthTag(),bytes]).toString('base64');
      let accepted;try {accepted=await redis.eval(putScript,3,prefix+'index',prefix+'sizes',prefix+id,ttlMs,expiresAt,id,payload,maxBytes);} catch {c.deny('UNAVAILABLE');}
      if(accepted!==1) c.deny(accepted===-1?'CAPACITY':'RESULT_EXISTS');
      return expiresAt;
    },
    async get(ref) {
      const {aad,id}=location(ref);let raw;try {raw=await redis.get(prefix+id);} catch {c.deny('UNAVAILABLE');}
      if(raw===null) c.deny('ARTIFACT_EXPIRED');
      try {
        if(typeof raw!=='string' || raw.length>3*1024*1024) c.deny('INVALID_RESULT');
        const buf=Buffer.from(raw,'base64');const dec=createDecipheriv('aes-256-gcm',secret,buf.subarray(0,12));
        dec.setAAD(Buffer.from(aad));dec.setAuthTag(buf.subarray(12,28));
        const data=JSON.parse(Buffer.concat([dec.update(buf.subarray(28)),dec.final()]).toString('utf8'));
        if(!Number.isSafeInteger(data.expiresAt) || data.expiresAt<=Date.now()) c.deny('ARTIFACT_EXPIRED');
        return {expiresAt:data.expiresAt,result:readResult(data.result,ref.plan)};
      } catch(error) {if(error instanceof c.WebBoundaryError) throw error;c.deny('INVALID_RESULT');}
    }
  });
}
module.exports={createTransientResults};
