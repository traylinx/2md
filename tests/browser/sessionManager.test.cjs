'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const c=require('../../lib/browser/contracts');const {createSessionManager}=require('../../lib/browser/sessionManager');
const {bound,grant}=require('./support.cjs');
function fixture(extra={}) {
 let time=Date.now(),starts=0,actions=0,closed=0,revoked=false;
 const g={...grant(time),policyVersion:c.POLICY};
 const manager=createSessionManager({runtimeEpoch:'e1',autoSweep:false,now:()=>time,
  authorize:async()=>({...g,revoked}),
  createWorker:async()=>{starts++;return {execute:async()=>{actions++;return {state:'observed'};},dispose:async()=>{closed++;}};},
  validateOutput:async(_n,result)=>result,...extra});
 return {manager,g,advance:ms=>{time+=ms;},revoke:()=>{revoked=true;},counts:()=>({starts,actions,closed})};
}
const opening={runtimeEpoch:'e1',actionId:'open1',mode:'public',url:'https://unfamiliar.example.org',purpose:'Read'};
const click=s=>({runtimeEpoch:'e1',sessionId:s,actionId:'click1',observationId:'o1',action:{type:'click',ref:'r1'}});
test('lost creation reply recovers same browser by original action ID without session ID',async()=>{
 const f=fixture();const a=await f.manager.open(bound,opening),b=await f.manager.open(bound,opening);
 assert.equal(a.sessionId,b.sessionId);assert.equal(f.counts().starts,1);
 const s=await f.manager.status(bound,{runtimeEpoch:'e1',actionId:'open1'});assert.equal(s.sessionId,a.sessionId);await f.manager.shutdown();
});
test('same action is not repeated; changed payload or runtime epoch cannot replay',async()=>{
 const f=fixture(),s=await f.manager.open(bound,opening),input=click(s.sessionId);
 await f.manager.execute(bound,'browser_act',input);await f.manager.execute(bound,'browser_act',input);assert.equal(f.counts().actions,1);
 await assert.rejects(f.manager.execute(bound,'browser_act',{...input,action:{type:'click',ref:'r2'}}),e=>e.code==='IDEMPOTENCY_CONFLICT');
 await assert.rejects(f.manager.open(bound,{...opening,runtimeEpoch:'old'}),e=>e.code==='SESSION_LOST');await f.manager.shutdown();
});
test('one pilot slot and no secret-capable sessions before authentication is implemented',async()=>{
 const f=fixture();await assert.rejects(f.manager.open(bound,{...opening,mode:'login_read'}),e=>e.code==='UNSUPPORTED');
 const s=await f.manager.open(bound,opening);await assert.rejects(f.manager.open(bound,{...opening,actionId:'other'}),e=>e.code==='CAPACITY');
 await f.manager.close(bound,s.sessionId);await f.manager.close(bound,s.sessionId);assert.equal(f.counts().closed,1);await f.manager.shutdown();
});
test('foreign hosts cannot inspect, act on, or close another session',async()=>{
 const f=fixture(),s=await f.manager.open(bound,opening),foreign={...bound,hostId:'other'};
 await assert.rejects(f.manager.execute(foreign,'browser_act',click(s.sessionId)),e=>e.code==='FORBIDDEN');
 await assert.rejects(f.manager.close(foreign,s.sessionId),e=>e.code==='FORBIDDEN');assert.equal(f.counts().actions,0);await f.manager.shutdown();
});
test('revocation closes browser and prevents old output being read',async()=>{
 const f=fixture();await f.manager.open(bound,opening);f.revoke();f.advance(10001);await f.manager.sweep();
 assert.equal(f.counts().closed,1);await assert.rejects(f.manager.status(bound,{runtimeEpoch:'e1',actionId:'open1'}));await f.manager.shutdown();
});
test('status polling cannot keep an abandoned host alive',async()=>{
 const f=fixture();await f.manager.open(bound,opening);f.advance(60001);
 await f.manager.status(bound,{runtimeEpoch:'e1',actionId:'open1'});assert.equal(f.counts().closed,1);await f.manager.shutdown();
});
test('heartbeat is separate from activity and cannot defeat idle TTL',async()=>{
 const f=fixture(),s=await f.manager.open(bound,opening);
 for(let i=0;i<3;i++){f.advance(30000);await f.manager.heartbeat(bound,s.sessionId);}
 f.advance(30001);await assert.rejects(f.manager.heartbeat(bound,s.sessionId),e=>e.code==='SESSION_LOST');assert.equal(f.counts().closed,1);await f.manager.shutdown();
});
test('receipt saturation rejects before browser execution, without evicting old receipts',async()=>{
 const f=fixture({maxReceipts:1}),s=await f.manager.open(bound,opening);
 await assert.rejects(f.manager.execute(bound,'browser_act',click(s.sessionId)),e=>e.code==='CAPACITY');
 assert.equal(f.counts().actions,0);assert.equal((await f.manager.status(bound,{runtimeEpoch:'e1',actionId:'open1'})).sessionId,s.sessionId);await f.manager.shutdown();
});
test('uncertain worker action is never retried and its error details stay private',async()=>{
 let actions=0,closed=0;const f=fixture({createWorker:async()=>({execute:async()=>{actions++;throw Error('sensitive internal content');},dispose:async()=>{closed++;}})});
 const s=await f.manager.open(bound,opening),input=click(s.sessionId),r=await f.manager.execute(bound,'browser_act',input);
 assert.equal(r.state,'outcome_unknown');assert.ok(!JSON.stringify(r).includes('sensitive'));
 const repeat=await f.manager.execute(bound,'browser_act',input);assert.equal(repeat.state,'outcome_unknown');assert.equal(actions,1);assert.equal(closed,1);await f.manager.shutdown();
});
test('cleanup failure quarantines pilot capacity instead of risking another caller',async()=>{
 const f=fixture({createWorker:async()=>({execute:async()=>({}),dispose:async()=>{throw Error('cleanup failed');}})});
 const s=await f.manager.open(bound,opening);await assert.rejects(f.manager.close(bound,s.sessionId));assert.equal(f.manager.diagnostics().quarantined,true);
 await assert.rejects(f.manager.open(bound,{...opening,actionId:'new'}),e=>e.code==='UNAVAILABLE');await f.manager.shutdown();
});
test('concurrent commands serialize; duplicate running ID recovers rather than runs twice',async()=>{
 let release,actions=0;const gate=new Promise(r=>release=r);
 const f=fixture({createWorker:async()=>({execute:async()=>{actions++;await gate;return {};},dispose:async()=>{}})});
 const s=await f.manager.open(bound,opening),input=click(s.sessionId),pending=f.manager.execute(bound,'browser_act',input);
 await new Promise(r=>setImmediate(r));assert.equal((await f.manager.execute(bound,'browser_act',input)).state,'running');
 await assert.rejects(f.manager.execute(bound,'browser_act',{...input,actionId:'different'}),e=>e.code==='BUSY');release();await pending;assert.equal(actions,1);await f.manager.shutdown();
});
test('concurrent navigation remains serialized across async scope checks',async()=>{
 let release,actions=0;const gate=new Promise(r=>release=r);
 const f=fixture({createWorker:async()=>({execute:async()=>{actions++;await gate;return {};},dispose:async()=>{}})});
 const s=await f.manager.open(bound,opening),input={runtimeEpoch:'e1',sessionId:s.sessionId,actionId:'nav1',target:{url:'https://unfamiliar.example.org/page'}};
 const first=f.manager.execute(bound,'browser_navigate',input);await new Promise(r=>setImmediate(r));
 await assert.rejects(f.manager.execute(bound,'browser_navigate',{...input,actionId:'nav2'}),e=>e.code==='BUSY');
 release();await first;assert.equal(actions,1);await f.manager.shutdown();
});
test('close during creation disposes the late handle and releases its own slot',async()=>{
 let release,closed=0;const gate=new Promise(r=>release=r);
 const f=fixture({createWorker:async()=>{await gate;return {execute:async()=>({}),dispose:async()=>{closed++;}};}});
 const pending=f.manager.open(bound,opening);await new Promise(r=>setImmediate(r));
 const receipt=await f.manager.status(bound,{runtimeEpoch:'e1',actionId:'open1'});await f.manager.close(bound,receipt.sessionId);
 release();await pending;
 // Cancellation returns without waiting for a factory that may never resolve.
 // The late handle's cleanup is observed separately, before capacity is reusable.
 await new Promise(r=>setImmediate(r));
 assert.equal(closed,1);assert.equal(f.manager.diagnostics().active,0);await f.manager.shutdown();
});
