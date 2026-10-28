'use strict';
const {sign,verify,createPublicKey,randomUUID}=require('node:crypto');
const c=require('./contracts');
const AUDIENCE='traylinx-browser-host-v1';
const schema=c.obj({audience:{const:AUDIENCE},hostId:c.id,grantId:c.id,principalScope:c.str(64),method:{type:'string',enum:['GET','POST']},path:c.str(256),bodyDigest:c.str(64),nonce:c.id,issuedAt:c.num(1,Number.MAX_SAFE_INTEGER),expiresAt:c.num(1,Number.MAX_SAFE_INTEGER)});
function requestPayload({bound,grantId,method,path,body,now=Date.now()}){
  c.validate(c.id,grantId);if(!/^\/api\/browser\/v1\/[a-z-]+$/.test(path))c.deny('INVALID_INPUT');
  return c.parse(schema,{audience:AUDIENCE,hostId:bound.hostId,grantId,principalScope:c.scope(c.binding(bound)),method,path,bodyDigest:c.digest(body),nonce:randomUUID(),issuedAt:now,expiresAt:now+60000});
}
// Host adapter only. Never expose signing as an MCP/model-callable tool.
function signRequest({privateKey,...input}){
  const payload=Buffer.from(JSON.stringify(requestPayload(input))).toString('base64url');
  return payload+'.'+sign(null,Buffer.from(AUDIENCE+'.'+payload),privateKey).toString('base64url');
}
function createHostVerifier({authorize,consumeNonce,now=Date.now}={}){
  if(typeof authorize!=='function'||typeof consumeNonce!=='function')c.deny('UNAVAILABLE');
  return async function verifyRequest({proof,bound,grantId,method,path,body}){
    const b=c.binding(bound);if(typeof proof!=='string'||proof.length>4096)c.deny('UNAUTHENTICATED');
    const parts=proof.split('.');if(parts.length!==2||parts.some(p=>! /^[A-Za-z0-9_-]+$/.test(p)))c.deny('UNAUTHENTICATED');
    let payload;try{payload=c.parse(schema,JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8')));}catch{c.deny('UNAUTHENTICATED');}
    const grant=await authorize(grantId,b);
    if(!grant||grant.revoked||grant.expiresAt<=now()||grant.hostId!==b.hostId||grant.hostKeyFingerprint!==b.hostKeyFingerprint||c.digest(grant.agent)!==c.digest(c.identity(b.principal)))c.deny('PERMISSION_REQUIRED');
    if(payload.hostId!==b.hostId||payload.grantId!==grantId||payload.principalScope!==c.scope(b)||payload.method!==method||payload.path!==path||payload.bodyDigest!==c.digest(body)||payload.issuedAt>now()||payload.expiresAt<=now()||payload.expiresAt<=payload.issuedAt||payload.expiresAt-payload.issuedAt>60000)c.deny('UNAUTHENTICATED');
    let valid=false;try{const key=createPublicKey(grant.hostPublicKey);valid=key.asymmetricKeyType==='ed25519'&&c.fingerprint(grant.hostPublicKey)===b.hostKeyFingerprint&&verify(null,Buffer.from(AUDIENCE+'.'+parts[0]),key,Buffer.from(parts[1],'base64url'));}catch{}
    if(!valid)c.deny('UNAUTHENTICATED');
    if(await consumeNonce({scope:c.scope(b),nonce:payload.nonce,expiresAt:payload.expiresAt})!==true)c.deny('UNAUTHENTICATED');
    if(payload.expiresAt<=now()||grant.expiresAt<=now())c.deny('UNAUTHENTICATED');
    return b;
  };
}
module.exports={AUDIENCE,requestPayload,signRequest,createHostVerifier};
