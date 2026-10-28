'use strict';
const {createPublicKey,verify}=require('node:crypto');
const c=require('./contracts');
const AUDIENCE='traylinx-browser-consent-v1';
const hex={type:'string',minLength:64,maxLength:64,pattern:'^[a-f0-9]{64}$'};
const schema=c.frozen(c.obj({version:{const:1},audience:{const:AUDIENCE},grantId:c.id,
  principalScope:hex,hostId:c.id,sessionId:c.id,operationId:c.id,operationDigest:hex,
  recipients:{type:'array',items:c.origin,minItems:1,maxItems:32,uniqueItems:true},
  nonce:c.id,issuedAt:c.num(1,Number.MAX_SAFE_INTEGER),expiresAt:c.num(1,Number.MAX_SAFE_INTEGER)}));
function decode(value) {
  if(typeof value!=='string'||!/^[A-Za-z0-9_-]+$/.test(value))c.deny('FORBIDDEN');
  const bytes=Buffer.from(value,'base64url');if(bytes.toString('base64url')!==value)c.deny('FORBIDDEN');return bytes;
}
// Called only by the protected control channel, never an MCP approval tool.
// pending is loaded by the runtime, NOT accepted from the model or callback body.
function createConsentVerifier({authorize,consumeNonce,now=Date.now}={}) {
  if(typeof authorize!=='function'||typeof consumeNonce!=='function')c.deny('UNAVAILABLE');
  return async function accept(proof,bound,pending,{signal}={}) {
    const b=c.binding(bound);if(signal?.aborted)c.deny('CANCELLED');
    if(typeof proof!=='string'||proof.length>8192)c.deny('FORBIDDEN');
    const parts=proof.split('.');if(parts.length!==2)c.deny('FORBIDDEN');
    let body;
    try {body=c.parse(schema,JSON.parse(decode(parts[0]).toString('utf8')));}catch{c.deny('FORBIDDEN');}
    const g=await authorize(b,{signal});
    if(!g||g.revoked||g.policyVersion!==c.POLICY||g.expiresAt<=now()||g.hostId!==b.hostId||
      g.hostKeyFingerprint!==b.hostKeyFingerprint||c.digest(g.agent)!==c.digest(c.identity(b.principal)))c.deny('FORBIDDEN');
    if(body.audience!==AUDIENCE||body.principalScope!==c.scope(b)||body.hostId!==b.hostId||body.grantId!==g.grantId||
      body.sessionId!==pending.sessionId||body.operationId!==pending.operationId||body.operationDigest!==pending.operationDigest||
      body.nonce!==pending.nonce||body.issuedAt>now()||body.expiresAt<=now()||body.expiresAt<=body.issuedAt||
      body.expiresAt-body.issuedAt>120000||body.expiresAt>g.expiresAt||body.expiresAt>pending.expiresAt||
      c.digest(body.recipients)!==c.digest(pending.recipients))c.deny('FORBIDDEN');
    let key;try{key=createPublicKey(g.hostPublicKey);if(key.asymmetricKeyType!=='ed25519'||c.fingerprint(g.hostPublicKey)!==b.hostKeyFingerprint)c.deny('FORBIDDEN');}
    catch{c.deny('FORBIDDEN');}
    const signature=decode(parts[1]);
    if(signature.length!==64||!verify(null,Buffer.from(AUDIENCE+'.'+parts[0]),key,signature))c.deny('FORBIDDEN');
    if(signal?.aborted)c.deny('CANCELLED');
    // Atomic compare-and-consume, supplied by the pending-operation owner. Do not
    // consume merely because a client accepted opening an elicitation URL.
    if(await consumeNonce({scope:c.scope(b),sessionId:body.sessionId,operationId:body.operationId,
      operationDigest:body.operationDigest,nonce:body.nonce,expiresAt:body.expiresAt},{signal})!==true)c.deny('FORBIDDEN');
    if(signal?.aborted)c.deny('CANCELLED');
    return c.frozen({sessionId:body.sessionId,operationId:body.operationId,recipients:body.recipients});
  };
}
module.exports={AUDIENCE,schema,createConsentVerifier};
