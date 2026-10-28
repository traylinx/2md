'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {createPublicReadGrants,limits,covers}=require('../../lib/web/publicReadGrants');
const {createHeadlessAgent}=require('../../lib/web/headlessAgent');const {createHeadlessClient}=require('../../lib/web/headlessClient');
const {alice}=require('./fixtures/principals.json');
const actor={...alice,kind:'agent'};
const plan=()=>({principalKind:'agent',version:1,planId:'pp1',authSubject:actor.authSubject,workspaceUserId:actor.workspaceUserId,organizationId:actor.organizationId,projectId:actor.projectId,operation:'public-read',policyVersion:'v1',outputSchema:'captured-pages-v1',retention:'transient',expiresAt:Date.now()+60000,urls:['https://example.com/'],deadlineMs:60000,maxResponseBytes:2000000});
const spec=()=>({origins:['https://example.com'],maxUrls:5,deadlineMs:60000,maxResponseBytes:2000000,expiresAt:Date.now()+3600000});
test('standing limits validate every dimension and never accept origin paths or duplicate origins',()=>{
 assert.equal(limits(spec()).maxUrls,5);
 for(const v of [{...spec(),origins:['https://example.com/a']},{...spec(),origins:['https://example.com','https://example.com']},{...spec(),maxUrls:6},{...spec(),confirmed:true},{...spec(),expiresAt:NaN}])assert.throws(()=>limits(v));
 const g={...spec(),policyVersion:'v1'};assert.equal(covers(g,plan()),true);
 for(const p of [{...plan(),urls:['https://other.example/']},{...plan(),deadlineMs:180000},{...plan(),maxResponseBytes:2097152},{...plan(),policyVersion:'v2'}])assert.equal(covers(g,p),false);
});
test('admission delegates the atomic check to SQL, including replay after grant expiry',async()=>{
 const calls=[];const repo=createPublicReadGrants({policyVersion:'v1',pool:{query:async(sql,args)=>{calls.push({sql,args});return {rows:sql.includes('admit_public')?[{execution_id:'old-run',state:'completed',replayed:true}]:[]};}}});
 assert.equal((await repo.admit(plan(),actor)).replayed,true);assert.equal(calls[1].args[3],null);assert.match(calls[1].sql,/admit_public/);
 await assert.rejects(repo.admit(plan(),{...actor,projectId:'foreign'}),/FORBIDDEN/);
});
test('grant creation never persists bearer/secret and changed or revoked IDs conflict',async()=>{
 let saved;const repo=createPublicReadGrants({policyVersion:'v1',pool:{query:async(sql,args)=>{
  if(sql.startsWith('INSERT')){if(saved)return {rows:[]};saved={body:JSON.parse(args[2]),owner_scope:args[1],approved_by:args[3],revoked:false};return {rows:[{grant_id:args[0]}]};}return {rows:[saved]};
 }}});const input={plan:plan(),principal:actor,approvedBy:'human-owner',grantId:'g1',spec:spec()};
 await repo.create(input);await repo.create(input);assert.equal(saved.approved_by,'human-owner');
 await assert.rejects(repo.create({...input,spec:{...input.spec,maxUrls:1}}),/IDEMPOTENCY_CONFLICT/);
 saved.revoked=true;await assert.rejects(repo.create(input),/IDEMPOTENCY_CONFLICT/);
});
test('ready MCP proposal executes without a confirmation ID and recovers same plan',async()=>{
 let calls=0;const seen=[];const p=plan();
 const backend={plan:async()=>p,read:async()=>{},publicAuthorization:async()=>({canRun:true}),capabilities:async()=>({authorizationMode:'standing_public_read',livePermissionChecked:true,grants:[spec()]}),admitPublic:async args=>{seen.push(args);calls++;return {executionId:'r1',state:'admitted',replayed:calls>1,secret:'hidden'};}};
 const agent=createHeadlessAgent({backend});const cap=await agent.callTool({name:'get_read_capabilities',arguments:{}});assert.equal(cap.standingAuthorizationSupported,true);
 const proposal=await agent.callTool({name:'propose_read',arguments:{urls:p.urls}});assert.equal(proposal.state,'ready');assert.equal(proposal.approvalHandoff.ownerCommand,undefined);assert.equal(calls,0);
 const request={name:'run_public_read',arguments:{planId:p.planId}};assert.deepEqual(await agent.callTool(request),{executionId:'r1',state:'admitted',replayed:false});assert.equal((await agent.callTool(request)).replayed,true);assert.deepEqual(seen[0],seen[1]);
 await assert.rejects(agent.callTool({...request,arguments:{planId:p.planId,confirmed:true}}),/INVALID_INPUT/);
});
test('public admission HTTP forwards no owner token, only plan ID and pinned caller scope',async()=>{
 let seen;const client=createHeadlessClient({url:'https://read.example/web/v1',organizationId:'org-a',projectId:'project-a',agentId:'agent-a',sdk:{getAgentRequestHeaders:async()=>({'X-Agent-User-Id':'agent-a','X-Agent-Secret-Token':'synthetic'})},fetchImpl:async(url,options)=>{seen={url,options};return Response.json({executionId:'r1',state:'admitted',replayed:false},{headers:{'Cache-Control':'no-store'}});}});
 await client.admitPublic({planId:'p1'});assert.match(seen.url,/\/public-runs\?/);assert.deepEqual(JSON.parse(seen.options.body),{planId:'p1'});assert.equal(seen.options.headers.Authorization,undefined);
});
