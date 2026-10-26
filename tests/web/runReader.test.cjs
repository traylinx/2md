'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {createRunReader}=require('../../lib/web/runReader');const {readResult}=require('../../lib/web/readResult');
const fixture=require('./fixtures/result.cjs');const {alice,bob}=require('./fixtures/principals.json');
function setup(){
 const f=fixture(),expiresAt=Date.now()+60000,calls={get:0,resolve:0};
 const row={execution_id:'r1',digest:f.ref.planDigest,fence:'1',state:'completed',result_state:'partial',result_expires_at:String(expiresAt),body:f.plan};
 let current=alice;
 const ports={pool:{query:async()=>({rows:[row]})},resolvePrincipal:async()=>{calls.resolve++;return current;},results:{get:async()=>{calls.get++;return {expiresAt,result:f.result};}}};
 return {...f,row,ports,calls,read:createRunReader(ports),setActor:a=>{current=a;},input:{executionId:'r1',organizationId:alice.organizationId,projectId:alice.projectId,result:true,authorization:'Bearer synthetic'}};
}
test('creator result read preserves partial and degraded content; rechecks permissions',async()=>{
 const f=setup(),r=await f.read(f.input);assert.equal(r.result.state,'partial');assert.equal(r.result.pages[0].quality,'degraded');assert.equal(f.calls.resolve,2);
});
test('foreign principal cannot read run or touch stored content',async()=>{
 const f=setup();f.setActor(bob);await assert.rejects(f.read(f.input),/FORBIDDEN/);assert.equal(f.calls.get,0);
});
test('revocation during result load withholds content',async()=>{
 const f=setup();f.ports.results.get=async()=>{f.setActor(bob);return {expiresAt:Number(f.row.result_expires_at),result:f.result};};
 await assert.rejects(f.read(f.input),/FORBIDDEN/);
});
test('pending run and expired content have distinct errors; metadata needs no result cache',async()=>{
 const f=setup();f.row.state='running';await assert.rejects(f.read(f.input),/RESULT_NOT_READY/);
 f.row.state='completed';f.row.result_expires_at='1';await assert.rejects(f.read(f.input),/ARTIFACT_EXPIRED/);
 const r=await f.read({...f.input,result:false});assert.equal(r.state,'completed');assert.equal(f.calls.get,0);
});
test('malformed content, foreign targets and invalid digest rejected before publication',()=>{
 const f=fixture();for(const edit of [r=>{r.pages[0].sha256='bad';},r=>{r.pages[0].url='https://evil.example/';},r=>{r.state='complete';},r=>{r.pages[0].cookies='secret';}]){
 const copy=JSON.parse(JSON.stringify(f.result));edit(copy);assert.throws(()=>readResult(copy,f.plan));
 }
});
