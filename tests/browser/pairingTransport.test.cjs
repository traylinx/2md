'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const request=require('supertest');
const {createBrowserRuntime}=require('../../lib/browser/runtime');
const {createBrowserHttpClient}=require('../../lib/browser/httpClient');
const {createProtectedHost}=require('../../lib/browser/protectedHost');
const {bound,owner,grant,privateKey}=require('./support.cjs');
const c=require('../../lib/browser/contracts');
test('signed pairing transport, human-only approval and protected local callback supply remote credentials',async()=>{
 let revoked=false;const g={...grant(),policyVersion:c.POLICY,hostKeyFingerprint:bound.hostKeyFingerprint,approvedByWorkspaceUserId:owner.workspaceUserId};
 const nonces=new Set();const runtime=createBrowserRuntime({privateEnabled:true,autoSweep:false,runtimeEpoch:'e1',authorize:async()=>{if(revoked)c.deny('PERMISSION_REQUIRED');return g;},resolveCaller:async()=>bound,resolveHuman:async({authorization})=>{if(authorization!=='Bearer owned-human-fixture')c.deny('FORBIDDEN');return owner;},consumeNonce:async({nonce})=>{if(nonces.has(nonce))return false;nonces.add(nonce);return true;},lease:async()=>{},workerFactory:({protectedInputForSession})=>async input=>({execute:async(name,action)=>{assert.equal(name,'browser_authenticate');const provider=protectedInputForSession(input.sessionId),prepared=await provider.getAuthDecision(action);await provider.verifyDecision(prepared.proof,prepared.decision);await provider.credentialAccess({credentialRef:action.credentialRef,sessionId:input.sessionId,origin:'https://example.org',recipients:prepared.recipients},secret=>assert.equal(secret.password.toString(),'SYNTHETIC_PASSWORD'));return {state:'login_submitted',evidenceIds:[]};},dispose:async()=>{}})});
 const client=createBrowserHttpClient({url:'https://browser.example.org/api/browser/v1',bound,grantId:g.grantId,privateKey,agentId:'agent1',sdk:{getAgentRequestHeaders:async()=>({'X-Agent-User-Id':'agent1','X-Agent-Secret-Token':'fixture'})},fetchImpl:async(url,opts)=>{
  const r=await request(runtime.app).post(new URL(url).pathname).set(opts.headers).send(JSON.parse(opts.body));return new Response(r.text,{status:r.status,headers:r.headers});
 }});
 const host=await createProtectedHost({client,bound,grantId:g.grantId,privateKey});
 try{
  const pairing=await host.beginPairing();assert.match(pairing.pairingId,/^pair_[A-Za-z0-9_-]{43}$/);assert.equal(Object.keys(pairing).sort().join(','),'expiresAt,pairingId');
  const approve='/api/browser/control/v1/pairings/'+pairing.pairingId+'/approve?organizationId='+owner.organizationId+'&projectId='+owner.projectId;
  await request(runtime.app).post(approve).set('X-Agent-User-Id','agent1').send({}).expect(403);
  await request(runtime.app).post(approve).set('Authorization','Bearer wrong-human').send({}).expect(403);
  const approved=await request(runtime.app).post(approve).set('Authorization','Bearer owned-human-fixture').send({}).expect(200);
  const callback=await fetch(approved.body.redirectUri,{redirect:'manual'});assert.equal(callback.status,303);const cookie=callback.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(approved.body.redirectUri,{redirect:'manual'})).status,403);
  const opened=await client.call('browser_open',{runtimeEpoch:'e1',actionId:'a1',mode:'login_read',url:'https://example.org/',purpose:'Read account'});
  const input={sessionId:opened.sessionId,origin:'https://example.org',purpose:'Read account'},pending=await client.call('browser_credentials',input),url=host.credentialUrl(pending.interventionId);
  assert.equal((await fetch(url)).status,403);const page=await fetch(url,{headers:{Cookie:cookie}}),html=await page.text();assert.equal(page.status,200);
  const csrf=/name="csrf" value="([^"]+)"/.exec(html)[1];
  const supplied=await fetch(url,{method:'POST',headers:{Cookie:cookie,Origin:new URL(url).origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf,username:'SYNTHETIC_USER',password:'SYNTHETIC_PASSWORD'})});assert.equal(supplied.status,200);assert.doesNotMatch(await supplied.text(),/SYNTHETIC/);
  const ready=await host.call('browser_credentials',input);assert.equal(ready.state,'ready');
  const action={sessionId:opened.sessionId,runtimeEpoch:'e1',actionId:'login1',observationId:'o1',credentialRef:ready.credentialRef,fields:{passwordRef:'p1'},submitRef:'b1'};
  const executed=await host.call('browser_authenticate',action);assert.equal(executed.state,'succeeded');assert.equal(executed.output.inputUrl,undefined);assert.equal(executed.output.state,'login_submitted');
  assert.deepEqual(await host.call('browser_authenticate',action),executed);
  await assert.rejects(host.call('browser_authenticate',{...action,submitRef:'different'}),{code:'IDEMPOTENCY_CONFLICT'});
  const next=await host.call('browser_credentials',input);assert.match(next.inputUrl,/^http:\/\/127\.0\.0\.1:/);
  revoked=true;assert.equal((await fetch(url,{headers:{Cookie:cookie}})).status,403);revoked=false;assert.equal((await fetch(url,{headers:{Cookie:cookie}})).status,403);
  // Pairing-only mount does not accidentally expose grant creation.
  await request(runtime.app).post('/api/browser/control/v1/grants').send({}).expect(404);
 }finally{await host.close();await runtime.stop();}
});
