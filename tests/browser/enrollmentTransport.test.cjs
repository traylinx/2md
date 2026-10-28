'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {randomBytes,createHash}=require('node:crypto');
const express=require('express'),request=require('supertest');
const {createEnrollment}=require('../../lib/browser/enrollment');
const {signEnrollment}=require('../../lib/browser/enrollmentProof');
const {createBrowserEnrollmentRouter}=require('../../routes/browserEnrollment');
const {createBrowserControlRouter}=require('../../routes/browserControl');
const {principal,owner,grant,privateKey}=require('./support.cjs');
const c=require('../../lib/browser/contracts');
test('first-host transport verifies Sentinel and new key before owner grant creation; replay and substitution fail',async()=>{
 const records=new Map(),seen=new Set();let checked=0;
 const repository={create:async r=>records.set(r.grantId,r),get:async({grantId})=>records.get(grantId),revoke:async({grantId})=>records.delete(grantId)};
 const enrollment=createEnrollment({repository,resolveCurrentAgent:async()=>principal});
 const app=express();app.use('/api/browser/enrollment/v1',createBrowserEnrollmentRouter({enrollment,resolvePrincipal:async({credentials})=>{checked++;if(credentials['x-agent-secret-token']!=='synthetic')c.deny('UNAUTHENTICATED');return principal;},consumeNonce:async({nonce})=>{if(seen.has(nonce))return false;seen.add(nonce);return true;}}));
 app.use('/api/browser/control/v1',createBrowserControlRouter({enabled:true,enrollment,grantsEnabled:false,resolveHuman:async({authorization})=>{if(authorization!=='Bearer owned-human')c.deny('FORBIDDEN');return owner;},pairingOrigin:'https://traylinx.example.org'}));
 const headers={'X-Organization-Id':principal.organizationId,'X-Project-Id':principal.projectId,'X-Agent-User-Id':principal.authSubject,'X-Agent-Secret-Token':'synthetic'};
 const verifier=randomBytes(32).toString('base64url'),input={hostId:'newhost',hostPublicKey:grant().hostPublicKey,state:randomBytes(32).toString('base64url'),challenge:createHash('sha256').update(verifier).digest('base64url'),redirectUri:'http://127.0.0.1:54321/pair/callback',operations:['browser:public','browser:login_read']};
 const path='/api/browser/enrollment/v1/begin';const proof=signEnrollment({principal,hostId:input.hostId,hostPublicKey:input.hostPublicKey,privateKey,path,body:input});
 try{
 await request(app).post(path).set({...headers,'X-Agent-Secret-Token':'invalid'}).send(input).expect(401);assert.equal(records.size,0);
 assert.deepEqual((await request(app).post('/api/browser/enrollment/v1/identity').set(headers).send({}).expect(200)).body,principal);
 await request(app).post(path).set(headers).set('X-Browser-Enrollment-Proof',proof).send({...input,state:'a'.repeat(43)}).expect(401);
 const pending=(await request(app).post(path).set(headers).set('X-Browser-Enrollment-Proof',proof).send(input).expect(200)).body;assert.equal(records.size,0);
 await request(app).post(path).set(headers).set('X-Browser-Enrollment-Proof',proof).send(input).expect(401);
 const base='/api/browser/control/v1/enrollments/'+pending.enrollmentId;
 const scope='?organizationId='+principal.organizationId+'&projectId='+principal.projectId;
 const preview=(await request(app).post(base+'/inspect'+scope).set('Authorization','Bearer owned-human').set('Origin','https://traylinx.example.org').send({}).expect(200)).body;assert.deepEqual(preview.operations,input.operations);assert.equal(records.size,0);
 await request(app).post(base+'/approve'+scope).set(headers).send({}).expect(403);
 const approved=(await request(app).post(base+'/approve'+scope).set('Authorization','Bearer owned-human').set('Origin','https://traylinx.example.org').send({}).expect(200)).body;assert.equal(records.size,1);
 const callback=new URL(approved.redirectUri),exchange={enrollmentId:pending.enrollmentId,state:input.state,code:callback.searchParams.get('code'),verifier};
 const exchangePath='/api/browser/enrollment/v1/exchange',exchangeProof=signEnrollment({principal,hostId:input.hostId,hostPublicKey:input.hostPublicKey,privateKey,path:exchangePath,body:exchange});
 const result=(await request(app).post(exchangePath).set(headers).set('X-Browser-Enrollment-Proof',exchangeProof).send(exchange).expect(200)).body;assert.equal(result.grantId,pending.grantId);assert.equal(result.owner.workspaceUserId,owner.workspaceUserId);
 await request(app).post(exchangePath).set(headers).set('X-Browser-Enrollment-Proof',exchangeProof).send(exchange).expect(410);assert.ok(checked>5);
 }finally{enrollment.close();}
});
