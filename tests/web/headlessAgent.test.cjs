'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {createHeadlessAgent}=require('../../lib/web/headlessAgent');
const {alice}=require('./fixtures/principals.json');
function setup(){const calls=[];const backend={plan:async({spec})=>{calls.push('plan');return {version:1,planId:'p1',authSubject:alice.authSubject,workspaceUserId:alice.workspaceUserId,organizationId:alice.organizationId,projectId:alice.projectId,operation:'public-read',policyVersion:'v1',outputSchema:'captured-pages-v1',expiresAt:Date.now()+60000,retention:'transient',...spec};},read:async input=>{calls.push(input);return {executionId:input.executionId,state:'completed'};}};return {agent:createHeadlessAgent({backend}),calls};}
const spec=()=>({urls:['https://example.com/'],deadlineMs:1000,maxResponseBytes:1024});
test('headless proposal returns exact plan digest without exposing owner identity or execution',async()=>{
 const {agent,calls}=setup();const result=await agent.callTool({name:'propose_read',arguments:spec()});
 assert.equal(result.state,'awaiting_confirmation');assert.match(result.planDigest,/^[a-f0-9]{64}$/);assert.equal(result.authSubject,undefined);assert.deepEqual(calls,['plan']);
});
test('tool catalogue excludes approval, admission and credentials; copies cannot mutate definitions',()=>{
 const {agent}=setup();const list=agent.listTools();assert.deepEqual(list.map(t=>t.name),['compare_read_result','inspect_read_plan','propose_read','read_run_status','read_run_result']);list[2].inputSchema.required.push('secret');assert.equal(agent.listTools()[2].inputSchema.required.length,3);
});
test('model cannot inject identity/credentials or grant consent',async()=>{
 const {agent,calls}=setup();for(const field of ['authorization','clientSecret','organizationId','projectId','confirmed'])
 await assert.rejects(agent.callTool({name:'propose_read',arguments:{...spec(),[field]:'forged'}}),/INVALID_INPUT/);
 for(const name of ['confirm','admit_run','execute','approval_sign'])await assert.rejects(agent.callTool({name,arguments:{}}),/FORBIDDEN/);assert.equal(calls.length,0);
});
test('result and status calls forward only execution selector and cancellation',async()=>{
 const {agent,calls}=setup();await agent.callTool({name:'read_run_result',arguments:{executionId:'r1'}});assert.deepEqual(calls[0],{executionId:'r1',result:true,signal:undefined});
 await assert.rejects(agent.callTool({name:'read_run_status',arguments:{executionId:'r1',projectId:'other'}}),/INVALID_INPUT/);
 const controller=new AbortController();controller.abort();await assert.rejects(agent.callTool({name:'propose_read',arguments:spec(),signal:controller.signal}),/CANCELLED/);
});
test('inspect returns stored digest without identity leakage, marks expired plans and rejects substitution',async()=>{
 const c=require('../../lib/web/contracts');
 const plan={version:1,planId:'p1',authSubject:alice.authSubject,workspaceUserId:alice.workspaceUserId,organizationId:alice.organizationId,projectId:alice.projectId,
 operation:'public-read',policyVersion:'v1',outputSchema:'captured-pages-v1',expiresAt:Date.now()-1000,retention:'transient',...spec()};
 const agent=createHeadlessAgent({backend:{plan:async()=>{},read:async()=>{},inspect:async({planId})=>{assert.equal(planId,'p1');return plan;}}});
 const result=await agent.callTool({name:'inspect_read_plan',arguments:{planId:'p1'}});
 assert.equal(result.state,'expired');assert.equal(result.planDigest,c.digest(plan));assert.equal(result.authSubject,undefined);
 plan.planId='p2';await assert.rejects(agent.callTool({name:'inspect_read_plan',arguments:{planId:'p1'}}),/UNAVAILABLE/);
});
