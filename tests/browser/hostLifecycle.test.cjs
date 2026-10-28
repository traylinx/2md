'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createHostLifecycle}=require('../../lib/browser/hostLifecycle');
const c=require('../../lib/browser/contracts');
test('host sends heartbeats independent of tools, bounds loss, never replays an action, closes owned session',async()=>{
 let time=1000,fail=false;const calls=[],pings=[];
 const host=createHostLifecycle({autoHeartbeat:false,now:()=>time,backend:{call:async(name,input)=>{calls.push({name,input});return name==='browser_open'?{sessionId:'s1',state:'succeeded',output:{state:'active'}}:{sessionId:input.sessionId,state:'closed'};},protectedCall:async(name,input)=>{pings.push({name,input});if(fail)c.deny('UNAVAILABLE');return {sessionId:input.sessionId,state:'active'};}}});
 await host.call('browser_open',{});time+=30000;await host.heartbeat();assert.equal(pings.length,1);assert.equal(calls.length,1);
 fail=true;time+=30000;await host.heartbeat();assert.equal(pings.length,2);
 time+=30000;await assert.rejects(host.call('browser_observe',{sessionId:'s1'}),{code:'SESSION_LOST'});assert.equal(calls.length,1);
 await host.close();assert.equal(calls.length,2);assert.equal(calls[1].name,'browser_close');await host.close();assert.equal(calls.length,2);
});
test('host recovers lost open receipt, rejects revoked heartbeat and can track a fresh session',async()=>{
 let id='s1',revoked=false;const pings=[];
 const host=createHostLifecycle({autoHeartbeat:false,backend:{call:async()=>({sessionId:id,state:'succeeded',output:{state:'active'}}),protectedCall:async(_name,input)=>{pings.push(input.sessionId);if(revoked)c.deny('PERMISSION_REQUIRED');return {sessionId:input.sessionId,state:'active'};}}});
 try{await host.call('browser_action_status',{runtimeEpoch:'e1',actionId:'a1'});revoked=true;await host.heartbeat();await assert.rejects(host.call('browser_observe',{sessionId:'s1'}),{code:'SESSION_LOST'});
 id='s2';revoked=false;await host.call('browser_open',{});await host.heartbeat();assert.deepEqual(pings,['s1','s2']);
 }finally{await host.close();}
});
test('host cleans up a late open completion after transport shutdown',async()=>{
 let release;const closed=[];const host=createHostLifecycle({autoHeartbeat:false,backend:{protectedCall:async()=>{},call:async(name,input)=>{if(name==='browser_open')return new Promise(r=>{release=r;});closed.push(input.sessionId);return {};}}});
 const pending=host.call('browser_open',{});await host.close();release({sessionId:'late1',state:'succeeded',output:{state:'active'}});await assert.rejects(pending,{code:'CANCELLED'});assert.deepEqual(closed,['late1']);
});
test('host without protected input does not advertise or accept private login',async()=>{
 const host=createHostLifecycle({privateAvailable:false,autoHeartbeat:false,backend:{protectedCall:async()=>{},call:async()=>({available:['browser_open','browser_credentials','browser_authenticate'],permitted:['browser_credentials'],credentialChannel:'protected_provider',ownerConnection:{url:'https://example.org'}})}});
 try{const result=await host.call('get_browser_capabilities',{});assert.deepEqual(result.available,['browser_open']);assert.deepEqual(result.permitted,[]);assert.equal(result.credentialChannel,'unavailable');assert.equal(result.ownerConnection,undefined);await assert.rejects(host.call('browser_open',{mode:'login_read'}),{code:'UNSUPPORTED'});}finally{await host.close();}
});
