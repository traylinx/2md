'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const c=require('../../lib/web/contracts');const {createPilotPolicy}=require('../../lib/web/pilotPolicy');const {createHeadlessClient}=require('../../lib/web/headlessClient');
const env={WEB_PILOT_ORGANIZATION_ID:'org',WEB_PILOT_PROJECT_ID:'project',WEB_CAPTURE_ALLOWED_ORIGINS:'https://example.com',WEB_READ_POLICY_VERSION:'v1'};
const actor={version:1,kind:'human',authSubject:'user',workspaceUserId:'user',organizationId:'org',projectId:'project',effectiveRole:'OWNER',stopped:false};
test('pilot denies missing configuration, foreign verified principals and unsupported sources',async()=>{
 assert.throws(()=>createPilotPolicy({},'WEB_READ'),/UNAVAILABLE/);
 const policy=createPilotPolicy(env,'WEB_READ');assert.deepEqual(await policy.wrap(async()=>actor)(),actor);
 await assert.rejects(()=>policy.wrap(async()=>({...actor,projectId:'other'}))(),/FORBIDDEN/);
 assert.throws(()=>policy.targets(['https://example.org/docs']),/TARGET_DENIED/);
 assert.deepEqual(policy.targets(['https://example.com/docs']),['https://example.com/docs']);
 assert.notEqual(policy.policyVersion,createPilotPolicy({...env,WEB_CAPTURE_ALLOWED_ORIGINS:'https://example.org'},'WEB_READ').policyVersion);
 assert.equal(policy.policyVersion,createPilotPolicy({...env,WEB_CONTROL_POLICY_VERSION:'v1'},'WEB_CONTROL').policyVersion);
});
test('canonical target scope fits grant transport; oversize rejected before persistence',()=>{
 const urls=['https://example.com/'+ 'a'.repeat(3000),'https://example.com/'+ 'b'.repeat(3000)];
 assert.ok(Buffer.byteLength(JSON.stringify(c.publicTargets(urls)))<=6144);
 assert.throws(()=>c.publicTargets([...urls,'https://example.com/'+ 'c'.repeat(1000)]),/INVALID_INPUT/);
 assert.throws(()=>c.publicTargets(['https://example.com/'+'é'.repeat(1500)]),/INVALID_INPUT/);
});
function client(status,body,headers={}){return createHeadlessClient({url:'https://read.example',organizationId:'org',projectId:'project',agentId:'agent',sdk:{getAgentRequestHeaders:async()=>({'x-agent-user-id':'agent','x-agent-secret-token':'synthetic'})},fetchImpl:async()=>new Response(body,{status,headers:{'content-type':'application/json','cache-control':'no-store',...headers}})});}
for(const code of ['STALE_PLAN','IDEMPOTENCY_CONFLICT','ALREADY_ADMITTED','RESULT_NOT_READY'])test('preserves safe conflict '+code,async()=>{
 await assert.rejects(()=>client(409,JSON.stringify({error:code})).inspect({planId:'plan'}),e=>e.code===code);
});
test('unknown, mismatched, oversized and malformed errors never expose diagnostics',async()=>{
 for(const [status,body,headers] of [[409,'{"error":"private-secret"}'],[503,'{"error":"STALE_PLAN"}'],[409,'x'.repeat(1025)],[409,'not json'],[409,'{"error":"STALE_PLAN"}',{'cache-control':'public'}]]){
 await assert.rejects(()=>client(status,body,headers).inspect({planId:'plan'}),e=>e.code==='UNAVAILABLE'&&!e.message.includes('private-secret'));
 }
});
test('runtime rejects foreign proposal/status and unsupported proposal before SQL or dispatch',async()=>{
 const {createWebRuntime}=require('../../lib/web/runtime');let queries=0;
 const policy=createPilotPolicy(env,'WEB_READ');let principal=actor;
 const runtime=createWebRuntime({pool:{query:async()=>{queries++;throw Error('must not query');}},redis:{eval:async()=>1,get:async()=>null},resultKey:Buffer.alloc(32),resolvePrincipal:async()=>principal,authorizeOwner:async()=>actor,authorizeConfirmation:async()=>({}),verifySearchService:async()=>({}),readSdk:{getAgentRequestHeaders:async()=>{throw Error('must not dispatch');}},readAgentId:'read',searchAgentId:'search',searchEndpoint:'https://search.example/read',policyVersion:policy.policyVersion,pilotPolicy:policy,workerId:'worker'});
 const input={organizationId:'org',projectId:'project',spec:{urls:['https://example.org'],deadlineMs:1000,maxResponseBytes:1024}};
 await assert.rejects(runtime.plan(input),/TARGET_DENIED/);
 principal={...actor,projectId:'other'};
 await assert.rejects(runtime.plan({...input,projectId:'other',spec:{...input.spec,urls:['https://example.com']}}),/FORBIDDEN/);
 await assert.rejects(runtime.read({organizationId:'org',projectId:'other',executionId:'run'}),/FORBIDDEN/);
 assert.equal(queries,0);
});
test('stored unsupported plan blocked on admission and owner dispatch, before consumption',async()=>{
 const {createPostgresAdmission}=require('../../lib/web/postgresAdmission');const {createRunAdmissionController}=require('../../lib/web/runAdmissionController');
 const policy=createPilotPolicy(env,'WEB_READ');
 const plan={version:1,planId:'plan',authSubject:'user',workspaceUserId:'user',organizationId:'org',projectId:'project',operation:'public-read',urls:['https://example.org'],policyVersion:policy.policyVersion,outputSchema:'captured-pages-v1',deadlineMs:1000,maxResponseBytes:1024,expiresAt:Date.now()+60000,retention:'transient'};
 let writes=0,ownerCalls=0;
 const repository=createPostgresAdmission({pool:{query:async(sql)=>{if(!sql.startsWith('SELECT body'))writes++;return {rows:[{body:plan}]};}},authorizeConfirmation:async()=>({}),policyVersion:policy.policyVersion,validatePlan:policy.plan});
 const admit=createRunAdmissionController({repository,resolvePrincipal:policy.wrap(async()=>actor),policyVersion:policy.policyVersion});
 await assert.rejects(admit({organizationId:'org',projectId:'project',planId:'plan',confirmationId:'confirmation',idempotencyKey:'key'}),/TARGET_DENIED/);
 await assert.rejects(policy.wrapOwner(async()=>{ownerCalls++;return actor;})(plan),/TARGET_DENIED/);
 assert.equal(writes,0);assert.equal(ownerCalls,0);
});
