'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const c=require('../../lib/browser/contracts');const {createPostgresGrants}=require('../../lib/browser/postgresGrants');
const {grant,owner,bound}=require('./support.cjs');
function fixture() {
 let record,revoked=false;const calls=[];const repo=createPostgresGrants({pool:{query:async q=>{
  calls.push(q);
  if(q.text.includes('INSERT')) {if(record)return {rows:[]};record=JSON.parse(q.values[5]);return {rows:[{grant_id:record.grantId}]};}
  const matches=record&&q.values[0]===record.grantId&&q.values[1]===record.agent.organizationId&&q.values[2]===record.agent.projectId;
  if(q.text.includes('UPDATE')){if(!matches)return {rows:[]};revoked=true;return {rows:[{grant_id:record.grantId}]};}
  return {rows:matches?[{body:record,revoked}]:[]};
 }}});return {repo,calls};
}
const stored=()=>({...grant(),policyVersion:c.POLICY,approvedBy:owner.authSubject,approvedByWorkspaceUserId:owner.workspaceUserId,hostKeyFingerprint:bound.hostKeyFingerprint});
const scope={grantId:'grant-1',organizationId:'org-1',projectId:'project-1'};
test('permission repository uses scoped parameterized queries and idempotent creation',async()=>{
 const f=fixture(),g=stored();await f.repo.create(g);await f.repo.create(g);assert.equal((await f.repo.get(scope)).grantId,'grant-1');
 assert.ok(f.calls.every(q=>q.query_timeout===5000&&!q.text.includes(g.agent.organizationId)));
 await assert.rejects(f.repo.create({...g,approvedBy:'different'}),e=>e.code==='IDEMPOTENCY_CONFLICT');
});
test('revoked permissions cannot be recreated; cross-tenant lookups disclose nothing',async()=>{
 const f=fixture(),g=stored();await f.repo.create(g);assert.equal(await f.repo.get({...scope,projectId:'other'}),null);
 await assert.rejects(f.repo.revoke({...scope,projectId:'other'}),e=>e.code==='FORBIDDEN');
 await f.repo.revoke(scope);await assert.rejects(f.repo.create(g),e=>e.code==='IDEMPOTENCY_CONFLICT');
});
test('storage errors do not leak database details; cancellation is fail-closed',async()=>{
 const f=createPostgresGrants({pool:{query:async()=>{throw Error('connection credentials');}}});
 await assert.rejects(f.get(scope),e=>e.code==='UNAVAILABLE'&&!e.message.includes('credentials'));
 await assert.rejects(f.get(scope,{signal:AbortSignal.abort()}),e=>e.code==='CANCELLED');
});
