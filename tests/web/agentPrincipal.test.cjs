'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const request=require('supertest');const {randomBytes}=require('node:crypto');
const {createAgentPrincipalResolver,createCallerResolver}=require('../../lib/web/agentPrincipal');const {createWebApplication}=require('../../lib/web/application');const c=require('../../lib/web/contracts');const {alice}=require('./fixtures/principals.json');
const actor={...alice,kind:'agent'};const proof={agentId:actor.authSubject,token:'synthetic-proof'};
test('fixed Workspace lookup forwards proof without bearer; exact returned identity is mandatory',async()=>{
 let received;const resolve=createAgentPrincipalResolver({url:'https://workspace.example/access',fetchImpl:async(url,options)=>{received={url,options};return Response.json(actor,{headers:{'Cache-Control':'no-store'}});}});
 assert.deepEqual(await resolve({agentProof:proof,organizationId:actor.organizationId,projectId:actor.projectId}),actor);
 assert.equal(received.options.headers.Authorization,undefined);assert.equal(received.options.headers['X-Agent-User-Id'],actor.authSubject);
 await assert.rejects(resolve({authorization:'Bearer mixed',agentProof:proof,organizationId:actor.organizationId,projectId:actor.projectId}),/UNAUTHENTICATED/);
 const wrong=createAgentPrincipalResolver({url:'https://workspace.example/access',fetchImpl:async()=>Response.json(alice,{headers:{'Cache-Control':'no-store'}})});
 await assert.rejects(wrong({agentProof:proof,organizationId:actor.organizationId,projectId:actor.projectId}),/FORBIDDEN/);
});
test('router/runtime persist a distinct agent plan; confirmation and admission remain blocked',async()=>{
 let stored;const resolver=createCallerResolver({human:async()=>alice,agent:async input=>{assert.deepEqual(input.agentProof,proof);return actor;}});
 const app=createWebApplication({enabled:true,allowedOrigins:['https://app.example'],dependencies:{
 pool:{query:async(sql,args)=>{if(sql.startsWith('INSERT')){stored=JSON.parse(args[3]);return {rows:[]};}return {rows:[{body:stored}]};}},redis:{eval:async()=>1,get:async()=>null},resultKey:randomBytes(32),
 resolvePrincipal:resolver,authorizeOwner:async()=>actor,authorizeConfirmation:async()=>{throw Error('must not confirm');},verifySearchService:async()=>{},readSdk:{getAgentRequestHeaders:async()=>{}},
 readAgentId:'read',searchAgentId:'search',searchEndpoint:'https://search.example/read',policyVersion:'v1',workerId:'worker-1'}});
 const call=path=>request(app.app).post(path).set('X-Agent-User-Id',proof.agentId).set('X-Agent-Secret-Token',proof.token);
 try{
 await call('/web/v1/plans?organizationId=org-a&projectId=project-a').send({urls:['https://example.com/'],deadlineMs:1000,maxResponseBytes:1024}).expect(201);
 const inspected=await request(app.app).get('/web/v1/plans/'+stored.planId+'?organizationId=org-a&projectId=project-a').set('X-Agent-User-Id',proof.agentId).set('X-Agent-Secret-Token',proof.token).expect(200);
 assert.deepEqual(inspected.body,stored);
 await request(app.app).get('/web/v1/plans/'+stored.planId+'?organizationId=org-a&projectId=project-a').set('Authorization','Bearer synthetic').expect(403);
 assert.equal(stored.principalKind,'agent');c.bindPrincipal(actor,stored);assert.throws(()=>c.bindPrincipal(alice,stored),/FORBIDDEN/);
 const humanPlan={...stored};delete humanPlan.principalKind;assert.notEqual(c.digest(stored),c.digest(humanPlan));assert.throws(()=>c.bindPrincipal(actor,humanPlan),/FORBIDDEN/);
 await call('/web/v1/runs').send({planId:stored.planId,confirmationId:'c1'}).expect(403);
 await call(`/web/v1/plans/${stored.planId}/confirmations`).set('Origin','https://app.example').send({confirmationId:'c1'}).expect(403);
 }finally{await app.stop();}
});
