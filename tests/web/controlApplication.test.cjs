'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const request=require('supertest');
const {generateKeyPairSync}=require('node:crypto');const c=require('../../lib/web/contracts');const {alice,bob}=require('./fixtures/principals.json');
const {createControlApplication}=require('../../lib/web/controlApplication');
const keys=generateKeyPairSync('ed25519');
function fixture(){
 const plan={version:1,planId:'p1',authSubject:alice.authSubject,workspaceUserId:alice.workspaceUserId,organizationId:alice.organizationId,projectId:alice.projectId,
 operation:'public-read',urls:['https://example.com/'],policyVersion:'v1',outputSchema:'captured-pages-v1',deadlineMs:1000,maxResponseBytes:1024,expiresAt:Date.now()+60000,retention:'transient'};
 const state={owner:alice,session:alice,reads:0,writes:0,checks:0};const csrfToken='a'.repeat(43);
 const {app}=createControlApplication({enabled:true,origin:'https://control.example',privateKey:keys.privateKey.export({type:'pkcs8',format:'pem'}),issuer:'control',keyId:'v1',policyVersion:'v1',
 pool:{query:async sql=>{if(sql.startsWith('SELECT')){state.reads++;return {rows:[{body:plan}]};}assert.match(sql,/INSERT INTO web_read.confirmations/);state.writes++;return {rows:[{confirmation_id:'c1'}]};}},
 resolveSession:async()=>({principal:state.session,csrfToken,confirmationId:'c1'}),authorizeOwner:async()=>{state.checks++;return state.owner;}});
 return {app,state,plan,csrfToken,post:()=>request(app).post('/confirm/p1').set('Origin','https://control.example').type('form').send({csrfToken,planDigest:c.digest(plan)})};
}
test('real control composition reads persisted plan, rechecks owner and verifies signed proof before insert',async()=>{
 const f=fixture();await request(f.app).get('/confirm/p1').expect(200);assert.equal(f.state.writes,0);
 await f.post().expect(200);assert.equal(f.state.writes,1);assert.equal(f.state.checks,3);
 // No execution or admission route exists on this control application.
 await request(f.app).post('/web/v1/runs').send({}).expect(404);
});
test('revocation between display and approval blocks durable confirmation',async()=>{
 const f=fixture();await request(f.app).get('/confirm/p1').expect(200);f.state.owner={...alice,effectiveRole:'VIEWER'};
 await f.post().expect(403);assert.equal(f.state.writes,0);
});
test('foreign session cannot read or confirm owner plan',async()=>{
 const f=fixture();f.state.session=bob;await request(f.app).get('/confirm/p1').expect(403);await f.post().expect(403);assert.equal(f.state.writes,0);
});
test('disabled control has no dependencies or database side effects; enabled missing session fails',async()=>{
 await request(createControlApplication().app).get('/confirm/p1').expect(404);
 assert.throws(()=>createControlApplication({enabled:true}),/UNAVAILABLE/);
});
