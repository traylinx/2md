'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createHash,randomBytes}=require('node:crypto');
const {createEnrollment}=require('../../lib/browser/enrollment');
const {principal,owner,grant}=require('./support.cjs');
function fixture(){let current=principal;const records=new Map();const repository={create:async r=>{if(records.has(r.grantId))throw Error('collision');records.set(r.grantId,r);},get:async({grantId})=>records.get(grantId)||null,revoke:async({grantId})=>{const r=records.get(grantId);if(r)records.set(grantId,{...r,revoked:true});}};const enrollment=createEnrollment({repository,resolveCurrentAgent:async()=>current});const verifier=randomBytes(32).toString('base64url'),state=randomBytes(32).toString('base64url');const input={hostId:'host1',hostPublicKey:grant().hostPublicKey,state,challenge:createHash('sha256').update(verifier).digest('base64url'),redirectUri:'http://127.0.0.1:12345/pair/callback',operations:['browser:public','browser:login_read']};return {enrollment,records,input,verifier,revoke(){current={...principal,stopped:true};}};}
test('new host obtains no grant until explicit scoped human approval; callback exchanges once',async()=>{
 const f=fixture();try{
 const pending=await f.enrollment.begin(principal,f.input);assert.equal(f.records.size,0);
 const preview=await f.enrollment.inspect(pending.enrollmentId,owner);assert.equal(preview.hostId,'host1');assert.deepEqual(preview.operations,f.input.operations);
 await assert.rejects(f.enrollment.approve(pending.enrollmentId,principal),{code:'FORBIDDEN'});
 await assert.rejects(f.enrollment.approve(pending.enrollmentId,{...owner,projectId:'foreign'}),{code:'FORBIDDEN'});assert.equal(f.records.size,0);
 const result=await f.enrollment.approve(pending.enrollmentId,owner);assert.equal(f.records.size,1);assert.equal(f.records.get(pending.grantId).approvedByWorkspaceUserId,owner.workspaceUserId);
 await assert.rejects(f.enrollment.approve(pending.enrollmentId,owner),{code:'IDEMPOTENCY_CONFLICT'});
 const url=new URL(result.redirectUri),exchange={state:f.input.state,code:url.searchParams.get('code'),verifier:f.verifier};
 await assert.rejects(f.enrollment.exchange(pending.enrollmentId,principal,{...exchange,verifier:'a'.repeat(43)}));
 const complete=await f.enrollment.exchange(pending.enrollmentId,principal,exchange);assert.equal(complete.grantId,pending.grantId);
 await assert.rejects(f.enrollment.exchange(pending.enrollmentId,principal,exchange),{code:'SESSION_LOST'});
 }finally{f.enrollment.close();}
});
test('enrollment rejects stopped current agent and unsafe callback, without persisting grant',async()=>{
 const f=fixture();try{
 await assert.rejects(f.enrollment.begin(principal,{...f.input,redirectUri:'https://evil.example.org/'}));
 const pending=await f.enrollment.begin(principal,f.input);f.revoke();await assert.rejects(f.enrollment.approve(pending.enrollmentId,owner));assert.equal(f.records.size,0);
 }finally{f.enrollment.close();}
});
