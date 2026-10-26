'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {generateKeyPairSync,sign}=require('node:crypto');
const {createConfirmationAuthority}=require('../../lib/web/confirmationAuthority');
const {alice}=require('./fixtures/principals.json');
const keys=generateKeyPairSync('ed25519');const publicKey=keys.publicKey.export({type:'spki',format:'pem'});
const authority=createConfirmationAuthority({publicKey,issuer:'human-control',keyId:'v1'});
function fixture(overrides={},headerOverrides={},privateKey=keys.privateKey){
 const now=Math.floor(Date.now()/1000);
 const body={iss:'human-control',aud:'web-read-confirmation',scope:'web:confirm',sub:alice.authSubject,
 workspaceUserId:alice.workspaceUserId,organizationId:alice.organizationId,projectId:alice.projectId,
 planId:'plan-1',planDigest:'a'.repeat(64),confirmationId:'confirm-1',iat:now,exp:now+60,...overrides};
 const header={alg:'EdDSA',typ:'web-confirm+jwt',kid:'v1',...headerOverrides};
 const data=[header,body].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
 return {principal:alice,planId:'plan-1',planDigest:'a'.repeat(64),confirmationId:'confirm-1',
 confirmationProof:data+'.'+sign(null,Buffer.from(data),privateKey).toString('base64url')};
}
test('valid separately signed exact-plan proof supports identical confirmation retry',async()=>{
 const input=fixture();const expected={confirmationId:input.confirmationId,planDigest:input.planDigest};
 assert.deepEqual(await authority(input),expected);assert.deepEqual(await authority(input),expected);
});
test('every authority and plan binding must match',async()=>{
 for(const field of ['iss','aud','scope','sub','workspaceUserId','organizationId','projectId','planId','planDigest','confirmationId'])
 await assert.rejects(authority(fixture({[field]:'different'})),/INVALID_CONFIRMATION/,field);
});
test('expired, future, excessive lifetime and noninteger timestamps denied',async()=>{
 const now=Math.floor(Date.now()/1000);
 for(const v of [{exp:now},{iat:now+10},{exp:now+121},{iat:'now'},{exp:now+0.5},{iat:now,exp:now-1}])
 await assert.rejects(authority(fixture(v)),/INVALID_CONFIRMATION/);
});
test('algorithm, key, type substitution and unknown claims denied',async()=>{
 for(const v of [{alg:'none'},{alg:'HS256'},{kid:'other'},{typ:'JWT'},{jku:'https://evil.example'}])
 await assert.rejects(authority(fixture({},v)),/INVALID_CONFIRMATION/);
 await assert.rejects(authority(fixture({confirmed:true})),/INVALID_CONFIRMATION/);
 await assert.rejects(authority(fixture({}, {},generateKeyPairSync('ed25519').privateKey)),/INVALID_CONFIRMATION/);
});
test('missing, malformed, oversized and mutated assertions denied; bearer alone insufficient',async()=>{
 const input=fixture();
 for(const proof of [undefined,'yes','x.y.z','a'.repeat(4097),input.confirmationProof+'.extra',input.confirmationProof.replace(/^./,'!')])
 await assert.rejects(authority({...input,authorization:'Bearer synthetic',confirmationProof:proof}),/INVALID_CONFIRMATION/);
});
test('cancelled request and invalid configured key fail closed',async()=>{
 const controller=new AbortController();controller.abort();
 await assert.rejects(authority({...fixture(),signal:controller.signal}),/CANCELLED/);
 assert.throws(()=>createConfirmationAuthority({publicKey:'invalid',issuer:'human-control',keyId:'v1'}),/UNAVAILABLE/);
});
test('HTTP to runtime to repository verifies signed persisted plan and never stores assertion',async()=>{
 const request=require('supertest');const {randomBytes}=require('node:crypto');
 const {createWebApplication}=require('../../lib/web/application');const c=require('../../lib/web/contracts');
 const plan={version:1,planId:'plan-1',authSubject:alice.authSubject,workspaceUserId:alice.workspaceUserId,
 organizationId:alice.organizationId,projectId:alice.projectId,operation:'public-read',urls:['https://example.com/'],
 policyVersion:'v1',outputSchema:'captured-pages-v1',deadlineMs:1000,maxResponseBytes:1024,expiresAt:Date.now()+60000,retention:'transient'};
 const queries=[];const dependencies={pool:{query:async(sql,args)=>{queries.push([sql,args]);return {rows:sql.startsWith('SELECT')?[{body:plan}]:[{confirmation_id:'confirm-1'}]};}},
 redis:{eval:async()=>1,get:async()=>null},resultKey:randomBytes(32),resolvePrincipal:async()=>alice,authorizeOwner:async()=>alice,
 confirmationAuthority:{publicKey,issuer:'human-control',keyId:'v1'},verifySearchService:async()=>{throw Error('unused');},
 readSdk:{getAgentRequestHeaders:async()=>{throw Error('unused');}},readAgentId:'read-id',searchAgentId:'search-id',
 searchEndpoint:'https://search.example/internal/read',policyVersion:'v1',workerId:'worker1'};
 const application=createWebApplication({enabled:true,allowedOrigins:['https://app.example'],dependencies});
 const proof=fixture({planDigest:c.digest(plan)}).confirmationProof;
 const call=token=>request(application.app).post('/web/v1/plans/plan-1/confirmations?organizationId=org-a&projectId=project-a')
 .set('Authorization','Bearer synthetic').set('Origin','https://app.example').set('X-Web-Confirmation',token).send({confirmationId:'confirm-1'});
 try{
 await call(fixture().confirmationProof).expect(403);assert.equal(queries.filter(q=>q[0].startsWith('INSERT')).length,0);
 const response=await call(proof).expect(200);assert.equal(response.body.planDigest,c.digest(plan));
 assert.equal(queries.filter(q=>q[0].startsWith('INSERT')).length,1);assert.ok(!JSON.stringify(queries).includes(proof));
 }finally{await application.stop();}
});
