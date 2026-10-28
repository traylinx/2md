'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const request=require('supertest');
const {createBrowserRuntime}=require('../../lib/browser/runtime');
const {createBrowserHttpClient}=require('../../lib/browser/httpClient');
const {createProtectedHost}=require('../../lib/browser/protectedHost');
const {bound,owner,grant,privateKey}=require('./support.cjs');
const c=require('../../lib/browser/contracts');
for(const emailFirst of [false,true,'paused'])test(`signed pairing transport and single protected input, email-first=${emailFirst}`,async()=>{
 let revoked=false;const g={...grant(),policyVersion:c.POLICY,hostKeyFingerprint:bound.hostKeyFingerprint,approvedByWorkspaceUserId:owner.workspaceUserId};
 const nonces=new Set();const runtime=createBrowserRuntime({privateEnabled:true,pairingOrigin:'https://traylinx.example.org',autoSweep:false,runtimeEpoch:'e1',authorize:async()=>{if(revoked)c.deny('PERMISSION_REQUIRED');return g;},resolveCaller:async()=>bound,resolveHuman:async({authorization})=>{if(authorization!=='Bearer owned-human-fixture')c.deny('FORBIDDEN');return owner;},consumeNonce:async({nonce})=>{if(nonces.has(nonce))return false;nonces.add(nonce);return true;},lease:async()=>{},workerFactory:({protectedInputForSession})=>async input=>({execute:async(name,action)=>{const provider=protectedInputForSession(input.sessionId);
 if(name==='browser_act'){
  const record={sessionId:input.sessionId,operationId:'network1',operationDigest:'a'.repeat(64),recipients:['https://new.example.org'],expiresAt:Date.now()+30000,nonce:'network-nonce',reason:'recipient',method:'GET',origin:'https://new.example.org',type:'fetch',bodyBytes:0};
  const proof=await provider.requestDecision(record),{reason,method,origin,type,bodyBytes,...decision}=record;await provider.verifyDecision(proof,decision);return {state:'active'};
 }
 assert.equal(name,'browser_authenticate');const prepared=await provider.getAuthDecision(action);await provider.verifyDecision(prepared.proof,prepared.decision);await provider.credentialAccess({credentialRef:action.credentialRef,sessionId:input.sessionId,origin:'https://example.org',recipients:prepared.recipients},secret=>{assert.equal(secret.password.toString(),action.fields.passwordRef?'SYNTHETIC_PASSWORD':'');assert.equal(secret.username.toString(),'SYNTHETIC_USER');});if(emailFirst==='paused'&&!action.fields.passwordRef){
 const record={sessionId:input.sessionId,operationId:'email-network',operationDigest:'b'.repeat(64),recipients:['https://new.example.org'],expiresAt:Date.now()+30000,nonce:'email-nonce',reason:'recipient',method:'POST',origin:'https://new.example.org',type:'fetch',bodyBytes:0};
 const proof=await provider.requestDecision(record),{reason,method,origin,type,bodyBytes,...decision}=record;await provider.verifyDecision(proof,decision);
 }return {state:'login_submitted',evidenceIds:[]};},dispose:async()=>{}})});
 const client=createBrowserHttpClient({url:'https://browser.example.org/api/browser/v1',bound,grantId:g.grantId,privateKey,agentId:'agent1',sdk:{getAgentRequestHeaders:async()=>({'X-Agent-User-Id':'agent1','X-Agent-Secret-Token':'fixture'})},fetchImpl:async(url,opts)=>{
  const r=await request(runtime.app).post(new URL(url).pathname).set(opts.headers).send(JSON.parse(opts.body));return new Response(r.text,{status:r.status,headers:r.headers});
 }});
 const host=await createProtectedHost({client,bound,grantId:g.grantId,privateKey,ownerSetupUrl:'https://traylinx.example.org/admin/browser/connect'});
 try{
  const capabilities=await host.call('get_browser_capabilities',{}),setupUrl=new URL(capabilities.ownerConnection.url);const pairing={pairingId:setupUrl.searchParams.get('pairingId'),expiresAt:capabilities.ownerConnection.expiresAt};assert.equal(setupUrl.origin,'https://traylinx.example.org');assert.match(pairing.pairingId,/^pair_[A-Za-z0-9_-]{43}$/);assert.equal(Object.keys(pairing).sort().join(','),'expiresAt,pairingId');
  const approve='/api/browser/control/v1/pairings/'+pairing.pairingId+'/approve?organizationId='+owner.organizationId+'&projectId='+owner.projectId;
  await request(runtime.app).post(approve).set('X-Agent-User-Id','agent1').send({}).expect(403);
  await request(runtime.app).post(approve).set('Authorization','Bearer wrong-human').send({}).expect(403);
  const inspect=approve.replace('/approve?', '/inspect?');
  await request(runtime.app).options(inspect).set('Origin','https://traylinx.example.org').set('Access-Control-Request-Method','POST').set('Access-Control-Request-Headers','authorization,content-type').expect(204);
  await request(runtime.app).post(inspect).set('Origin','https://evil.example.org').set('Authorization','Bearer owned-human-fixture').send({}).expect(403);
  const inspected=await request(runtime.app).post(inspect).set('Origin','https://traylinx.example.org').set('Authorization','Bearer owned-human-fixture').send({}).expect(200);
  assert.equal(inspected.headers['access-control-allow-origin'],'https://traylinx.example.org');assert.equal(inspected.body.hostKeyFingerprint,bound.hostKeyFingerprint);assert.equal(inspected.body.redirectUri,undefined);
  const approved=await request(runtime.app).post(approve).set('Authorization','Bearer owned-human-fixture').send({}).expect(200);
  const callback=await fetch(approved.body.redirectUri,{redirect:'manual'});assert.equal(callback.status,303);assert.equal((await host.call('get_browser_capabilities',{})).ownerConnection,undefined);const cookie=callback.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(approved.body.redirectUri,{redirect:'manual'})).status,403);
  const opened=await client.call('browser_open',{runtimeEpoch:'e1',actionId:'a1',mode:'login_read',url:'https://example.org/',purpose:'Read account'});
  const input={sessionId:opened.sessionId,origin:'https://example.org',purpose:'Read account'},pending=await client.call('browser_credentials',input),url=host.credentialUrl(pending.interventionId);
  assert.equal((await fetch(url)).status,403);const page=await fetch(url,{headers:{Cookie:cookie}}),html=await page.text();assert.equal(page.status,200);
  const csrf=/name="csrf" value="([^"]+)"/.exec(html)[1];
  const supplied=await fetch(url,{method:'POST',headers:{Cookie:cookie,Origin:new URL(url).origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf,username:'SYNTHETIC_USER',password:'SYNTHETIC_PASSWORD'})});assert.equal(supplied.status,200);assert.doesNotMatch(await supplied.text(),/SYNTHETIC/);
  const ready=await host.call('browser_credentials',input);assert.equal(ready.state,'ready');
  const action={sessionId:opened.sessionId,runtimeEpoch:'e1',actionId:'login1',observationId:'o1',credentialRef:ready.credentialRef,fields:{passwordRef:'p1'},submitRef:'b1'};
  if(emailFirst){const email={...action,actionId:'email1',fields:{usernameRef:'u1'}};let first=await host.call('browser_authenticate',email);
  if(emailFirst==='paused'){
   assert.equal(first.state,'needs_input');const operationUrl=first.output.inputUrl;
   const markup=await (await fetch(operationUrl,{headers:{Cookie:cookie}})).text();const csrf=/name="csrf" value="([^"]+)"/.exec(markup)[1];
   assert.equal((await fetch(operationUrl,{method:'POST',headers:{Cookie:cookie,Origin:new URL(operationUrl).origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf,decision:'approve'})})).status,200);
   first=await host.call('browser_action_status',{sessionId:opened.sessionId,runtimeEpoch:'e1',actionId:'email1'});
  }
  assert.equal(first.state,'succeeded');assert.equal(first.output.state,'login_submitted');assert.equal(first.output.inputUrl,undefined);assert.deepEqual(await host.call('browser_authenticate',email),first);}
  const executed=await host.call('browser_authenticate',action);assert.equal(executed.state,'succeeded');assert.equal(executed.output.inputUrl,undefined);assert.equal(executed.output.state,'login_submitted');
  assert.deepEqual(await host.call('browser_authenticate',action),executed);
  await assert.rejects(host.call('browser_authenticate',{...action,submitRef:'different'}),{code:'IDEMPOTENCY_CONFLICT'});
  if(!emailFirst){
   const click={sessionId:opened.sessionId,runtimeEpoch:'e1',actionId:'network-click',observationId:'o2',action:{type:'click',ref:'r2'}};
   const pendingOperation=await host.call('browser_act',click);assert.equal(pendingOperation.state,'needs_input');const operationUrl=pendingOperation.output.inputUrl;assert.match(operationUrl,/\/operations\/network1$/);
   assert.equal((await fetch(operationUrl)).status,403);
   const operationPage=await fetch(operationUrl,{headers:{Cookie:cookie}}),markup=await operationPage.text();assert.equal(operationPage.status,200);assert.match(markup,/new.example.org/);assert.doesNotMatch(markup,/SYNTHETIC_PASSWORD/);
   const operationCsrf=/name="csrf" value="([^"]+)"/.exec(markup)[1];
   const allowed=await fetch(operationUrl,{method:'POST',headers:{Cookie:cookie,Origin:new URL(operationUrl).origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:operationCsrf,decision:'approve'})});assert.equal(allowed.status,200);
   const outcome=await host.call('browser_action_status',{sessionId:opened.sessionId,runtimeEpoch:'e1',actionId:'network-click'});assert.equal(outcome.state,'succeeded');assert.deepEqual(await host.call('browser_act',click),outcome);
  }
  const next=await host.call('browser_credentials',input);assert.match(next.inputUrl,/^http:\/\/127\.0\.0\.1:/);
  revoked=true;assert.equal((await fetch(url,{headers:{Cookie:cookie}})).status,403);revoked=false;assert.equal((await fetch(url,{headers:{Cookie:cookie}})).status,403);
  // Pairing-only mount does not accidentally expose grant creation.
  await request(runtime.app).post('/api/browser/control/v1/grants').send({}).expect(404);
 }finally{await host.close();await runtime.stop();}
});
