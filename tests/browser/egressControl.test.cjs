'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {createSessionEgress}=require('../../lib/browser/egressControl');
async function fixture(t){
 let time=Date.now();const token='synthetic-browser-egress-test-credential';
 const app=createSessionEgress({token,port:0,bind:'127.0.0.1',now:()=>time});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());
 const base=`http://127.0.0.1:${app.server.address().port}`;
 async function call(route,body,auth=true){const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});return {status:r.status,body:r.status===401?null:await r.json()};}
 return {app,call,advance:ms=>{time+=ms;}};
}
const lease={sessionId:'s1',ttlMs:600000,maxTrafficBytes:33554432,maxRequests:500};
test('separate controller allows long session and idempotent recovery without old ports',async t=>{
 const f=await fixture(t);assert.equal((await f.call('/lease',lease,false)).status,401);
 const a=await f.call('/lease',lease),b=await f.call('/lease',lease);assert.equal(a.status,200);assert.equal(a.body.id,b.body.id);assert.ok(![8281,8282].includes(a.body.port));
 assert.equal((await f.call('/lease',{...lease,sessionId:'other'})).status,429);
 await f.call('/release',{id:a.body.id});assert.equal(f.app.diagnostics().leased,false);
});
test('orphan egress expires without heartbeat even with ten-minute absolute lease',async t=>{
 const f=await fixture(t);await f.call('/lease',lease);f.advance(45001);await f.app.sweep();assert.equal(f.app.diagnostics().leased,false);
});
test('old capture ports and over-budget leases are rejected',async t=>{
 assert.throws(()=>createSessionEgress({token:'x'.repeat(40),port:8281}));const f=await fixture(t);
 assert.equal((await f.call('/lease',{...lease,ttlMs:600001})).status,400);
});
