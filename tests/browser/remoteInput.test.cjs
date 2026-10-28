'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createRemoteInput}=require('../../lib/browser/remoteInput');const c=require('../../lib/browser/contracts');const {bound}=require('./support.cjs');
function fixture(){let alive=true;const broker=createRemoteInput({describeSession:async()=>{if(!alive)c.deny('SESSION_LOST');return {mode:'login_read',ownerId:'owner1',expiresAt:Date.now()+60000};},verifyCompletion:async proof=>proof==='owner-completed',verifyDecision:async(proof,_b,record)=>proof==='signed'?record:null});return {broker,revoke:()=>{alive=false;}};}
const input={sessionId:'s1',origin:'https://site.example.org',purpose:'Read account'};
test('remote input requires owner completion and exact verified action before one-time consumption',async()=>{
 const {broker}=fixture();try{
 const pending=await broker.request({bound,input});const id=pending.interventionId;assert.equal(pending.state,'needs_input');
 await assert.rejects(broker.supply(bound,{interventionId:id,username:'u',password:'SYNTHETIC',proof:'model-yes'}),{code:'PERMISSION_REQUIRED'});
 await broker.supply(bound,{interventionId:id,username:'u',password:'SYNTHETIC',proof:'owner-completed'});
 assert.equal((await broker.request({bound,input})).credentialRef,id);
 const request={sessionId:'s1',runtimeEpoch:'e1',actionId:'a1',observationId:'o1',credentialRef:id,fields:{passwordRef:'p1'},submitRef:'b1'};
 const decision={sessionId:'s1',operationId:'a1',operationDigest:c.digest(request),recipients:[input.origin],nonce:'nonce1',expiresAt:Date.now()+30000};
 await broker.prepare(bound,{request,proof:'signed',decision,recipients:decision.recipients});const provider=broker.provider(bound);
 const binding={credentialRef:id,sessionId:'s1',origin:input.origin,recipients:decision.recipients};
 await assert.rejects(provider.credentialAccess(binding,()=>{}),{code:'PERMISSION_REQUIRED'});
 const prepared=await provider.getAuthDecision(request);await provider.verifyDecision(prepared.proof,prepared.decision);
 let secret;await provider.credentialAccess(binding,async value=>{secret=value.password;assert.equal(secret.toString(),'SYNTHETIC');});assert.ok(secret.every(b=>b===0));
 await assert.rejects(provider.credentialAccess(binding,()=>{}),{code:'SESSION_LOST'});
 }finally{broker.close();}
});
test('foreign hosts, cancelled entries and ended sessions cannot retrieve protected input',async()=>{
 const {broker,revoke}=fixture();try{
 const r=await broker.request({bound,input});await assert.rejects(broker.inspect({...bound,hostId:'foreign'},r.interventionId),{code:'FORBIDDEN'});
 await broker.cancel(bound,r.interventionId);await assert.rejects(broker.inspect(bound,r.interventionId),{code:'SESSION_LOST'});
 const next=await broker.request({bound,input});revoke();await assert.rejects(broker.supply(bound,{interventionId:next.interventionId,username:'u',password:'SYNTHETIC',proof:'owner-completed'}),{code:'SESSION_LOST'});
 }finally{broker.close();}
});
test('protected HTTP endpoint authenticates/signature-checks before supply and never returns submitted values',async()=>{
 const express=require('express'),request=require('supertest');const {createBrowserInputRouter}=require('../../routes/browserInput');
 const {broker}=fixture();let proofs=0;const app=express();app.use('/api/browser/v1',createBrowserInputRouter({enabled:true,broker,resolveCaller:async()=>bound,verifyHost:async()=>{proofs++;}}));
 try{
 const entry=await broker.request({bound,input});const body={interventionId:entry.interventionId,username:'OWNED_USER',password:'SYNTHETIC_PASSWORD',proof:'owner-completed'};
 const response=await request(app).post('/api/browser/v1/input-supply').send(body).expect(200);assert.equal(response.body.state,'ready');assert.doesNotMatch(response.text,/OWNED_USER|SYNTHETIC_PASSWORD/);assert.equal(proofs,1);
 await request(app).post('/api/browser/v1/input-inspect').set('Origin','https://hostile.example.org').send({interventionId:entry.interventionId}).expect(403);assert.equal(proofs,1);
 }finally{broker.close();}
});
