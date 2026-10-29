'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),request=require('supertest'),express=require('express');
const c=require('../../lib/browser/contracts'),{bound,grant}=require('./support.cjs');
const {createBrowserHumanRouter}=require('../../routes/browserHuman');
const lease={sessionId:'s',handoffId:'h'},base={...lease,state:'human_control',expiresAt:Date.now()+180000};
const frame={frameId:'f',jpeg:'owned-synthetic',width:1280,height:800,origin:'https://example.com'};
function fixture({state=base,revoke=false}={}){
 let checks=0,frames=0;const a=express();a.use('/api/browser/v1',createBrowserHumanRouter({enabled:true,resolveCaller:async()=>{checks++;if(revoke&&checks===2)c.deny('PERMISSION_REQUIRED');return bound;},verifyHost:async()=>{},manager:{humanState:async()=>state,humanFrame:async()=>{frames++;return frame;},activateHuman:async()=>base},operations:{inspect:async()=>{throw Error('unexpected');}}}));return {a,counts:()=>({checks,frames})};
}
test('combined frame remains signed/authorized before and after, pending states never expose pixels',async()=>{
 const f=fixture();const r=await request(f.a).post('/api/browser/v1/human-view').send(lease).expect(200);assert.equal(r.body.frame.frameId,'f');assert.deepEqual(f.counts(),{checks:2,frames:1});assert.equal(r.headers['cache-control'],'no-store');
 for(const state of ['running','outcome_unknown']){const f=fixture({state:{...base,action:{runtimeEpoch:'e1',actionId:'a',sessionId:'s',state}}});const r=await request(f.a).post('/api/browser/v1/human-view').send(lease).expect(200);assert.equal(r.body.frame,undefined);assert.equal(f.counts().frames,0);}
 const revoked=fixture({revoke:true});const denied=await request(revoked.a).post('/api/browser/v1/human-view').send(lease).expect(403);assert.doesNotMatch(JSON.stringify(denied.body),/owned-synthetic/);
 await request(f.a).post('/api/browser/v1/human-view').set('Origin','https://evil.example').send(lease).expect(403);
 await request(f.a).post('/api/browser/v1/human-activate').send({...lease,expiresAt:9999999999999}).expect(400);
});
test('viewer capability is explicit opt-in and false when private human access is unavailable',async()=>{
 const {createBrowserService}=require('../../lib/browser/service');const manager={runtimeEpoch:'e1',open(){},query(){},execute(){},describe(){},status(){},close(){}};
 for(const enabled of [false,true]){
  const service=createBrowserService({manager,authorize:async()=>grant(),credentialService:async()=>{},privateReady:async()=>enabled,humanEnabled:enabled});
  assert.equal((await service.call('get_browser_capabilities',{includeHuman:true},bound)).humanViewAvailable,undefined);
  assert.equal((await service.call('get_browser_capabilities',{includeHumanView:true},bound)).humanViewAvailable,enabled);
 }
});
