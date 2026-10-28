'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {sign}=require('node:crypto');
const request=require('supertest');
const {createBrowserRuntime}=require('../../lib/browser/runtime');
const {createBrowserHttpClient}=require('../../lib/browser/httpClient');
const {createCompletionSigner}=require('../../lib/browser/completionProof');
const {AUDIENCE}=require('../../lib/browser/consent');
const {bound,owner,grant,privateKey,observation}=require('./support.cjs');
const c=require('../../lib/browser/contracts');
function fixture({privateEnabled=false,badOutput=false,operationWait=false}={}){
 const g={...grant(),policyVersion:c.POLICY,hostKeyFingerprint:bound.hostKeyFingerprint,approvedByWorkspaceUserId:owner.workspaceUserId};
 let disposed=0,revoked=false,received;const nonces=new Set();
 const runtime=createBrowserRuntime({privateEnabled,autoSweep:false,runtimeEpoch:'epoch1',authorize:async()=>{if(revoked)c.deny('PERMISSION_REQUIRED');return g;},resolveCaller:async()=>bound,consumeNonce:async({nonce})=>{if(nonces.has(nonce))return false;nonces.add(nonce);return true;},lease:async()=>{},workerFactory:({protectedInputForSession})=>async input=>{
  assert.equal(input.bound,undefined);assert.equal(input.principal,undefined);
  return {dispose:async()=>{disposed++;},execute:async(name,action)=>{
   if(operationWait&&name==='browser_act'){
    const provider=protectedInputForSession(input.sessionId),record={sessionId:input.sessionId,operationId:'network1',operationDigest:'a'.repeat(64),recipients:['https://new.example.org'],expiresAt:Date.now()+30000,nonce:'network-nonce',reason:'recipient',method:'GET',origin:'https://new.example.org',type:'fetch',bodyBytes:0};
    const proof=await provider.requestDecision(record);const {reason,method,origin,type,bodyBytes,...decision}=record;await provider.verifyDecision(proof,decision);return {state:'active'};
   }
   if(badOutput)return {...observation(),password:'unexpected'};
   if(name==='browser_authenticate'){
    const provider=protectedInputForSession(input.sessionId),prepared=await provider.getAuthDecision(action);
    await provider.verifyDecision(prepared.proof,prepared.decision);
    await provider.credentialAccess({credentialRef:action.credentialRef,sessionId:input.sessionId,origin:'https://example.org',recipients:prepared.recipients},value=>{received=value.password;assert.equal(received.toString(),'SYNTHETIC');});
    return {state:'login_submitted',evidenceIds:[]};
   }
   return observation();
  }};
 }});
 const client=createBrowserHttpClient({url:'https://browser.example.org/api/browser/v1',bound,grantId:g.grantId,privateKey,agentId:'agent1',sdk:{getAgentRequestHeaders:async()=>({'X-Agent-User-Id':'agent1','X-Agent-Secret-Token':'synthetic'})},fetchImpl:async(url,options)=>{
  const response=await request(runtime.app).post(new URL(url).pathname).set(options.headers).send(JSON.parse(options.body));return new Response(response.text,{status:response.status,headers:response.headers});
 }});
 return {runtime,client,g,revoked(){revoked=true;},disposed:()=>disposed,received:()=>received};
}
const open=mode=>({runtimeEpoch:'epoch1',actionId:'open1',url:'https://example.org/',purpose:'Read',mode});
test('composed runtime signed routes execute public session and shut down cleanly',async()=>{
 const f=fixture();try{
  const caps=await f.client.call('get_browser_capabilities',{});assert.equal(caps.credentialChannel,'unavailable');
  const opened=await f.client.call('browser_open',open('public'));assert.equal(opened.state,'succeeded');
  assert.deepEqual(await f.client.protectedCall('heartbeat',{sessionId:opened.sessionId}),{sessionId:opened.sessionId,state:'active'});
  assert.equal((await f.client.call('browser_observe',{sessionId:opened.sessionId})).observationId,'o1');
  await f.client.call('browser_close',{sessionId:opened.sessionId});assert.equal(f.disposed(),1);
  await assert.rejects(f.client.protectedCall('heartbeat',{sessionId:opened.sessionId}),{code:'SESSION_LOST'});
 }finally{await f.runtime.stop();}
 await request(f.runtime.app).get('/health').expect(503);
});
test('composed private runtime binds signed completion and consent to worker then discards input on close',async()=>{
 const f=fixture({privateEnabled:true});try{
  const opened=await f.client.call('browser_open',open('login_read')),sessionId=opened.sessionId;
  const input={sessionId,origin:'https://example.org',purpose:'Read private account'};
  const pending=await f.client.call('browser_credentials',input),record=await f.client.protectedCall('input-inspect',{interventionId:pending.interventionId});
  const complete=createCompletionSigner({bound,grantId:f.g.grantId,privateKey,verifyOwner:async()=>owner});
  await f.client.protectedCall('input-supply',{interventionId:record.interventionId,username:'user',password:'SYNTHETIC',proof:await complete(record,{})});
  const action={sessionId,runtimeEpoch:'epoch1',actionId:'auth1',observationId:'o1',credentialRef:record.interventionId,fields:{passwordRef:'p1'},submitRef:'b1'};
  const decision={sessionId,operationId:action.actionId,operationDigest:c.digest(action),recipients:[input.origin],nonce:'nonce1',expiresAt:Date.now()+30000};
  const body={version:1,audience:AUDIENCE,grantId:f.g.grantId,principalScope:c.scope(bound),hostId:bound.hostId,...decision,issuedAt:Date.now()};
  const payload=Buffer.from(JSON.stringify(body)).toString('base64url'),proof=payload+'.'+sign(null,Buffer.from(AUDIENCE+'.'+payload),privateKey).toString('base64url');
  await f.client.protectedCall('input-prepare',{request:action,proof,decision,recipients:decision.recipients});
  const result=await f.client.call('browser_authenticate',action);assert.equal(result.state,'succeeded');assert.equal(result.output.state,'login_submitted');assert.ok(f.received().every(x=>x===0));
  const next=await f.client.call('browser_credentials',input);
  await f.client.call('browser_close',{sessionId});
  await assert.rejects(f.client.protectedCall('input-inspect',{interventionId:next.interventionId}),{code:'SESSION_LOST'});
  assert.equal(f.disposed(),1);
 }finally{await f.runtime.stop();}
});
test('runtime rejects malformed worker output and revocation before more work',async()=>{
 for(const badOutput of [false,true]){
  const f=fixture({badOutput});try{
   const opened=await f.client.call('browser_open',open('public'));if(!badOutput)f.revoked();
   await assert.rejects(f.client.call('browser_observe',{sessionId:opened.sessionId}));
   if(badOutput)assert.equal(f.disposed(),1);
  }finally{await f.runtime.stop();}
  assert.equal(f.disposed(),1);
 }
});
test('signed operation routes expose pending receipt and resume original runtime action',async()=>{
 const f=fixture({privateEnabled:true,operationWait:true});try{
 const opened=await f.client.call('browser_open',open('login_read'));
 const action={runtimeEpoch:'epoch1',sessionId:opened.sessionId,actionId:'click1',observationId:'o1',action:{type:'click',ref:'button1'}};
 const pending=await f.client.call('browser_act',action);assert.equal(pending.state,'needs_input');assert.equal(pending.output.reason,'recipient_consent');
 assert.deepEqual(await f.client.call('browser_act',action),pending);
 const record=await f.client.protectedCall('operation-inspect',{operationId:'network1'});assert.equal(record.ownerId,owner.workspaceUserId);
 await assert.rejects(f.client.protectedCall('operation-complete',{operationId:'network1',proof:'model-yes'}));
 const {reason,method,origin,type,bodyBytes,ownerId,...decision}=record;
 const body={version:1,audience:AUDIENCE,grantId:f.g.grantId,principalScope:c.scope(bound),hostId:bound.hostId,...decision,issuedAt:Date.now()};
 const payload=Buffer.from(JSON.stringify(body)).toString('base64url'),proof=payload+'.'+sign(null,Buffer.from(AUDIENCE+'.'+payload),privateKey).toString('base64url');
 await f.client.protectedCall('operation-complete',{operationId:'network1',proof});
 const status=await f.client.call('browser_action_status',{runtimeEpoch:'epoch1',actionId:'click1',sessionId:opened.sessionId});assert.equal(status.state,'succeeded');
 assert.deepEqual(await f.client.call('browser_act',action),status);
 await assert.rejects(f.client.protectedCall('operation-complete',{operationId:'network1',proof}));
 }finally{await f.runtime.stop();}
});
