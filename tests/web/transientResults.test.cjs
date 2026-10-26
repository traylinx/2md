'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const Redis=require('ioredis');const {randomBytes}=require('node:crypto');
const {createTransientResults}=require('../../lib/web/transientResults');const fixture=require('./fixtures/result.cjs');
test('encrypted scoped result store: real isolated Redis, bounded TTL/capacity, no overwrite', {skip:process.env.RUN_TRANSIENT_REDIS!=='1',timeout:15000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'read-results-'));const socket=path.join(dir,'redis.sock');
 const child=spawn(process.env.REDIS_SERVER||'redis-server',['--port','0','--unixsocket',socket,'--unixsocketperm','700','--save','','--appendonly','no','--maxmemory','64mb','--dir',dir],{stdio:'ignore'});
 const exited=new Promise(resolve=>child.once('exit',resolve));let redis;
 try {
  for(let i=0;i<50;i++){try{await fs.stat(socket);break;}catch{await new Promise(r=>setTimeout(r,20));}}
  redis=new Redis({path:socket,maxRetriesPerRequest:0,enableOfflineQueue:false,lazyConnect:true});await redis.connect();
  const key=randomBytes(32),store=createTransientResults({redis,key,ttlMs:1000,maxBytes:4096}),f=fixture();
  const expiresAt=await store.put(f.ref,f.result);const loaded=await store.get(f.ref);
  assert.equal(loaded.expiresAt,expiresAt);assert.deepEqual(loaded.result,f.result);
  const keys=await redis.keys('web-read:*');for(const k of keys){if(!k.endsWith('index')&&!k.endsWith('sizes'))assert.ok(!(await redis.get(k)).includes('private output'));}
  await assert.rejects(store.put(f.ref,f.result),/RESULT_EXISTS/);
  await assert.rejects(store.get({...f.ref,executionId:'foreign'}),/ARTIFACT_EXPIRED/);
  const wrong=createTransientResults({redis,key:randomBytes(32)});await assert.rejects(wrong.get(f.ref),/INVALID_RESULT/);
  const oversized=fixture();oversized.result.pages[0].markdown='x'.repeat(6000);oversized.result.pages[0].sha256=require('node:crypto').createHash('sha256').update(oversized.result.pages[0].markdown).digest('hex');
  await assert.rejects(store.put({...oversized.ref,executionId:'large'},oversized.result),/CAPACITY/);
  await new Promise(r=>setTimeout(r,1100));await assert.rejects(store.get(f.ref),/ARTIFACT_EXPIRED/);
  await store.put({...f.ref,executionId:'next'},f.result);
 } finally {if(redis)redis.disconnect();child.kill('SIGTERM');await exited;await fs.rm(dir,{recursive:true,force:true});}
});
