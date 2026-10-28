'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {ActionDeadline}=require('../../lib/browser/actionDeadline');
test('trusted owner wait preserves remaining action budget; resume cannot grant new time',()=>{
 let now=0;const d=new ActionDeadline(30000,undefined,{clock:()=>now});try{
 now=12000;assert.equal(d.remaining(),18000);d.pause('operation1');now=100000;assert.equal(d.remaining(),18000);
 assert.throws(()=>d.pause('operation2'),{code:'BUSY'});assert.throws(()=>d.resume('other'),{code:'PERMISSION_REQUIRED'});
 d.resume('operation1');now=110000;assert.equal(d.remaining(),8000);now=118001;assert.throws(()=>d.remaining());
 }finally{d.close();}
});
test('session cancellation still aborts a paused action and pending run',async()=>{
 const parent=new AbortController(),d=new ActionDeadline(30000,parent.signal);try{
 d.pause('operation1');const operation=d.run(()=>new Promise(()=>{})),rejected=assert.rejects(operation);parent.abort();await rejected;assert.throws(()=>d.resume('operation1'));
 }finally{d.close();}
});
