'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createParentBridge}=require('../../lib/browser/protectedBridge');
const c=require('../../lib/browser/contracts');
test('bridge refuses credentials before exact action consent and rejects foreign credential references',async()=>{
 const input={sessionId:'s1',actionId:'a1',credentialRef:'ref1'},active={requestId:'r1',name:'browser_authenticate',input};let consumed=0;const messages=[];
 const bridge=createParentBridge({sessionId:'s1',getActive:()=>active,getProvider:async()=>({verifyDecision:async(_p,record)=>record,credentialAccess:async()=>{consumed++;return {};}}),send:m=>messages.push(m)});
 const send=(method,input)=>bridge.handle({type:'protected_request',requestId:'r1',callId:'c1',method,input});
 const binding={sessionId:'s1',credentialRef:'ref1',origin:'https://example.org',recipients:['https://example.org']};
 await send('credential',binding);assert.equal(consumed,0);assert.equal(messages.at(-1).type,'protected_error');
 await send('verify',{proof:'owned',record:{sessionId:'s1',operationId:'other',operationDigest:c.digest(input),recipients:binding.recipients}});
 await send('credential',binding);assert.equal(consumed,0);
 await send('verify',{proof:'owned',record:{sessionId:'s1',operationId:'a1',operationDigest:c.digest(input),recipients:binding.recipients}});
 await send('credential',{...binding,credentialRef:'foreign'});assert.equal(consumed,0);
});
test('bridge drops late protected responses after command cancellation/change',async()=>{
 const controller=new AbortController();const input={sessionId:'s1',actionId:'a1'};let active={requestId:'r1',name:'browser_authenticate',input,signal:controller.signal},release;const messages=[];
 const bridge=createParentBridge({sessionId:'s1',getActive:()=>active,getProvider:async()=>({getAuthDecision:()=>new Promise(r=>{release=r;})}),send:m=>messages.push(m)});
 const pending=bridge.handle({type:'protected_request',requestId:'r1',callId:'c1',method:'decision',input});await new Promise(r=>setImmediate(r));controller.abort();active=null;release({ignored:true});await pending;assert.equal(messages.length,0);
});
test('child network decision pauses action clock only until matching protected response',async()=>{
 const {createChildBridge}=require('../../lib/browser/protectedBridge');let sent;const events=[],controller=new AbortController();
 const bridge=createChildBridge({requestId:'request1',signal:controller.signal,send:m=>{sent=m;},actionDeadline:{pause:id=>events.push('pause:'+id),resume:id=>events.push('resume:'+id)}});
 try{
 const waiting=bridge.provider.requestDecision({sessionId:'s1',operationId:'network1'});assert.deepEqual(events,['pause:network1']);
 assert.equal(bridge.handle({type:'protected_result',requestId:'foreign',callId:sent.callId,result:'signed'}),false);
 assert.equal(bridge.handle({type:'protected_result',requestId:'request1',callId:sent.callId,result:'signed'}),true);
 assert.equal(await waiting,'signed');assert.deepEqual(events,['pause:network1','resume:network1']);
 }finally{bridge.close();}
});
