'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPostgresAdmission } = require('../../lib/web/postgresAdmission');
const { alice, bob } = require('./fixtures/principals.json');
const c = require('../../lib/web/contracts');
const plan = () => ({version:1,planId:'p1',authSubject:alice.authSubject,workspaceUserId:alice.workspaceUserId,
 organizationId:alice.organizationId,projectId:alice.projectId,operation:'public-read',urls:['https://example.com/'],
 policyVersion:'v1',outputSchema:'captured-pages-v1',deadlineMs:1000,maxResponseBytes:1024,expiresAt:Date.now()+60000,retention:'transient'});
function setup(handler, authorizeConfirmation=async () => ({})) {
 return createPostgresAdmission({pool:{query:handler},authorizeConfirmation,policyVersion:'v1'});
}
test('requires real storage and independent confirmation authority', () => {
 assert.throws(() => createPostgresAdmission(), /UNAVAILABLE/);
 assert.throws(() => createPostgresAdmission({pool:{query(){}}}), /UNAVAILABLE/);
});
test('save is insert-only and checks canonical persisted digest', async () => {
 const p=plan(), calls=[];
 const repo=setup(async (sql,args)=>{calls.push([sql,args]);return {rows:sql.startsWith('SELECT')?[{body:p}]:[]};});
 assert.deepEqual(await repo.savePlan({plan:p,principal:alice}),p);
 assert.match(calls[0][0],/ON CONFLICT DO NOTHING/);
 await assert.rejects(repo.savePlan({plan:{...p,urls:['https://example.org/']},principal:alice}),/IDEMPOTENCY_CONFLICT/);
});
test('foreign scope and viewer never save',async()=>{
 let calls=0; const repo=setup(async()=>{calls++;return {rows:[]};});
 for(const principal of [bob,{...alice,effectiveRole:'VIEWER'}])
  await assert.rejects(repo.savePlan({plan:plan(),principal}),/FORBIDDEN/);
 assert.equal(calls,0);
});
test('confirmation requires exact trusted proof; caller token never reaches SQL',async()=>{
 const p=plan(),queries=[];
 const repo=setup(async(sql,args)=>{queries.push([sql,args]);return {rows:sql.startsWith('SELECT')?[{body:p}]:[{confirmation_id:'c1'}]};},
 async input=>{assert.equal(input.authorization,'synthetic-bearer');return {confirmationId:'c1',planDigest:c.digest(p)};});
 await repo.confirm({planId:'p1',confirmationId:'c1',principal:alice,authorization:'synthetic-bearer'});
 assert.ok(!JSON.stringify(queries).includes('synthetic-bearer'));
 const bad=setup(async()=>({rows:[{body:p}]}),async()=>({confirmed:true}));
 await assert.rejects(bad.confirm({planId:'p1',confirmationId:'c1',principal:alice}));
});
test('admit is one atomic SQL call with scoped key and stable replay reference',async()=>{
 const calls=[];const repo=setup(async(sql,args)=>{calls.push([sql,args]);return {rows:[{execution_id:'stored-run',plan_digest:'a'.repeat(64),state:'admitted',replayed:true}]};});
 const input={planId:'p1',planDigest:'a'.repeat(64),confirmationId:'c1',idempotencyKey:'key',principal:alice};
 assert.equal((await repo.admit(input)).executionId,'stored-run');
 await repo.admit({...input,principal:bob});
 assert.notEqual(calls[0][1][4],calls[1][1][4]);assert.equal(calls.length,2);
 assert.match(calls[0][0],/^SELECT \* FROM web_read.admit/);
});
test('database failures sanitized; known idempotency conflict retained',async()=>{
 for(const [error,expected] of [[{code:'P0001',message:'IDEMPOTENCY_CONFLICT'},'IDEMPOTENCY_CONFLICT'],[new Error('secret connection string'),'UNAVAILABLE']]) {
 const repo=setup(async()=>{throw error;});
 await assert.rejects(repo.admit({planId:'p1',planDigest:'a'.repeat(64),confirmationId:'c1',idempotencyKey:'key',principal:alice}),new RegExp(expected));
 }
});
