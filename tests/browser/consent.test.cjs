'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {sign,generateKeyPairSync}=require('node:crypto');
const c=require('../../lib/browser/contracts');const {AUDIENCE,createConsentVerifier}=require('../../lib/browser/consent');
const {bound,grant,privateKey}=require('./support.cjs');
function fixture() {
 const now=Date.now(),g={...grant(now),policyVersion:c.POLICY,hostKeyFingerprint:bound.hostKeyFingerprint};
 const pending={sessionId:'s1',operationId:'p1',operationDigest:'b'.repeat(64),nonce:'n1',expiresAt:now+120000,recipients:['https://api.unfamiliar.example.org']};
 const body={version:1,audience:AUDIENCE,grantId:g.grantId,principalScope:c.scope(bound),hostId:bound.hostId,...pending,issuedAt:now};
 let consumed=0;
 const accept=createConsentVerifier({now:()=>now,authorize:async()=>g,consumeNonce:async()=>++consumed===1});
 const proof=(extra={},key=privateKey)=>{const p=Buffer.from(JSON.stringify({...body,...extra})).toString('base64url');return p+'.'+sign(null,Buffer.from(AUDIENCE+'.'+p),key).toString('base64url');};
 return {accept,proof,pending,body,g,count:()=>consumed};
}
test('valid enrolled-host consent is exact-operation and single-use',async()=>{
 const f=fixture();assert.deepEqual(await f.accept(f.proof(),bound,f.pending),{sessionId:'s1',operationId:'p1',recipients:f.pending.recipients});
 await assert.rejects(f.accept(f.proof(),bound,f.pending),e=>e.code==='FORBIDDEN');
});
test('wrong signature, audience, account, expiry or recipient cannot authorize an operation',async()=>{
 const f=fixture();
 for(const change of [{audience:'web-read-confirmation'},{principalScope:'c'.repeat(64)},{recipients:['https://evil.example.org']},{expiresAt:1},{operationDigest:'d'.repeat(64)},{approved:true}])
  await assert.rejects(f.accept(f.proof(change),bound,f.pending),e=>e.code==='FORBIDDEN');
 await assert.rejects(f.accept(f.proof({},generateKeyPairSync('ed25519').privateKey),bound,f.pending),e=>e.code==='FORBIDDEN');assert.equal(f.count(),0);
});
test('a displayed URL or elicitation acceptance is never credential consent',async()=>{
 const f=fixture();for(const input of ['http://127.0.0.1/input?id=visible',{action:'accept'},{approved:true}])await assert.rejects(f.accept(input,bound,f.pending),e=>e.code==='FORBIDDEN');assert.equal(f.count(),0);
});
test('revoked grant blocks even a correctly signed callback',async()=>{
 const f=fixture();f.g.revoked=true;await assert.rejects(f.accept(f.proof(),bound,f.pending),e=>e.code==='FORBIDDEN');assert.equal(f.count(),0);
});
