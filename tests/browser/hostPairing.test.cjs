'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {randomBytes,createHash}=require('node:crypto');
const {bound,grant,privateKey,owner}=require('./support.cjs');
const {signRequest,createHostVerifier}=require('../../lib/browser/hostProof');
const {createOwnerPairing}=require('../../lib/browser/ownerPairing');
const c=require('../../lib/browser/contracts');
function authority(){return {...grant(),hostKeyFingerprint:bound.hostKeyFingerprint,approvedByWorkspaceUserId:owner.workspaceUserId};}
test('host signature binds caller, exact request and audience; replay rejected',async()=>{
 const used=new Set(),g=authority();const verify=createHostVerifier({authorize:async()=>g,consumeNonce:async({nonce})=>{if(used.has(nonce))return false;used.add(nonce);return true;}});
 const input={bound,grantId:g.grantId,method:'POST',path:'/api/browser/v1/observe',body:{sessionId:'owned'}};
 const proof=signRequest({...input,privateKey});
 await assert.rejects(verify({...input,proof,body:{sessionId:'foreign'}}),{code:'UNAUTHENTICATED'});
 assert.equal((await verify({...input,proof})).hostId,bound.hostId);
 await assert.rejects(verify({...input,proof}),{code:'UNAUTHENTICATED'});
 const next=signRequest({...input,privateKey});g.revoked=true;await assert.rejects(verify({...input,proof:next}),{code:'PERMISSION_REQUIRED'});
});
test('human owner pairing uses state and PKCE; URL possession and agent role insufficient',async()=>{
 const g=authority(),pair=createOwnerPairing({authorize:async()=>g});
 const verifier=randomBytes(32).toString('base64url'),state=randomBytes(32).toString('base64url'),challenge=createHash('sha256').update(verifier).digest('base64url');
 const input={grantId:g.grantId,state,challenge,redirectUri:'http://127.0.0.1:42111/pair/callback'};
 await assert.rejects(pair.begin(bound,{...input,redirectUri:'https://evil.example.org/pair/callback'}));
 const started=await pair.begin(bound,input);
 await assert.rejects(pair.approve(started.pairingId,bound.principal),{code:'FORBIDDEN'});
 await assert.rejects(pair.approve(started.pairingId,{...owner,workspaceUserId:'other-owner'}),{code:'FORBIDDEN'});
 const approved=await pair.approve(started.pairingId,owner),code=new URL(approved.redirectUri).searchParams.get('code');
 const exchange={pairingId:started.pairingId,code,state,verifier};
 await assert.rejects(pair.exchange(bound,{...exchange,state:randomBytes(32).toString('base64url')}),{code:'FORBIDDEN'});
 await assert.rejects(pair.exchange(bound,{...exchange,verifier:randomBytes(32).toString('base64url')}),{code:'FORBIDDEN'});
 await assert.rejects(pair.exchange({...bound,hostId:'foreign'},exchange),{code:'FORBIDDEN'});
 const result=await pair.exchange(bound,exchange);assert.equal(result.owner.workspaceUserId,owner.workspaceUserId);
 await assert.rejects(pair.exchange(bound,exchange),{code:'SESSION_LOST'});pair.close();
});
test('pairing expires and revocation prevents code exchange',async()=>{
 let now=Date.now();const g=authority(),pair=createOwnerPairing({authorize:async()=>g,now:()=>now});
 const verifier=randomBytes(32).toString('base64url'),state=randomBytes(32).toString('base64url');
 const request={grantId:g.grantId,state,challenge:createHash('sha256').update(verifier).digest('base64url'),redirectUri:'http://127.0.0.1:42111/pair/callback'};
 const a=await pair.begin(bound,request),uri=(await pair.approve(a.pairingId,owner)).redirectUri;
 g.revoked=true;await assert.rejects(pair.exchange(bound,{pairingId:a.pairingId,code:new URL(uri).searchParams.get('code'),state,verifier}),{code:'PERMISSION_REQUIRED'});
 g.revoked=false;now+=120001;await assert.rejects(pair.approve(a.pairingId,owner),{code:'SESSION_LOST'});pair.close();
});
