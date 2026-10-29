'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {waitForVerification,verificationWarnings}=require('../../lib/browser/verification');
const {Deadline}=require('../../lib/capture/deadline');
const {createAuthentication}=require('../../lib/browser/authentication');
const c=require('../../lib/browser/contracts');
const pending={verification:'pending',challenge:true,accessGate:'verification'};
function fixture(states){let calls=0;return {get calls(){return calls;},evaluate:async()=>{const value=states[Math.min(calls++,states.length-1)];if(value instanceof Error)throw value;return value;}};}
test('passive verification polls state and returns fresh completed document',async()=>{
 const deadline=new Deadline(2000),frame=fixture([pending,pending,{verification:'none',text:'Organization'}]);
 try{assert.equal((await waitForVerification(frame,deadline,{pollMs:1})).text,'Organization');assert.equal(frame.calls,3);}finally{deadline.close();}
});
test('passive wait handles document replacement but never swallows unrelated errors',async()=>{
 const deadline=new Deadline(2000),frame=fixture([pending,Error('Execution context was destroyed'),{verification:'none'}]);
 try{assert.equal((await waitForVerification(frame,deadline,{pollMs:1})).verification,'none');
 await assert.rejects(waitForVerification(fixture([Error('Execution context was destroyed')]),deadline),/context/);
 await assert.rejects(waitForVerification(fixture([pending,Error('Target closed')]),deadline,{pollMs:1}),/Target closed/);
 }finally{deadline.close();}
});
test('timeout stays pending, not human-required; terminal states do not poll',async()=>{
 const deadline=new Deadline(2000),frame=fixture([pending]);
 try{assert.equal((await waitForVerification(frame,deadline,{timeoutMs:20,pollMs:2})).verification,'pending');assert.ok(frame.calls>1);assert.ok(deadline.remaining()>1000);
 for(const verification of ['none','interactive','failed']){const f=fixture([{verification}]);assert.equal((await waitForVerification(f,deadline)).verification,verification);assert.equal(f.calls,1);}
 assert.deepEqual(verificationWarnings(pending),['VERIFICATION_PENDING']);assert.deepEqual(verificationWarnings({verification:'failed'}),['VERIFICATION_FAILED']);
 deadline.abort('CANCELLED');await assert.rejects(waitForVerification(frame,deadline),{code:'CANCELLED'});
 }finally{deadline.close();}
});
test('pending/failed auth stop before consuming credentials, touching fields or submitting',async()=>{
 const origin='https://example.com',request={sessionId:'s1',runtimeEpoch:'e1',actionId:'a1',observationId:'o1',credentialRef:'c1',fields:[{ref:'r1',label:'Code'}]};
 const decision={sessionId:'s1',operationId:'a1',operationDigest:c.digest(request),recipients:[origin]};
 for(const verification of ['pending','failed']){
  let touched=0;const forbidden=()=>{touched++;throw Error('Unexpected side effect');};
  const authenticate=createAuthentication({page:{},observations:{page:{url:()=>origin,evaluate:async()=>({...pending,verification})},resolve:forbidden},network:{enterPrivate:forbidden},credentialAccess:forbidden});
  await assert.rejects(authenticate(request,{proof:'synthetic',decision,recipients:[origin]},{remaining:()=>1000,run:fn=>fn()}),{code:verification==='pending'?'VERIFICATION_PENDING':'VERIFICATION_FAILED'});assert.equal(touched,0);
 }
});
test('both client modes explain passive wait versus actual human challenge',()=>{
 const {createBrowserMcpAgent}=require('../../lib/browser/mcpAgent');
 for(const agentInput of [false,true]){const agent=createBrowserMcpAgent({backend:{call(){}},agentInput});assert.match(agent.instructions,/VERIFICATION_PENDING/);assert.match(agent.instructions,/VERIFICATION_FAILED/);assert.match(agent.instructions,/CAPTCHA_REQUIRED/);}
});
