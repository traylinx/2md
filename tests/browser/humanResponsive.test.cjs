'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createHumanSession}=require('../../lib/browser/humanSession');
const {Deadline}=require('../../lib/capture/deadline');
function fixture(responsive=true){
 let nowUrl='https://owned.example/',navigation,clicks=0,settles=0;
 const main={};const page={on:(_event,fn)=>navigation=fn,mainFrame:()=>main,url:()=>nowUrl,screenshot:async()=> 'synthetic',mouse:{click:async()=>{clicks++;}},waitForNetworkIdle:async()=>{settles++;}};
 const network={enterHuman:async()=>{},endHuman(){},startHumanAuthentication(){},endAuthentication(){},state:()=>({pending:false}),diagnostics:()=>({blocked:0,cancelled:0,denied:0,capacity:0})};
 const engine=createHumanSession({page,network,observations:{clear:async()=>{}},warnings:new Set(),remember(){},enabled:true});
 const deadline=new Deadline(5000);const run=(name,input={})=>engine.execute(name,input,deadline);
 return {begin:()=>run('human_begin',{asyncNetwork:true,responsive}),frame:()=>run('human_frame'),input:id=>run('human_input',{sessionId:'s',handoffId:'h',runtimeEpoch:'e',actionId:'a',frameId:id,input:{type:'click',x:2,y:3}}),navigate:()=>navigation(main),counts:()=>({clicks,settles}),close:()=>deadline.close()};
}
test('responsive worker keeps at most three unconsumed read snapshots; input invalidates all and does not wait for network idle',async()=>{
 const f=fixture();try{await f.begin();const frames=[];for(let i=0;i<4;i++)frames.push((await f.frame()).frameId);
  await assert.rejects(f.input(frames[0]),{code:'STALE_REFERENCE'});await f.input(frames[1]);assert.deepEqual(f.counts(),{clicks:1,settles:0});
  await assert.rejects(f.input(frames[3]),{code:'STALE_REFERENCE'});
 }finally{f.close();}
});
test('navigation invalidates snapshots, including reload at unchanged URL; legacy requires latest snapshot and settles',async()=>{
 const f=fixture();try{await f.begin();const before=await f.frame();f.navigate();await assert.rejects(f.input(before.frameId),{code:'STALE_REFERENCE'});}finally{f.close();}
 const old=fixture(false);try{await old.begin();const a=await old.frame(),b=await old.frame();await assert.rejects(old.input(a.frameId),{code:'STALE_REFERENCE'});await old.input(b.frameId);assert.deepEqual(old.counts(),{clicks:1,settles:1});}finally{old.close();}
});
test('timing and network diagnostics retain only bounded closed-vocabulary summaries',async()=>{
 const {createTrace,measure,emitNetwork}=require('../../lib/browser/humanDiagnostics');const lines=[];let now=0;
 const t=createTrace('human-view',{output:line=>lines.push(JSON.parse(line)),clock:()=>now});
 await t.run(async()=>{t.identify('owned-session');await t.measure('caller_before',async()=>{now+=12;});await measure('worker_frame',async()=>{now+=8;});await t.measure('password',async()=>{now+=1;});});
 const header=t.finish('OK');assert.match(header,/caller_before;dur=12/);assert.doesNotMatch(header,/password/);assert.equal(t.finish('OK'),'');
 assert.equal(lines[0].session.length,16);assert.equal(lines[0].ms.caller_before,12);assert.doesNotMatch(JSON.stringify(lines),/owned-session|password|https:/);
 emitNetwork('owned-session',{http4xx:1,http5xx:2,transport_failed:3,policy_blocked:4,limited:false},line=>lines.push(JSON.parse(line)));
 emitNetwork('owned-session',{http4xx:1,http5xx:2,transport_failed:3,policy_blocked:4,limited:false,url:'secret'},line=>lines.push(line));assert.equal(lines.length,2);
 for(let i=0;i<600;i++){const trace=createTrace('human-view',{output:x=>lines.push(x)});trace.identify('bounded');trace.finish('OK');}assert.equal(lines.length,514);
 const denied=createTrace('human-view',{output:()=>assert.fail('unverified identity logged')});denied.finish('FORBIDDEN');
});
