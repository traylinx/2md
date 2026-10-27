'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createReadWorker } = require('../../lib/web/readWorker');
const { alice, bob } = require('./fixtures/principals.json');
function fixture(options={}) {
 const calls={execute:0,finish:[]};
 const {plan,result,ref:claim}=require('./fixtures/result.cjs')();
 const store={claim:async()=>claim,finish:async value=>{calls.finish.push(value);return true;},...options.store};
 const worker=createReadWorker({store,authorize:async()=>alice,execute:async ref=>{calls.execute++; assert.deepEqual(Object.keys(ref).sort(),['executionId','fence','planDigest','workerId']);return {state:'partial',result};},results:{put:async()=>Date.now()+60000},policyVersion:'v1',workerId:'w1',...options,store});
 return {worker,calls,claim};
}
test('partial outcome preserved, content not returned or persisted in run metadata',async()=>{
 const f=fixture();const r=await f.worker({executionId:'r1'});
 assert.equal(r.state,'completed');assert.equal(r.resultState,'partial');assert.equal(f.calls.execute,1);
 assert.equal(f.calls.finish[0].resultState,'partial');assert.ok(!JSON.stringify([r,f.calls.finish]).includes('private output'));
});
test('duplicate claim cannot execute',async()=>{
 const f=fixture({store:{claim:async()=>null}});assert.equal((await f.worker({executionId:'r1'})).state,'not_claimed');assert.equal(f.calls.execute,0);
});
test('revoked/foreign membership prevents dispatch',async()=>{
 const f=fixture({authorize:async()=>bob});assert.equal((await f.worker({executionId:'r1'})).state,'failed');assert.equal(f.calls.execute,0);
});
test('transport uncertainty never retries, marks reconciliation',async()=>{
 let count=0;const f=fixture({execute:async()=>{count++;throw Error('unknown remote outcome');}});
 assert.equal((await f.worker({executionId:'r1'})).state,'needs_reconciliation');assert.equal(count,1);
});
test('stale fence completion does not claim success',async()=>{
 const f=fixture({store:{finish:async()=>false}});const r=await f.worker({executionId:'r1'});assert.equal(r.state,'needs_reconciliation');assert.equal(r.resultState,null);
});
test('abort during authority check cannot dispatch',async()=>{
 const controller=new AbortController();const f=fixture({authorize:async()=>{controller.abort();return alice;}});
 await f.worker({executionId:'r1',signal:controller.signal});assert.equal(f.calls.execute,0);
});
test('stale policy fails before authorization/dispatch',async()=>{
 const f=fixture();f.claim.plan.policyVersion='old';assert.equal((await f.worker({executionId:'r1'})).state,'failed');assert.equal(f.calls.execute,0);
});
test('lost terminal update reports uncertainty',async()=>{
 const f=fixture({store:{finish:async()=>{throw Error('db disconnected');}}});assert.equal((await f.worker({executionId:'r1'})).state,'needs_reconciliation');
});
test('invalid captured data never reaches result storage or completed state',async()=>{
 let writes=0;const f=fixture({execute:async()=>({state:'complete',result:{state:'complete'}}),results:{put:async()=>{writes++;return Date.now()+1000;}}});
 assert.equal((await f.worker({executionId:'r1'})).state,'needs_reconciliation');assert.equal(writes,0);
});
test('result-store failure cannot publish completion or cause capture retry',async()=>{
 const f=fixture({results:{put:async()=>{throw Error('cache unavailable');}}});
 assert.equal((await f.worker({executionId:'r1'})).state,'needs_reconciliation');assert.equal(f.calls.execute,1);
});
test('worker records its capture window in encrypted result, not upstream-supplied timestamps',async()=>{
 let saved;const before=Date.now();const f=fixture({results:{put:async(_claim,result)=>{saved=result;return Date.now()+60000;}}});
 await f.worker({executionId:'r1'});assert.ok(saved.collectionWindow.startedAt>=before);assert.ok(saved.collectionWindow.finishedAt>=saved.collectionWindow.startedAt);assert.ok(saved.collectionWindow.finishedAt<=Date.now());
});
