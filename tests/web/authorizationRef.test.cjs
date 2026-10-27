'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const c=require('../../lib/web/contracts');const fixture=require('./fixtures/result.cjs');
test('authorization reference is exact, secret-free and part of immutable digest',()=>{
 const human=fixture().plan,ref={tokenId:12,clientId:'client-a',generation:'a'.repeat(64),expiresAt:Date.now()+60000};
 const agent={...human,principalKind:'agent',authorizationRef:ref};
 const parsed=c.plan(agent);ref.tokenId=99;assert.equal(parsed.authorizationRef.tokenId,12);
 assert.notEqual(c.digest(parsed),c.digest({...parsed,authorizationRef:{...parsed.authorizationRef,tokenId:13}}));
 assert.throws(()=>c.plan({...human,authorizationRef:ref}),/INVALID_INPUT/);
 for(const bad of [{...ref,token:'secret'},{...ref,tokenId:'12'},{...ref,tokenId:0}])assert.throws(()=>c.authorizationRef(bad),/INVALID_INPUT/);
});
