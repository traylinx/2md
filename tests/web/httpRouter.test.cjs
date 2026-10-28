'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const express=require('express');const request=require('supertest');
const {createWebRouter}=require('../../lib/web/httpRouter');const {WebBoundaryError}=require('../../lib/web/contracts');
function fixture(){const calls=[];const runtime={plan:async v=>{calls.push(v);return {planId:'p1'};},confirm:async v=>{calls.push(v);return {confirmationId:'c1'};},admit:async v=>{calls.push(v);return {executionId:'r1',replayed:false};},read:async v=>{calls.push(v);return {executionId:'r1'};},grant:async()=>new Response('{}',{headers:{'Content-Type':'application/json'}})};
 const app=express();app.use('/web/v1',createWebRouter({enabled:true,runtime,allowedOrigins:['https://app.example']}));app.get('/legacy',(_req,res)=>res.send('legacy'));return {app,calls,runtime};}
test('disabled route is 404; enabled runtime must have all ports',async()=>{
 const app=express();app.use(createWebRouter());await request(app).post('/runs').expect(404);
 assert.throws(()=>createWebRouter({enabled:true}),/UNAVAILABLE/);
});
test('human admission forwards idempotency and selectors, never executes; legacy unaffected',async()=>{
 const f=fixture();await request(f.app).post('/web/v1/runs?organizationId=org&projectId=project').set('Authorization','Bearer synthetic').set('Idempotency-Key','key').send({planId:'p1',confirmationId:'c1'}).expect(202);
 assert.equal(f.calls[0].idempotencyKey,'key');assert.equal(f.calls[0].organizationId,'org');await request(f.app).get('/legacy').expect(200,'legacy');
});
test('confirmation requires allowed Origin plus bearer; hostile origin and extra fields rejected',async()=>{
 const f=fixture();const call=()=>request(f.app).post('/web/v1/plans/p1/confirmations').set('Authorization','Bearer synthetic');
 await call().send({confirmationId:'c1'}).expect(403);
 await call().set('Origin','https://evil.example').send({confirmationId:'c1'}).expect(403);
 await call().set('Origin','https://app.example').send({confirmationId:'c1',confirmed:true}).expect(422);
 await call().set('Origin','https://app.example').send({confirmationId:'c1'}).expect(403);
 await call().set('Origin','https://app.example').set('X-Web-Confirmation','header.payload.signature').send({confirmationId:'c1'}).expect(200);assert.equal(f.calls.length,1);
});
test('cookie-only and mixed-agent human calls denied; body bounded',async()=>{
 const f=fixture();await request(f.app).get('/web/v1/runs/r1').set('Cookie','session=synthetic').expect(401);
 await request(f.app).get('/web/v1/runs/r1').set('Authorization','Bearer synthetic').set('X-Agent-User-Id','agent').expect(401);
 await request(f.app).post('/web/v1/runs').set('Authorization','Bearer synthetic').send({padding:'x'.repeat(17000)}).expect(413);assert.equal(f.calls.length,0);
});
test('result errors preserve safe semantic status, hide raw backend exception',async()=>{
 const f=fixture();for(const [error,status,code] of [[new WebBoundaryError('ARTIFACT_EXPIRED'),410,'ARTIFACT_EXPIRED'],[new Error('connection password'),503,'UNAVAILABLE']]){
 f.runtime.read=async()=>{throw error;};const r=await request(f.app).get('/web/v1/runs/r1/result').set('Authorization','Bearer synthetic').expect(status);assert.equal(r.body.error,code);assert.equal(r.headers['cache-control'],'no-store');}
});
test('comparison uses the same authorized result reader and never creates a new run',async()=>{
 const f=fixture(),capture=require('./fixtures/result.cjs')().result;
 f.runtime.read=async input=>{f.calls.push(input);return {executionId:input.executionId,planDigest:'a'.repeat(64),result:capture};};
 const response=await request(f.app).get('/web/v1/runs/r1/comparison?organizationId=org&projectId=project').set('Authorization','Bearer synthetic').expect(200);
 assert.equal(response.body.comparison.state,'partial');assert.equal(response.headers['cache-control'],'no-store');assert.equal(f.calls.length,1);assert.equal(f.calls[0].result,true);
 f.runtime.read=async()=>{throw new WebBoundaryError('FORBIDDEN');};
 await request(f.app).get('/web/v1/runs/r1/comparison').set('Authorization','Bearer synthetic').expect(403);
});
test('public admission requires enabled agent execution, proof and exact body without browser authority',async()=>{
 const f=fixture();f.runtime.admitPublic=async input=>{f.calls.push(input);return {executionId:'r1',replayed:false};};
 const app=express();app.use('/web/v1',createWebRouter({enabled:true,agentExecutionEnabled:true,runtime:f.runtime,allowedOrigins:['https://app.example']}));
 const path='/web/v1/public-runs?organizationId=org&projectId=project';const call=()=>request(app).post(path).set('X-Agent-User-Id','agent-a').set('X-Agent-Secret-Token','synthetic');
 await call().send({planId:'p1'}).expect(202);assert.equal(f.calls.length,1);assert.equal(f.calls[0].planId,'p1');
 await call().send({planId:'p1',confirmed:true}).expect(422);
 await call().set('Origin','https://app.example').send({planId:'p1'}).expect(403);
 await call().set('Cookie','session=x').send({planId:'p1'}).expect(403);
 await request(app).post(path).set('Authorization','Bearer human').send({planId:'p1'}).expect(403);
 await request(f.app).post(path).set('X-Agent-User-Id','agent-a').set('X-Agent-Secret-Token','synthetic').send({planId:'p1'}).expect(403);
 f.runtime.admitPublic=async()=>{throw new WebBoundaryError('PUBLIC_READ_PERMISSION_REQUIRED');};await call().send({planId:'p1'}).expect(403);
});
