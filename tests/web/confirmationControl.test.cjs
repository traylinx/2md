'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const express=require('express');const request=require('supertest');
const {generateKeyPairSync}=require('node:crypto');const {createConfirmationControl}=require('../../lib/web/confirmationControl');
const {createConfirmationAuthority}=require('../../lib/web/confirmationAuthority');const c=require('../../lib/web/contracts');const {alice}=require('./fixtures/principals.json');
const keys=generateKeyPairSync('ed25519');
function fixture(){
 const plan={version:1,planId:'p1',authSubject:alice.authSubject,workspaceUserId:alice.workspaceUserId,organizationId:alice.organizationId,projectId:alice.projectId,
 operation:'public-read',urls:['https://example.com/'],policyVersion:'v1',outputSchema:'captured-pages-v1',deadlineMs:1000,maxResponseBytes:1024,expiresAt:Date.now()+60000,retention:'transient'};
 const csrfToken='a'.repeat(43),calls=[];const authority=createConfirmationAuthority({publicKey:keys.publicKey.export({type:'spki',format:'pem'}),issuer:'control',keyId:'v1'});
 const app=express();app.use('/confirm',createConfirmationControl({origin:'https://control.example',privateKey:keys.privateKey.export({type:'pkcs8',format:'pem'}),issuer:'control',keyId:'v1',
 resolveSession:async({cookie})=>{if(cookie!=='session=owned')c.deny('FORBIDDEN');return {principal:alice,csrfToken,confirmationId:'c1'};},
 loadPlan:async()=>plan,confirm:async input=>{calls.push(input);return authority({...input,planDigest:c.digest(plan)});}}));
 return {app,plan,csrfToken,calls};
}
test('page displays exact plan without signing or executing; browser protections set',async()=>{
 const f=fixture();const response=await request(f.app).get('/confirm/p1').set('Cookie','session=owned').expect(200);
 assert.match(response.text,/https:\/\/example.com\//);assert.ok(response.text.includes(c.digest(f.plan)));assert.equal(f.calls.length,0);
 assert.match(response.headers['content-security-policy'],/frame-ancestors 'none'/);assert.equal(response.headers['cache-control'],'no-store');
});
test('explicit CSRF-protected approval issues verifier-compatible proof only server-side',async()=>{
 const f=fixture();const response=await request(f.app).post('/confirm/p1').set('Cookie','session=owned').set('Origin','https://control.example')
 .type('form').send({csrfToken:f.csrfToken,planDigest:c.digest(f.plan)}).expect(200);
 assert.equal(f.calls.length,1);assert.ok(!response.text.includes(f.calls[0].confirmationProof));assert.equal(f.calls[0].confirmationId,'c1');
});
test('model bearer, missing session, hostile origin and forged CSRF never issue',async()=>{
 const f=fixture();await request(f.app).get('/confirm/p1').set('Authorization','Bearer model').expect(403);
 await request(f.app).get('/confirm/p1').expect(403);
 for(const [origin,csrf] of [['https://evil.example',f.csrfToken],['https://control.example','wrong'],['',f.csrfToken]]){
 let req=request(f.app).post('/confirm/p1').set('Cookie','session=owned');if(origin)req=req.set('Origin',origin);
 await req.type('form').send({csrfToken:csrf,planDigest:c.digest(f.plan)}).expect(403);
 }assert.equal(f.calls.length,0);
});
test('changed displayed plan digest, expired plan and caller-selected confirmation denied',async()=>{
 const f=fixture();const post=body=>request(f.app).post('/confirm/p1').set('Cookie','session=owned').set('Origin','https://control.example').type('form').send(body);
 await post({csrfToken:f.csrfToken,planDigest:'b'.repeat(64)}).expect(403);
 await post({csrfToken:f.csrfToken,planDigest:c.digest(f.plan),confirmationId:'chosen'}).expect(403);
 f.plan.expiresAt=Date.now()-1;await post({csrfToken:f.csrfToken,planDigest:c.digest(f.plan)}).expect(409);assert.equal(f.calls.length,0);
});
