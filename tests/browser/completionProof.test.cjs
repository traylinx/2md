'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createCompletionSigner,createCompletionVerifier}=require('../../lib/browser/completionProof');
const {bound,owner,grant,privateKey}=require('./support.cjs');
const c=require('../../lib/browser/contracts');
function fixture(){
 let time=Date.now(),revoked=false;const nonces=new Set();
 const record={interventionId:'entry1',sessionId:'session1',ownerId:owner.workspaceUserId,origin:'https://example.org',recipients:['https://example.org'],expiresAt:time+120000};
 const sign=createCompletionSigner({privateKey,bound,grantId:'grant-1',verifyOwner:async context=>context,now:()=>time});
 const verify=createCompletionVerifier({authorize:async()=>({...grant(time),revoked,hostKeyFingerprint:bound.hostKeyFingerprint,approvedByWorkspaceUserId:owner.workspaceUserId}),consumeNonce:async value=>{const key=value.scope+value.nonce;if(nonces.has(key))return false;nonces.add(key);return true;},now:()=>time});
 return {record,sign,verify,expire(){time+=120001;},revoke(){revoked=true;}};
}
test('completion requires paired owner and binds exact entry, host, recipients; consumes once',async()=>{
 const f=fixture();await assert.rejects(f.sign(f.record,{...owner,workspaceUserId:'foreign'}));
 const proof=await f.sign(f.record,owner);
 for(const record of [{...f.record,sessionId:'other'},{...f.record,recipients:['https://other.example']},{...f.record,interventionId:'other'}])await assert.rejects(f.verify(proof,bound,record));
 await assert.rejects(f.verify(proof,{...bound,hostId:'other'},f.record));
 assert.equal(await f.verify(proof,bound,f.record),true);await assert.rejects(f.verify(proof,bound,f.record));
});
test('completion rejects expiry, revoked authority and malformed signatures',async()=>{
 for(const change of ['expire','revoke']){const f=fixture(),proof=await f.sign(f.record,owner);f[change]();await assert.rejects(f.verify(proof,bound,f.record));}
 const f=fixture();for(const proof of ['yes', 'a.b', 'x'.repeat(8193)])await assert.rejects(f.verify(proof,bound,f.record));
});
