'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createOperationHost}=require('../../lib/browser/operationHost');
const {bound,owner,privateKey}=require('./support.cjs');
test('operation host verifies paired owner before signing or denying; no model authority',async()=>{
 let calls=[],current=owner;const record={sessionId:'s1',operationId:'op1',operationDigest:'a'.repeat(64),recipients:['https://other.example.org'],expiresAt:Date.now()+30000,nonce:'n1',reason:'recipient',method:'GET',origin:'https://other.example.org',type:'fetch',bodyBytes:0,ownerId:owner.workspaceUserId};
 const host=createOperationHost({bound,privateKey,grantId:'g1',verifyOwner:async()=>current,client:{protectedCall:async(route,input)=>{calls.push({route,input});return route==='operation-inspect'?record:{prepared:true};}}});
 current={...owner,workspaceUserId:'foreign'};await assert.rejects(host.approve('op1',{}),{code:'FORBIDDEN'});assert.equal(calls.filter(x=>x.route==='operation-complete').length,0);
 current=owner;await host.approve('op1',{});const proof=calls.find(x=>x.route==='operation-complete').input.proof;const body=JSON.parse(Buffer.from(proof.split('.')[0],'base64url'));assert.equal(body.operationDigest,record.operationDigest);assert.equal(body.operationId,'op1');assert.deepEqual(body.recipients,record.recipients);
 await host.cancel('op1',{});assert.equal(calls.at(-1).route,'operation-cancel');host.close();
});
