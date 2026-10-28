'use strict';
const {sign,verify,createPublicKey,randomUUID}=require('node:crypto');
const c=require('./contracts');
const AUDIENCE='traylinx-browser-input-completion-v1';
const hex={type:'string',minLength:64,maxLength:64,pattern:'^[a-f0-9]{64}$'};
const schema=c.obj({audience:{const:AUDIENCE},grantId:c.id,scope:hex,ownerId:c.id,entryDigest:hex,nonce:c.id,issuedAt:c.num(1,Number.MAX_SAFE_INTEGER),expiresAt:c.num(1,Number.MAX_SAFE_INTEGER)});
function entry(record){return {interventionId:record.interventionId,sessionId:record.sessionId,ownerId:record.ownerId,origin:record.origin,recipients:record.recipients,expiresAt:record.expiresAt};}
// Only the paired local input handler invokes this signer, never an MCP tool.
function createCompletionSigner({privateKey,bound,grantId,verifyOwner,now=Date.now}={}){
 const binding=c.binding(bound);if(typeof verifyOwner!=='function')c.deny('UNAVAILABLE');
 return async function complete(record,context){
  const owner=await verifyOwner(context);
  if(!owner||owner.workspaceUserId!==record.ownerId||owner.organizationId!==binding.principal.organizationId||owner.projectId!==binding.principal.projectId||record.expiresAt<=now())c.deny('FORBIDDEN');
  const data=c.parse(schema,{audience:AUDIENCE,grantId,scope:c.scope(binding),ownerId:record.ownerId,entryDigest:c.digest(entry(record)),nonce:randomUUID(),issuedAt:now(),expiresAt:Math.min(record.expiresAt,now()+120000)});
  const payload=Buffer.from(JSON.stringify(data)).toString('base64url');return payload+'.'+sign(null,Buffer.from(AUDIENCE+'.'+payload),privateKey).toString('base64url');
 };
}
function createCompletionVerifier({authorize,consumeNonce,now=Date.now}={}){
 if(typeof authorize!=='function'||typeof consumeNonce!=='function')c.deny('UNAVAILABLE');
 return async function check(proof,bound,record){
  const binding=c.binding(bound);if(typeof proof!=='string'||proof.length>8192)c.deny('FORBIDDEN');
  const parts=proof.split('.');if(parts.length!==2||parts.some(x=>!/^[A-Za-z0-9_-]+$/.test(x)))c.deny('FORBIDDEN');
  let data;try{data=c.parse(schema,JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8')));}catch{c.deny('FORBIDDEN');}
  const grant=await authorize(data.grantId,binding);
  if(!grant||grant.revoked||grant.expiresAt<=now()||grant.hostId!==binding.hostId||grant.hostKeyFingerprint!==binding.hostKeyFingerprint||grant.approvedByWorkspaceUserId!==record.ownerId||c.digest(grant.agent)!==c.digest(c.identity(binding.principal)))c.deny('FORBIDDEN');
  if(data.scope!==c.scope(binding)||data.ownerId!==record.ownerId||data.entryDigest!==c.digest(entry(record))||data.issuedAt>now()||data.expiresAt<=now()||data.expiresAt<=data.issuedAt||data.expiresAt>record.expiresAt||data.expiresAt>grant.expiresAt||data.expiresAt-data.issuedAt>120000)c.deny('FORBIDDEN');
  let valid=false;try{const key=createPublicKey(grant.hostPublicKey);valid=key.asymmetricKeyType==='ed25519'&&c.fingerprint(grant.hostPublicKey)===binding.hostKeyFingerprint&&verify(null,Buffer.from(AUDIENCE+'.'+parts[0]),key,Buffer.from(parts[1],'base64url'));}catch{}
  if(!valid)c.deny('FORBIDDEN');
  if(await consumeNonce({scope:data.scope,nonce:data.nonce,expiresAt:data.expiresAt})!==true||data.expiresAt<=now())c.deny('FORBIDDEN');return true;
 };
}
module.exports={AUDIENCE,createCompletionSigner,createCompletionVerifier};
