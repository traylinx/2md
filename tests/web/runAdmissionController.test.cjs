'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {createRunAdmissionController}=require('../../lib/web/runAdmissionController');
const {alice,bob}=require('./fixtures/principals.json');const fixture=require('./fixtures/result.cjs');
test('durable request admits same logical key; never dispatches synchronously',async()=>{
 const f=fixture();let calls=0;const args=[];
 const read=createRunAdmissionController({resolvePrincipal:async()=>alice,policyVersion:'v1',repository:{loadPlan:async()=>f.plan,admit:async input=>{args.push(input);return {executionId:'r1',replayed:calls++>0};}}});
 const input={organizationId:'org-a',projectId:'project-a',planId:'p1',confirmationId:'c1',idempotencyKey:'retry-key',authorization:'Bearer synthetic'};
 assert.equal((await read(input)).replayed,false);
 const originalNow=Date.now;Date.now=()=>f.plan.expiresAt+1;
 try {assert.equal((await read(input)).executionId,'r1');} finally {Date.now=originalNow;}
 assert.equal(args[0].idempotencyKey,args[1].idempotencyKey);assert.equal(args[0].planDigest,args[1].planDigest);
 assert.ok(!JSON.stringify(args).includes('Bearer synthetic'));
});
test('foreign current principal cannot admit',async()=>{
 let called=false;const read=createRunAdmissionController({resolvePrincipal:async()=>bob,policyVersion:'v1',repository:{loadPlan:async()=>{called=true;},admit:async()=>{called=true;}}});
 await assert.rejects(read({organizationId:'org-a',projectId:'project-a',planId:'p1',confirmationId:'c1',idempotencyKey:'key'}),/FORBIDDEN/);assert.equal(called,false);
});
