'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createOperationBroker,decisionSchema}=require('../../lib/browser/operationBroker');
const c=require('../../lib/browser/contracts');const {bound}=require('./support.cjs');
function fixture(){let time=1000,owner='owner1',pending;const broker=createOperationBroker({now:()=>time,describeSession:async()=>({ownerId:owner,expiresAt:200000}),verifyDecision:async(proof,_b,r)=>proof==='signed'?r:null,onPending:async(_b,p)=>{pending=p;}});const record={sessionId:'s1',operationId:'operation1',operationDigest:'a'.repeat(64),recipients:['https://site.example.org'],expiresAt:120000,nonce:'nonce1',reason:'operation',method:'POST',origin:'https://site.example.org',type:'fetch',bodyBytes:42};return {broker,record,get pending(){return pending;},expire(){time=120001;},revoke(){owner='different';}};}
const tick=()=>new Promise(r=>setImmediate(r));
const decision=r=>Object.fromEntries(Object.keys(decisionSchema.properties).map(k=>[k,r[k]]));
test('operation stays withheld until exact signed completion, can be verified only once',async()=>{
 const f=fixture();try{
 let forwarded=false;const waiting=f.broker.request(bound,f.record).then(v=>{forwarded=true;return v;});await tick();assert.equal(forwarded,false);assert.equal(f.pending.interventionId,'operation1');
 assert.equal((await f.broker.inspect(bound,'operation1')).bodyBytes,42);
 await assert.rejects(f.broker.complete(bound,{operationId:'operation1',proof:'model-yes'}),{code:'PERMISSION_REQUIRED'});assert.equal(forwarded,false);
 await f.broker.complete(bound,{operationId:'operation1',proof:'signed'});assert.equal(await waiting,'signed');
 await assert.rejects(f.broker.verified(bound,'signed',{...decision(f.record),operationDigest:'b'.repeat(64)}),{code:'PERMISSION_REQUIRED'});
 assert.deepEqual(await f.broker.verified(bound,'signed',decision(f.record)),decision(f.record));
 await assert.rejects(f.broker.verified(bound,'signed',decision(f.record)),{code:'SESSION_LOST'});
 }finally{f.broker.close();}
});
test('one pending per session, no body input, foreign host denied, cancellation rejects waiting',async()=>{
 const f=fixture();try{
 await assert.rejects(f.broker.request(bound,{...f.record,body:'secret'}));
 const abort=new AbortController(),waiting=f.broker.request(bound,f.record,{signal:abort.signal});const rejected=assert.rejects(waiting,{code:'CANCELLED'});await tick();
 await assert.rejects(f.broker.request(bound,{...f.record,operationId:'operation2'}),{code:'BUSY'});
 await assert.rejects(f.broker.inspect({...bound,hostId:'other'},'operation1'),{code:'SESSION_LOST'});
 abort.abort();await rejected;await assert.rejects(f.broker.inspect(bound,'operation1'));
 }finally{f.broker.close();}
});
test('expiry and session owner change prevent approval; disposal rejects unresolved request',async()=>{
 for(const change of ['expire','revoke']){const f=fixture();try{
  const waiting=f.broker.request(bound,f.record);const rejected=assert.rejects(waiting);await tick();f[change]();
  await assert.rejects(f.broker.complete(bound,{operationId:'operation1',proof:'signed'}));
  f.broker.discardSession(bound,'s1');await rejected;
 }finally{f.broker.close();}}
});
