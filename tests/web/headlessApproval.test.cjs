'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {generateKeyPairSync}=require('node:crypto');const request=require('supertest');const express=require('express');
const {createHeadlessApproval}=require('../../lib/web/headlessApproval');const c=require('../../lib/web/contracts');const {alice}=require('./fixtures/principals.json');
function fixture(){
 const owner={...alice,kind:'agent',authSubject:'agent-a',workspaceUserId:'agent-user'};
 const plan={principalKind:'agent',version:1,planId:'p1',authSubject:owner.authSubject,workspaceUserId:owner.workspaceUserId,organizationId:owner.organizationId,projectId:owner.projectId,operation:'public-read',policyVersion:'v1',outputSchema:'captured-pages-v1',urls:['https://example.com/'],deadlineMs:1000,maxResponseBytes:1024,expiresAt:Date.now()+60000,retention:'transient'};
 const state={human:{...alice,effectiveRole:'OWNER'},queries:[],owner};const key=generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'});
 const app=express();app.use('/approve',createHeadlessApproval({privateKey:key,issuer:'control',keyId:'v1',policyVersion:'v1',
 pool:{query:async(sql,args)=>{state.queries.push({sql,args});return {rows:sql.startsWith('SELECT')?[{body:plan}]:[{confirmation_id:'c1'}]};}},resolveHuman:async()=>state.human,authorizeOwner:async()=>state.owner}));
 const call=()=>request(app).post('/approve/p1?organizationId=org-a&projectId=project-a').set('Authorization','Bearer human-control').send({planDigest:c.digest(plan),confirmationId:'c1'});
 return {app,state,plan,call};
}
test('headless control verifies current human admin, signs internally and persists approver audit',async()=>{
 const f=fixture();await request(f.app).get('/approve/p1?organizationId=org-a&projectId=project-a').set('Authorization','Bearer human-control').expect(200);
 assert.equal(f.state.queries.filter(q=>q.sql.startsWith('INSERT')).length,0);
 const response=await f.call().expect(200);assert.deepEqual(response.body,{confirmationId:'c1',planDigest:c.digest(f.plan)});
 const insert=f.state.queries.find(q=>q.sql.startsWith('INSERT'));assert.match(insert.sql,/approved_by/);assert.equal(insert.args[2],alice.authSubject);assert.ok(!JSON.stringify(f.state.queries).includes('human-control'));
});
test('member, agent impersonation, revoked owner and stale digest cannot approve',async()=>{
 for(const change of [{effectiveRole:'MEMBER'},{kind:'agent'},{projectId:'foreign'}]){const f=fixture();f.state.human={...f.state.human,...change};await f.call().expect(403);assert.equal(f.state.queries.length,0);}
 const f=fixture();f.state.owner={...f.state.owner,effectiveRole:'VIEWER'};await f.call().expect(403);assert.ok(!f.state.queries.some(q=>q.sql.startsWith('INSERT')));
});
test('agent proof, browser Origin and changed plan digest denied',async()=>{
 const f=fixture();const path='/approve/p1?organizationId=org-a&projectId=project-a';
 await request(f.app).post(path).set('X-Agent-User-Id','agent-a').send({}).expect(403);
 await request(f.app).post(path).set('Origin','https://app.example').set('Authorization','Bearer human').send({}).expect(403);
 await request(f.app).post(path).set('Authorization','Bearer human').send({planDigest:'a'.repeat(64),confirmationId:'c1'}).expect(403);
 assert.ok(!f.state.queries.some(q=>q.sql.startsWith('INSERT')));
});
test('approval command refuses noninteractive use, including an MCP-style subprocess',async()=>{
 const {spawn}=require('node:child_process');const path=require('node:path');
 const child=spawn(process.execPath,[path.resolve(__dirname,'../../scripts/web-agent-approve.js'),'p1'],{stdio:['pipe','pipe','pipe'],env:{PATH:process.env.PATH}});
 child.stdin.end();let output='';child.stderr.on('data',chunk=>output+=chunk);
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});assert.equal(code,1);assert.match(output,/Approval unavailable/);
});
