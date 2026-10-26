'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {createDispatcher}=require('../../lib/web/dispatcher');
test('one tick at a time, bounded parallelism, sweeps before dispatch',async()=>{
 let release;const gate=new Promise(r=>release=r);let active=0,max=0,queries=0;const order=[];
 const dispatcher=createDispatcher({pool:{query:async(_sql,args)=>{queries++;assert.equal(args[0],2);return {rows:[{execution_id:'r1'},{execution_id:'r2'}]};}},
  reconcileExpired:async n=>{assert.equal(n,100);order.push('sweep');return 1;},processRun:async()=>{order.push('run');max=Math.max(max,++active);await gate;active--;return {state:'completed'};}});
 const first=dispatcher.tick(),second=dispatcher.tick();assert.equal(first,second);await new Promise(r=>setImmediate(r));release();await first;
 assert.equal(queries,1);assert.equal(max,2);assert.equal(order[0],'sweep');assert.equal(dispatcher.status().reconciled,1);await dispatcher.stop();
});
test('claimed execution failure is not retried within tick; diagnostics contain no raw errors',async()=>{
 let calls=0;const d=createDispatcher({pool:{query:async()=>({rows:[{execution_id:'r1'}]})},reconcileExpired:async()=>0,processRun:async()=>{calls++;throw Error('secret');}});
 await d.tick();assert.equal(calls,1);assert.equal(d.status().errors,1);assert.ok(!JSON.stringify(d.status()).includes('secret'));await d.stop();await d.tick();assert.equal(calls,1);
});
test('stop aborts active work and prevents future polls',async()=>{
 let started;const ready=new Promise(r=>started=r);const d=createDispatcher({pool:{query:async()=>({rows:[{execution_id:'r1'}]})},reconcileExpired:async()=>0,processRun:async({signal})=>{
  started();await new Promise(r=>signal.addEventListener('abort',r,{once:true}));return {state:'needs_reconciliation'};}});
 const tick=d.tick();await ready;await d.stop();await tick;assert.equal(d.status().running,false);
});
