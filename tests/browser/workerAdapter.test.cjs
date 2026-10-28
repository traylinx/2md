'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createPersistentWorkerFactory}=require('../../lib/browser/workerAdapter');
const c=require('../../lib/browser/contracts');
async function fixture(t){
 const tempRoot=fs.mkdtempSync(path.join(os.tmpdir(),'gb01-ipc-test-'));let releases=0,losses=0;
 t.after(()=>fs.rmSync(tempRoot,{recursive:true,force:true}));
 const factory=createPersistentWorkerFactory({tempRoot,workerPath:path.join(__dirname,'fixtures/ipc-worker.cjs'),
  lease:async()=>({proxyUrl:'http://127.0.0.1:8291',release:async()=>{releases++;}})});
 const worker=await factory({sessionId:'s1',url:'https://example.org',mode:'public',limits:c.LIMITS,expiresAt:Date.now()+60000,signal:AbortSignal.timeout(5000),onLost:()=>{losses++;}});
 t.after(()=>worker.dispose());return {worker,tempRoot,releases:()=>releases,losses:()=>losses};
}
test('real child keeps state across commands with clean environment and private profile',async t=>{
 const f=await fixture(t);const one=await f.worker.execute('observe',{}),two=await f.worker.execute('observe',{});
 assert.equal(one.count,1);assert.equal(two.count,2);assert.equal(two.profileMode,0o700);assert.equal(two.environmentClean,true,JSON.stringify(two.unexpectedEnvironmentKeys));
 await f.worker.dispose();assert.equal(f.releases(),1);assert.equal(f.losses(),0);assert.deepEqual(fs.readdirSync(f.tempRoot),[]);
});
test('child crash rejects waiting command, cleanup still releases lease/profile',async t=>{
 const f=await fixture(t);await assert.rejects(f.worker.execute('crash',{}));await f.worker.dispose();assert.equal(f.releases(),1);assert.deepEqual(fs.readdirSync(f.tempRoot),[]);
});
test('cancellation kills an unresponsive real child and prevents concurrent IPC',async t=>{
 const f=await fixture(t);const controller=new AbortController();const waiting=f.worker.execute('hang',{}, {signal:controller.signal});
 assert.throws(()=>f.worker.execute('observe',{}),e=>e.code==='BUSY');controller.abort();await assert.rejects(waiting);await f.worker.dispose();assert.equal(f.releases(),1);
});
test('real child protected requests bind active action and transfer credentials without result echo',async t=>{
 const tempRoot=fs.mkdtempSync(path.join(os.tmpdir(),'gb01-private-ipc-'));t.after(()=>fs.rmSync(tempRoot,{recursive:true,force:true}));let consumed=0;
 const factory=createPersistentWorkerFactory({tempRoot,workerPath:path.join(__dirname,'fixtures/ipc-worker.cjs'),lease:async()=>({proxyUrl:'http://127.0.0.1:8291',release:async()=>{}}),protectedInputForSession:sessionId=>{
   assert.equal(sessionId,'s1');return {
     getAuthDecision:async request=>({proof:'owned',decision:{sessionId:'s1',operationId:request.actionId,operationDigest:c.digest(request),recipients:['https://example.org']}}),
     verifyDecision:async(proof,record)=>{assert.equal(proof,'owned');return record;},
     credentialAccess:async(binding,use)=>{assert.equal(binding.credentialRef,'credential1');assert.equal(consumed++,0);const secret={username:Buffer.from('owned'),password:Buffer.from('OWNED_SYNTHETIC')};try{return await use(secret);}finally{Object.values(secret).forEach(b=>b.fill(0));}},
   };
 }});
 const worker=await factory({sessionId:'s1',url:'https://example.org',mode:'login_read',limits:c.LIMITS,expiresAt:Date.now()+60000,signal:AbortSignal.timeout(5000)});t.after(()=>worker.dispose());
 const result=await worker.execute('browser_authenticate',{sessionId:'s1',actionId:'a1',credentialRef:'credential1'},{signal:AbortSignal.timeout(5000)});
 assert.deepEqual(result,{consumed:true,wiped:true});assert.equal(consumed,1);assert.doesNotMatch(JSON.stringify(result),/OWNED_SYNTHETIC/);
 await worker.dispose();assert.deepEqual(fs.readdirSync(tempRoot),[]);
});

test('unexpected child exit cleans profile and lease without a later client command',async t=>{
 const f=await fixture(t);await assert.rejects(f.worker.execute('crash',{}));
 for(let n=0;n<50&&(f.releases()===0||f.losses()===0);n++)await new Promise(r=>setTimeout(r,10));
 assert.equal(f.releases(),1);assert.equal(f.losses(),1);assert.deepEqual(fs.readdirSync(f.tempRoot),[]);
 await assert.rejects(async()=>f.worker.execute('observe',{}),e=>e.code==='SESSION_LOST');
 await f.worker.dispose();assert.equal(f.releases(),1);
});
