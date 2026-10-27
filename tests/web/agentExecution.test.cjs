'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const express=require('express');const request=require('supertest');
const {createWebRouter}=require('../../lib/web/httpRouter');const {createPostgresAdmission}=require('../../lib/web/postgresAdmission');const {createHeadlessClient}=require('../../lib/web/headlessClient');const {configuration}=require('../../lib/web/production');const {alice}=require('./fixtures/principals.json');
test('agent run route defaults off; enabled accepts non-browser proof, never confirmation',async()=>{
 let calls=0;const runtime={plan(){},confirm(){throw Error('not allowed');},read(){},grant(){},admit:async input=>{calls++;assert.equal(input.idempotencyKey,'stable-key');assert.equal(input.agentProof.agentId,'agent-a');return {executionId:'run-a',replayed:calls>1,state:'admitted'};}};
 const app=enabled=>express().use('/web/v1',createWebRouter({enabled:true,agentExecutionEnabled:enabled,runtime,allowedOrigins:['https://app.example']}));
 const call=a=>request(a).post('/web/v1/runs?organizationId=org-a&projectId=project-a').set('X-Agent-User-Id','agent-a').set('X-Agent-Secret-Token','synthetic').set('Idempotency-Key','stable-key');
 const body={planId:'plan-a',confirmationId:'consent-a'};
 await call(app(false)).send(body).expect(403);assert.equal(calls,0);
 const enabled=app(true);await call(enabled).send(body).expect(202);await call(enabled).send(body).expect(200);
 await call(enabled).set('Origin','https://app.example').send(body).expect(403);
 await call(enabled).set('Cookie','synthetic=1').send(body).expect(403);
 await call(enabled).set('Authorization','Bearer mixed').send(body).expect(401);
 await call(enabled).send({...body,approved:true}).expect(422);assert.equal(calls,2);
 await request(enabled).post('/web/v1/plans/plan-a/confirmations').set('X-Agent-User-Id','agent-a').set('X-Agent-Secret-Token','synthetic').send({confirmationId:'c1'}).expect(403);
});
test('repository requires scoped human approval before atomic agent admission',async()=>{
 let approved=false,admissions=0;const calls=[];
 const repository=createPostgresAdmission({policyVersion:'v1',authorizeConfirmation:async()=>{},pool:{query:async(sql,args)=>{calls.push([sql,args]);
 if(sql.startsWith('SELECT c.approved_by'))return {rows:approved?[{approved_by:'human-admin'}]:[]};
 admissions++;return {rows:[{execution_id:'run-a',plan_digest:'a'.repeat(64),state:'admitted',replayed:admissions>1}]};}}});
 const input={planId:'plan-a',planDigest:'a'.repeat(64),confirmationId:'consent-a',idempotencyKey:'stable-key',principal:{...alice,kind:'agent'}};
 await assert.rejects(repository.admit(input),/INVALID_CONFIRMATION/);assert.equal(admissions,0);
 approved=true;assert.equal((await repository.admit(input)).replayed,false);assert.equal((await repository.admit(input)).replayed,true);
 assert.match(calls[0][0],/p.owner_scope=\$3 AND p.digest=\$4 AND NOT c.revoked/);
});
test('host client sends existing approval and stable idempotency key with agent proof only',async()=>{
 let seen;const client=createHeadlessClient({url:'https://read.example/web/v1',organizationId:'org-a',projectId:'project-a',agentId:'agent-a',sdk:{getAgentRequestHeaders:async()=>({'X-Agent-User-Id':'agent-a','X-Agent-Secret-Token':'synthetic',Authorization:'must-not-forward'})},fetchImpl:async(url,options)=>{seen={url,options};return Response.json({executionId:'run-a',state:'admitted',replayed:false},{status:202,headers:{'Cache-Control':'no-store'}});}});
 assert.equal((await client.admit({planId:'plan-a',confirmationId:'consent-a',idempotencyKey:'stable-key'})).executionId,'run-a');
 assert.equal(seen.options.headers['Idempotency-Key'],'stable-key');assert.equal(seen.options.headers.Authorization,undefined);
 assert.deepEqual(JSON.parse(seen.options.body),{planId:'plan-a',confirmationId:'consent-a'});
});
test('production execution gate rejects ambiguous values and missing agent configuration',()=>{
 assert.throws(()=>configuration({WEB_READ_AGENT_EXECUTION_ENABLED:'true'}),/UNAVAILABLE/);
 assert.throws(()=>configuration({WEB_READ_AGENT_EXECUTION_ENABLED:'1'}),/UNAVAILABLE/);
 assert.equal(configuration({}).agentExecutionEnabled,false);
});
