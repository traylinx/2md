'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {createOwnerPrincipalResolver}=require('../../lib/web/ownerPrincipal');
const {alice,bob}=require('./fixtures/principals.json');const fixture=require('./fixtures/result.cjs');
function setup(actor=alice){const calls=[];const resolve=createOwnerPrincipalResolver({url:'https://workspace.example/web/background-project-access',agentUserId:'read-id',sdk:{getAgentRequestHeaders:async()=>({'X-Agent-User-Id':'read-id','X-Agent-Secret-Token':'synthetic-proof',Authorization:'must-not-forward'})},
 fetchImpl:async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify(actor),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}});return {resolve,calls};}
test('background lookup sends only service proof and immutable creator selectors, no human bearer',async()=>{
 const f=setup(),{plan}=fixture();assert.deepEqual(await f.resolve(plan),alice);assert.equal(f.calls[0].init.headers.Authorization,undefined);
 assert.deepEqual(JSON.parse(f.calls[0].init.body),{authSubject:alice.authSubject,workspaceUserId:alice.workspaceUserId,organizationId:alice.organizationId,projectId:alice.projectId});
 await f.resolve(plan);assert.equal(f.calls.length,2);
});
test('foreign or downgraded current membership cannot authorize worker',async()=>{
 for(const actor of [bob,{...alice,effectiveRole:'VIEWER'}])await assert.rejects(setup(actor).resolve(fixture().plan),/FORBIDDEN/);
});

test('agent owner kind is explicit and never accepted as human',async()=>{
 const plan={...fixture().plan,principalKind:'agent',authorizationRef:{tokenId:12,clientId:'client-a',expiresAt:Date.now()+60000}},f=setup({...alice,kind:'agent'});
 assert.equal((await f.resolve(plan)).kind,'agent');
 assert.equal(JSON.parse(f.calls[0].init.body).principalKind,'agent');
 await assert.rejects(setup(alice).resolve(plan),/FORBIDDEN/);
});
