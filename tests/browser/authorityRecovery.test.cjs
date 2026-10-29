'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const scope=require('../../lib/browser/authorityScope');
const {createCurrentAgentResolver}=require('../../lib/browser/currentAgent');
const {createSessionManager}=require('../../lib/browser/sessionManager');
const {bound,principal,grant}=require('./support.cjs'),c=require('../../lib/browser/contracts');
test('authority reference coalesces per phase, not across requests, principals or detached continuations',async()=>{
 let calls=0,late;
 const current=createCurrentAgentResolver({url:'https://auth.example.org/owner',agentId:'service1',sdk:{getAgentRequestHeaders:async()=>({'X-Agent-User-Id':'service1','X-Agent-Secret-Token':'synthetic'})},fetchImpl:async()=>{calls++;return Response.json(principal,{headers:{'Cache-Control':'no-store'}});}});
 await scope.run(async()=>{
  await Promise.all([current(principal),current(principal)]);await current(principal);assert.equal(calls,1);
  scope.after();await current(principal);scope.after();await current(principal);assert.equal(calls,2);
  late=require('node:async_hooks').AsyncResource.bind(()=>current(principal));
 });
 await scope.run(()=>current(principal));assert.equal(calls,3);await late();assert.equal(calls,4);
 await scope.run(async()=>{await scope.memo('one',async()=>++calls);await scope.memo('two',async()=>++calls);assert.equal(calls,6);});
});
test('failed authority reads are never memoized as permission; 429/503 stay distinguishable from revocation',async()=>{
 let calls=0,status=429;
 const current=createCurrentAgentResolver({url:'https://auth.example.org/owner',agentId:'service1',sdk:{getAgentRequestHeaders:async()=>({'X-Agent-User-Id':'service1','X-Agent-Secret-Token':'synthetic'})},fetchImpl:async()=>{calls++;return Response.json({error:'unavailable'},{status,headers:{'Cache-Control':'no-store'}});}});
 await scope.run(async()=>{await assert.rejects(current(principal),{code:'AUTHORITY_UNAVAILABLE'});status=503;await assert.rejects(current(principal),{code:'AUTHORITY_UNAVAILABLE'});assert.equal(calls,2);status=403;await assert.rejects(current(principal),{code:'PERMISSION_REQUIRED'});});
});
function managerFixture(){let clock=Date.now(),unavailable=false,revoked=false,executions=0,disposed=0;
 const g={...grant(),policyVersion:c.POLICY};
 const manager=createSessionManager({now:()=>clock,runtimeEpoch:'e1',autoSweep:false,privateEnabled:true,authorize:async()=>{if(revoked)c.deny('PERMISSION_REQUIRED');if(unavailable)c.deny('AUTHORITY_UNAVAILABLE');return g;},validateOutput:async(n,r)=>r,createWorker:async()=>({execute:async name=>{if(name==='browser_authenticate'){executions++;unavailable=true;return {state:'form_submitted',evidenceIds:[]};}return {observed:true};},dispose:async()=>disposed++})});
 return {manager,get executions(){return executions;},get disposed(){return disposed;},recover(){unavailable=false;},revoke(){revoked=true;},outage(){unavailable=true;},advance(ms){clock+=ms;}};
}
test('completed submission survives post-action outage, withholds result until fresh authorization and never replays',async()=>{
 const f=managerFixture(),m=f.manager;try{
 const opened=await m.open(bound,{runtimeEpoch:'e1',actionId:'open1',mode:'login_read',url:'https://example.org',purpose:'Read'});
 const input={runtimeEpoch:'e1',sessionId:opened.sessionId,actionId:'auth1',observationId:'o1',credentialRef:'c1',fields:[{ref:'r1',label:'Code'}]};
 await assert.rejects(m.execute(bound,'browser_authenticate',input),{code:'AUTHORITY_UNAVAILABLE'});assert.equal(f.executions,1);assert.equal(f.disposed,0);
 await assert.rejects(m.status(bound,{runtimeEpoch:'e1',actionId:'auth1'}),{code:'AUTHORITY_UNAVAILABLE'});assert.equal(f.disposed,0);
 f.recover();const receipt=await m.status(bound,{runtimeEpoch:'e1',actionId:'auth1'});assert.equal(receipt.state,'succeeded');assert.equal(receipt.output.state,'form_submitted');
 assert.deepEqual(await m.execute(bound,'browser_authenticate',input),receipt);assert.equal(f.executions,1);
 assert.deepEqual(await m.query(bound,'browser_observe',{sessionId:opened.sessionId}),{observed:true});
 f.revoke();await assert.rejects(m.query(bound,'browser_observe',{sessionId:opened.sessionId}),{code:'PERMISSION_REQUIRED'});assert.equal(f.disposed,1);
 }finally{await m.shutdown();}
});
test('temporary authority failures cannot hold a session beyond the bounded recovery interval',async()=>{
 const f=managerFixture(),m=f.manager;try{
 const opened=await m.open(bound,{runtimeEpoch:'e1',actionId:'open1',mode:'login_read',url:'https://example.org',purpose:'Read'});f.outage();
 await assert.rejects(m.query(bound,'browser_observe',{sessionId:opened.sessionId}),{code:'AUTHORITY_UNAVAILABLE'});assert.equal(f.disposed,0);
 f.advance(30001);f.recover();await assert.rejects(m.query(bound,'browser_observe',{sessionId:opened.sessionId}),{code:'SESSION_LOST'});assert.equal(f.disposed,1);
 }finally{await m.shutdown();}
});
test('HTTP boundary performs one reference check per phase, and post-action revocation still blocks output',async()=>{
 const express=require('express'),request=require('supertest'),{createBrowserRouter}=require('../../routes/browser');
 let calls=0,revokeAfter=false,revoked=false;
 const current=createCurrentAgentResolver({url:'https://auth.example.org/owner',agentId:'service1',sdk:{getAgentRequestHeaders:async()=>({'X-Agent-User-Id':'service1','X-Agent-Secret-Token':'synthetic'})},fetchImpl:async()=>{calls++;return Response.json(revoked?{}:principal,{status:revoked?403:200,headers:{'Cache-Control':'no-store'}});}});
 const app=express();app.use('/api/browser/v1',createBrowserRouter({enabled:true,resolveCaller:async()=>{await current(principal);return bound;},verifyHost:async()=>{await current(principal);await current(principal);},service:{call:async()=>{await current(principal);await current(principal);if(revokeAfter)revoked=true;return require('./support.cjs').observation();}}}));
 await request(app).post('/api/browser/v1/observe').send({sessionId:'s1'}).expect(200);assert.equal(calls,2);
 revokeAfter=true;await request(app).post('/api/browser/v1/observe').send({sessionId:'s1'}).expect(403);assert.equal(calls,4);
});
test('agent host does not multiply capability calls; protected endpoint remains authoritative',async()=>{
 const {createAgentInputHost}=require('../../lib/browser/agentInputHost');let capabilities=0,supplies=0;
 const host=createAgentInputHost({client:{call:async name=>{if(name==='get_browser_capabilities')capabilities++;return {state:'needs_input',interventionId:'i1'};},protectedCall:async()=>{supplies++;c.deny('PERMISSION_REQUIRED');}}});
 await assert.rejects(host.call('browser_credentials',{sessionId:'s1',origin:'https://example.org',purpose:'Read',observationId:'o1',fields:[{ref:'r1',label:'Code'}],values:['SYNTHETIC']}),{code:'PERMISSION_REQUIRED'});assert.equal(capabilities,0);assert.equal(supplies,1);
});
