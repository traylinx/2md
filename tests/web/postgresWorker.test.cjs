'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {createPostgresWorker}=require('../../lib/web/postgresWorker');
test('worker storage fails closed without pool and rejects invalid claim bounds',async()=>{
 assert.throws(()=>createPostgresWorker(),/UNAVAILABLE/);
 let calls=0;const store=createPostgresWorker({pool:{query:async()=>{calls++;return {rows:[]};}}});
 for(const leaseMs of [null,0,180001]) await assert.rejects(store.claim({executionId:'r1',workerId:'w1',leaseMs}),/INVALID_INPUT/);
 assert.equal(calls,0);assert.equal(await store.claim({executionId:'r1',workerId:'w1'}),null);
});
test('terminal updates carry exact fence and preserve partial outcome',async()=>{
 const calls=[];const store=createPostgresWorker({pool:{query:async(sql,args)=>{calls.push(args);return {rows:[{accepted:true}]};}}});
 assert.equal(await store.finish({executionId:'r1',workerId:'w1',fence:'8',state:'completed',resultState:'partial'}),true);
 assert.deepEqual(calls[0],['r1','w1','8','completed','partial']);
 await assert.rejects(store.finish({executionId:'r1',workerId:'w1',fence:'0',state:'completed'}));
});
test('bounded sweeper and DB error sanitization',async()=>{
 const store=createPostgresWorker({pool:{query:async()=>{throw Error('sensitive backend');}}});
 await assert.rejects(store.reconcileExpired(1001),/INVALID_INPUT/);
 await assert.rejects(store.reconcileExpired(),/UNAVAILABLE/);
});
