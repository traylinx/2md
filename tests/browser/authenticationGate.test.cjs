'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createAuthentication}=require('../../lib/browser/authentication');
const c=require('../../lib/browser/contracts');
test('an observed access gate stops before credentials, private transition or submission',async()=>{
 const origin='https://example.com';
 const request={sessionId:'s1',runtimeEpoch:'e1',actionId:'login1',observationId:'o1',credentialRef:'credential1',fields:{usernameRef:'u1',passwordRef:'p1'},submitRef:'b1'};
 const decision={sessionId:'s1',operationId:'login1',operationDigest:c.digest(request),recipients:[origin]};
 for(const accessGate of ['mfa','invitation','captcha']){
  let touched=0;const forbidden=()=>{touched++;throw Error('unexpected action');};
  const authenticate=createAuthentication({page:{},observations:{page:{url:()=>origin,evaluate:async()=>({challenge:true,accessGate})},resolve:forbidden},network:{enterPrivate:forbidden},credentialAccess:forbidden});
  await assert.rejects(authenticate(request,{proof:'synthetic',decision,recipients:[origin]},{remaining:()=>30000,run:fn=>fn()}),{code:'HUMAN_REQUIRED'});
  assert.equal(touched,0);
 }
});
