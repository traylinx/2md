'use strict';
const {createPublicKey,verify}=require('node:crypto');
const c=require('./contracts');
// Verification-only boundary. Signing belongs exclusively to the separate human
// control service, never to the proposer/LLM or this READ runtime.
function createConfirmationAuthority({publicKey,issuer,keyId}={}) {
  let key;
  try{key=createPublicKey(publicKey);if(key.asymmetricKeyType!=='ed25519')throw Error();
    c.identifier(issuer);c.identifier(keyId);
  }catch{c.deny('UNAVAILABLE');}
  function decode(part){
    if(!/^[A-Za-z0-9_-]+$/.test(part))c.deny('INVALID_CONFIRMATION');
    const bytes=Buffer.from(part,'base64url');
    if(bytes.toString('base64url')!==part)c.deny('INVALID_CONFIRMATION');
    return bytes;
  }
  return async function authorize({confirmationProof,principal,planId,planDigest,confirmationId,signal}){
    if(signal?.aborted)c.deny('CANCELLED');
    try{
      if(typeof confirmationProof!=='string'||confirmationProof.length>4096)throw Error();
      const parts=confirmationProof.split('.');if(parts.length!==3)throw Error();
      const [h,p,s]=parts;const header=JSON.parse(decode(h).toString('utf8'));
      c.exact(header,['alg','typ','kid']);
      if(header.alg!=='EdDSA'||header.typ!=='web-confirm+jwt'||header.kid!==keyId)throw Error();
      const signature=decode(s);if(signature.length!==64||!verify(null,Buffer.from(h+'.'+p),key,signature))throw Error();
      const body=JSON.parse(decode(p).toString('utf8'));
      c.exact(body,['iss','aud','scope','sub','workspaceUserId','organizationId','projectId','planId','planDigest','confirmationId','iat','exp']);
      const actor=c.executionPrincipal(principal),now=Math.floor(Date.now()/1000);
      if(body.iss!==issuer||body.aud!=='web-read-confirmation'||body.scope!=='web:confirm'||
        body.sub!==actor.authSubject||body.workspaceUserId!==actor.workspaceUserId||
        body.organizationId!==actor.organizationId||body.projectId!==actor.projectId||
        body.planId!==planId||body.planDigest!==planDigest||body.confirmationId!==confirmationId||
        !Number.isSafeInteger(body.iat)||!Number.isSafeInteger(body.exp)||
        body.iat>now||body.exp<=now||body.exp<=body.iat||body.exp-body.iat>120)throw Error();
      if(signal?.aborted)c.deny('CANCELLED');
      return Object.freeze({confirmationId,planDigest});
    }catch(e){if(e instanceof c.WebBoundaryError&&e.code==='CANCELLED')throw e;c.deny('INVALID_CONFIRMATION');}
  };
}
module.exports={createConfirmationAuthority};
