'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {EventEmitter}=require('node:events');const request=require('supertest');
const {createRuntimeClients}=require('../../lib/web/runtimeClients');const {createWebRuntime}=require('../../lib/web/runtime');const {createWebApplication}=require('../../lib/web/application');
const {alice}=require('./fixtures/principals.json');const {randomBytes}=require('node:crypto');
test('clients have bounded pools/deadlines, no offline queue or auto-resend; no connect until open',async()=>{
 let pg,cache,connects=0,closed=0;
 class Pool extends EventEmitter{constructor(config){super();pg=config;}async query(){return {rows:[]};}async end(){closed++;}}
 class Redis extends EventEmitter{constructor(_url,config){super();cache=config;}async connect(){connects++;}disconnect(){}}
 const clients=createRuntimeClients({postgresUrl:'postgresql://db.example/test',redisUrl:'redis://cache.example',Pool,Redis});
 assert.equal(connects,0);assert.equal(pg.max,4);assert.equal(pg.statement_timeout,5000);assert.equal(cache.autoResendUnfulfilledCommands,false);assert.equal(cache.enableOfflineQueue,false);assert.equal(cache.retryStrategy(),null);
 await clients.open();await clients.close();assert.equal(connects,1);assert.equal(closed,1);
});
test('disabled application has no infrastructure side effects; enabled missing authority refuses startup',async()=>{
 const app=createWebApplication();await request(app.app).get('/web/v1/runs/r1').expect(404);await app.stop();
 assert.throws(()=>createWebApplication({enabled:true}),/UNAVAILABLE/);assert.throws(()=>createWebRuntime({}),/UNAVAILABLE/);
});
test('composed HTTP plan uses real contracts and repository but never starts worker implicitly',async()=>{
 let stored,queries=0,proofs=0;
 const dependencies={pool:{query:async(sql,args)=>{queries++;if(sql.startsWith('INSERT')){stored=JSON.parse(args[3]);return {rows:[]};}return {rows:[{body:stored}]};}},
 redis:{eval:async()=>1,get:async()=>null},resultKey:randomBytes(32),resolvePrincipal:async()=>alice,
 authorizeOwner:async()=>alice,authorizeConfirmation:async()=>{throw Error('not confirmed');},verifySearchService:async()=>{throw Error('not service');},
 readSdk:{getAgentRequestHeaders:async()=>{proofs++;throw Error('must not dispatch');}},readAgentId:'read-id',searchAgentId:'search-id',searchEndpoint:'https://search.example/internal/read',policyVersion:'v1',workerId:'worker1'};
 const app=createWebApplication({enabled:true,allowedOrigins:['https://app.example'],dependencies});
 const response=await request(app.app).post('/web/v1/plans?organizationId=org-a&projectId=project-a').set('Authorization','Bearer synthetic').send({urls:['https://example.com/'],deadlineMs:1000,maxResponseBytes:1024}).expect(201);
 assert.equal(response.body.authSubject,alice.authSubject);assert.equal(stored.projectId,alice.projectId);assert.equal(queries,2);assert.equal(proofs,0);assert.equal(app.runtime.dispatcher.status().running,false);await app.stop();
});
