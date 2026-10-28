'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const c=require('../../lib/browser/contracts');const {createGrantAuthority}=require('../../lib/browser/grantAuthority');
const {principal,owner,bound,grant}=require('./support.cjs');
function fixture() {
 let stored,revoked=false;const api=createGrantAuthority({resolveAgent:async()=>principal,repository:{
  create:async g=>{stored=g;},get:async()=>stored&&({...stored,revoked}),revoke:async()=>{revoked=true;},
 }});return {api,get stored(){return stored;}};
}
test('owner creates recipe-free browser permission and runtime enforces its enrolled host',async()=>{
 const f=fixture();await f.api.create(grant(),owner);const g=await f.api.authorize('grant-1',bound);
 assert.equal(g.navigation.mode,'public_https');assert.equal(g.approvedBy,owner.authSubject);
 await assert.rejects(f.api.authorize('grant-1',{...bound,hostId:'stolen'}),e=>e.code==='PERMISSION_REQUIRED');
 await f.api.revoke('grant-1',owner);await assert.rejects(f.api.authorize('grant-1',bound),e=>e.code==='PERMISSION_REQUIRED');
});
test('agent cannot self-grant or revoke; other-project owner cannot grant',async()=>{
 const f=fixture();for(const who of [principal,{...owner,projectId:'other'},{...owner,effectiveRole:'MEMBER'}])
 await assert.rejects(f.api.create(grant(),who),e=>e.code==='FORBIDDEN');
 await assert.rejects(f.api.revoke('grant-1',principal),e=>e.code==='FORBIDDEN');assert.equal(f.stored,undefined);
});
test('submitted identity must resolve to the actual current agent',async()=>{
 const f=fixture();await assert.rejects(f.api.create({...grant(),agent:{...grant().agent,authSubject:'forged'}},owner),e=>e.code==='FORBIDDEN');
});
test('invalid grants, extra recipes, oversized limits and non-Ed25519 keys fail',()=>{
 for(const g of [{...grant(),recipe:{}},{...grant(),expiresAt:1},{...grant(),hostPublicKey:'not-a-key'},
  {...grant(),limits:{...c.LIMITS,absoluteMs:99999999}}, {...grant(),navigation:{mode:'origins',origins:['https://localhost']}}]) assert.throws(()=>c.parseGrant(g));
});
test('missing trusted dependencies fail closed',()=>{assert.throws(()=>createGrantAuthority(),e=>e.code==='UNAVAILABLE');});
