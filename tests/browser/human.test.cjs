'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const c=require('../../lib/browser/contracts'),{createSessionManager}=require('../../lib/browser/sessionManager');
const {bound,grant,owner}=require('./support.cjs');
function fixture(){let time=Date.now(),revoked=false,actions=0,closed=0;const g={...grant(time),policyVersion:c.POLICY,approvedByWorkspaceUserId:owner.workspaceUserId};const manager=createSessionManager({authorize:async()=>({...g,revoked}),createWorker:async()=>({execute:async name=>{actions++;return name==='human_frame'?{frameId:'frame1',jpeg:'synthetic',width:1280,height:800,origin:'https://example.com'}:{state:'active'};},dispose:async()=>{closed++;}}),validateOutput:require('../../lib/browser/runtime').validateWorkerOutput,runtimeEpoch:'e1',privateEnabled:true,humanEnabled:true,now:()=>time,autoSweep:false});return {manager,advance:ms=>time+=ms,revoke:()=>revoked=true,counts:()=>({actions,closed})};}
const open={runtimeEpoch:'e1',actionId:'open',mode:'login_read',url:'https://example.com',purpose:'Owned human assistance'};
test('exclusive lease preserves session, no agent control or foreign frame access, same ID no replay, explicit return',async()=>{
 const f=fixture(),m=f.manager;try{const s=await m.open(bound,open),lease=await m.beginHuman(bound,s.sessionId),ids={sessionId:s.sessionId,handoffId:lease.handoffId};assert.deepEqual(await m.beginHuman(bound,s.sessionId),lease);
 await assert.rejects(m.query(bound,'browser_observe',{sessionId:s.sessionId}),{code:'BUSY'});await assert.rejects(m.execute(bound,'browser_act',{runtimeEpoch:'e1',sessionId:s.sessionId,actionId:'blocked',observationId:'o',action:{type:'click',ref:'r'}}),{code:'BUSY'});
 await assert.rejects(m.humanFrame({...bound,hostId:'foreign'},ids),{code:'FORBIDDEN'});await assert.rejects(m.humanFrame(bound,{...ids,handoffId:'wrong'}),{code:'SESSION_LOST'});
 const frame=await m.humanFrame(bound,ids),cmd={...ids,runtimeEpoch:'e1',actionId:'human1',frameId:frame.frameId,input:{type:'click',x:4,y:4}};
 assert.equal((await m.humanInput(bound,cmd)).state,'succeeded');assert.equal((await m.humanInput(bound,cmd)).state,'succeeded');assert.equal(f.counts().actions,3);
 await assert.rejects(m.humanInput(bound,{...cmd,input:{type:'click',x:5,y:4}}),{code:'IDEMPOTENCY_CONFLICT'});
 assert.equal((await m.finishHuman(bound,ids)).state,'agent_control');assert.equal((await m.finishHuman(bound,ids)).state,'agent_control');assert.equal((await m.humanState(bound,ids)).state,'agent_control');assert.equal((await m.describe(bound,s.sessionId)).handoffActive,false);await assert.rejects(m.humanFrame(bound,ids),{code:'SESSION_LOST'});
 }finally{await m.shutdown();}});
test('takeover expiry closes private worker and revocation invalidates viewer',async()=>{
 for(const revoke of [false,true]){const f=fixture(),m=f.manager;try{const s=await m.open(bound,open),lease=await m.beginHuman(bound,s.sessionId),ids={sessionId:s.sessionId,handoffId:lease.handoffId};if(revoke){f.revoke();await assert.rejects(m.humanState(bound,ids),{code:'PERMISSION_REQUIRED'});}else{f.advance(180001);assert.equal((await m.humanState(bound,ids)).state,'expired');}assert.equal(f.counts().closed,1);}finally{await m.shutdown();}}
});
test('local viewer one-use launch, exact host/origin, HttpOnly cookie, CSRF, bounded schema and no image in model result',async()=>{
 const calls=[];let state='human_control';const record={sessionId:'s',handoffId:'h',state,expiresAt:Date.now()+60000};
 const client={call:async()=>({humanHandoffAvailable:true,runtimeEpoch:'e1'}),protectedCall:async(name,input)=>{calls.push({name,input});if(name==='human-begin'||name==='human-state')return {...record,state};if(name==='human-frame')return {frameId:'f',jpeg:'synthetic',width:1280,height:800,origin:'https://example.com'};if(name==='human-input')return {runtimeEpoch:'e1',sessionId:'s',actionId:input.actionId,state:'succeeded',output:{state:'active'}};if(name==='human-finish'){state='agent_control';return {state};}throw Error(name);}};
 const host=await require('../../lib/browser/humanHost').createHumanHost({client});try{
 const result=await host.call('browser_handoff',{action:'start',sessionId:'s'});assert.equal(result.jpeg,undefined);assert.equal(result.handoffId,undefined);
 const origin=new URL(result.inputUrl).origin,launch=await fetch(result.inputUrl,{redirect:'manual'});assert.equal(launch.status,303);assert.match(launch.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);assert.equal(launch.headers.get('cache-control'),'no-store');assert.equal((await fetch(result.inputUrl)).status,403);
 const cookie=launch.headers.get('set-cookie').split(';')[0];const view=await fetch(origin+'/viewer',{headers:{cookie}}),html=await view.text();assert.match(view.headers.get('content-security-policy'),/frame-ancestors 'none'/);new (require('node:vm').Script)(/<script nonce="[^"]+">([\s\S]*?)<\/script>/.exec(html)[1]);const csrf=JSON.parse(/const csrf=("[^"]+")/.exec(html)[1]);
 const request=(path,body={},extra={})=>fetch(origin+path,{method:'POST',headers:{cookie,origin,'content-type':'application/json','x-csrf-token':csrf,...extra},body:JSON.stringify(body)});
 assert.equal((await request('/frame',{}, {origin:'https://evil.example'})).status,403);assert.equal((await request('/frame',{}, {'x-csrf-token':'wrong'})).status,403);assert.equal(await new Promise((resolve,reject)=>{const q=require('node:http').request(origin+'/frame',{method:'POST',headers:{host:'evil.example',cookie,origin,'content-type':'application/json','x-csrf-token':csrf}},r=>{r.resume();resolve(r.statusCode);});q.on('error',reject);q.end('{}');}),403);
 assert.equal((await request('/frame')).status,200);assert.equal((await request('/input',{actionId:'a',frameId:'f',input:{type:'script',text:'bad'}})).status,400);
 assert.equal((await request('/input',{actionId:'a',frameId:'f',input:{type:'text',text:'SYNTHETIC'}})).status,200);assert.equal(calls.at(-1).input.runtimeEpoch,'e1');
 assert.equal((await request('/finish')).status,200);assert.equal((await request('/frame')).status,403);assert.equal((await host.call('browser_handoff',{action:'status',sessionId:'s'})).state,'agent_control');
 }finally{await host.close();}
});
test('MCP advertises client-neutral handoff only when host integration is wired',async()=>{
 const {createBrowserMcpAgent}=require('../../lib/browser/mcpAgent');const backend={call:async(_name,input)=>({sessionId:input.sessionId,state:'agent_control',expiresAt:Date.now()+1000})};
 assert.ok(!createBrowserMcpAgent({backend}).definitions.some(d=>d.name==='browser_handoff'));
 const agent=createBrowserMcpAgent({backend,human:true});assert.match(agent.instructions,/Do not fetch\/screenshot\/control/);assert.equal((await agent.call({name:'browser_handoff',arguments:{sessionId:'s',action:'status'}})).state,'agent_control');
 await assert.rejects(agent.call({name:'browser_handoff',arguments:{sessionId:'s',action:'click',x:1,y:1}}),{code:'INVALID_INPUT'});
});
