'use strict';
const {sign,verify,createPublicKey,randomUUID}=require('node:crypto');
const c=require('./contracts');
const AUDIENCE='traylinx-browser-enrollment-v1';
const hex={type:'string',pattern:'^[a-f0-9]{64}$',minLength:64,maxLength:64};
const schema=c.obj({audience:{const:AUDIENCE},scope:hex,path:{enum:['/api/browser/enrollment/v1/begin','/api/browser/enrollment/v1/exchange']},bodyDigest:hex,nonce:c.id,issuedAt:c.num(1,Number.MAX_SAFE_INTEGER),expiresAt:c.num(1,Number.MAX_SAFE_INTEGER)});
function signEnrollment({principal,hostId,hostPublicKey,privateKey,path,body,now=Date.now()}){
 const bound=c.binding({principal,hostId,hostKeyFingerprint:c.fingerprint(hostPublicKey)});
 const data=c.parse(schema,{audience:AUDIENCE,scope:c.scope(bound),path,bodyDigest:c.digest(body),nonce:randomUUID(),issuedAt:now,expiresAt:now+60000});
 const payload=Buffer.from(JSON.stringify(data)).toString('base64url');return payload+'.'+sign(null,Buffer.from(AUDIENCE+'.'+payload),privateKey).toString('base64url');
}
function createEnrollmentVerifier({consumeNonce,now=Date.now}={}){
 if(typeof consumeNonce!=='function')c.deny('UNAVAILABLE');
 return async function check({principal,hostId,hostPublicKey,path,body,proof}){
  if(typeof proof!=='string'||proof.length>4096)c.deny('UNAUTHENTICATED');let data,parts;
  try{parts=proof.split('.');if(parts.length!==2||parts.some(x=>!/^[A-Za-z0-9_-]+$/.test(x)))throw Error();data=c.parse(schema,JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8')));}catch{c.deny('UNAUTHENTICATED');}
  const bound=c.binding({principal,hostId,hostKeyFingerprint:c.fingerprint(hostPublicKey)});
  if(data.scope!==c.scope(bound)||data.path!==path||data.bodyDigest!==c.digest(body)||data.issuedAt>now()||data.expiresAt<=now()||data.expiresAt<=data.issuedAt||data.expiresAt-data.issuedAt>60000)c.deny('UNAUTHENTICATED');
  let valid=false;try{const key=createPublicKey(hostPublicKey);valid=key.asymmetricKeyType==='ed25519'&&verify(null,Buffer.from(AUDIENCE+'.'+parts[0]),key,Buffer.from(parts[1],'base64url'));}catch{}
  if(!valid||await consumeNonce({scope:data.scope,nonce:data.nonce,expiresAt:data.expiresAt})!==true||data.expiresAt<=now())c.deny('UNAUTHENTICATED');return bound;
 };
}
module.exports={signEnrollment,createEnrollmentVerifier};
