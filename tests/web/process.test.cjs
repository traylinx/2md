'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {createWebProcess}=require('../../lib/web/process');
function fixture(extra={}){
 const events=[];
 const clients={pool:{},redis:{},open:async()=>events.push('open'),close:async()=>events.push('close')};
 const applicationFactory=()=>({app:(_q,r)=>r.end('route'),start:()=>events.push('worker-start'),stop:async()=>events.push('worker-stop')});
 return {events,process:createWebProcess({enabled:true,port:0,clients,applicationFactory,...extra})};
}
test('start connects before dispatcher; readiness and routes; idempotent draining stop',async()=>{
 const {events,process:p}=fixture();const address=await p.start();
 try{
 assert.deepEqual(events,['open','worker-start']);assert.deepEqual(await p.start(),address);
 const base=`http://127.0.0.1:${address.port}`;
 const ready=await fetch(base+'/health/ready');assert.equal(ready.status,200);assert.equal(ready.headers.get('cache-control'),'no-store');
 assert.equal(await (await fetch(base+'/web/v1/test')).text(),'route');
 }finally{await p.stop();await p.stop();}
 assert.deepEqual(events,['open','worker-start','worker-stop','close']);assert.equal(p.status().ready,false);await assert.rejects(p.start(),/UNAVAILABLE/);
});
test('disabled real application never opens infrastructure and never reports ready',async()=>{
 const p=createWebProcess({port:0});const a=await p.start();
 try{assert.equal((await fetch(`http://127.0.0.1:${a.port}/health/ready`)).status,503);assert.equal((await fetch(`http://127.0.0.1:${a.port}/health/live`)).status,200);}finally{await p.stop();}
});
test('bad authority rejects construction before opening clients',()=>{
 let opens=0;assert.throws(()=>createWebProcess({enabled:true,clients:{open:()=>opens++,close:async()=>{}}}),/UNAVAILABLE/);assert.equal(opens,0);
});
test('failed connection never starts worker and masks connection secrets',async()=>{
 const {events,process:p}=fixture({clients:{open:async()=>{throw Error('secret-password');},close:async()=>{}}});
 await assert.rejects(p.start(),/^WebBoundaryError: UNAVAILABLE$/);assert.equal(events.includes('worker-start'),false);await p.stop();
});
test('listener collision cleans infrastructure without starting worker',async()=>{
 const first=fixture();const a=await first.process.start();const second=fixture({port:a.port});
 try{await assert.rejects(second.process.start(),/UNAVAILABLE/);assert.deepEqual(second.events,['open','worker-stop','close']);}finally{await second.process.stop();await first.process.stop();}
});
