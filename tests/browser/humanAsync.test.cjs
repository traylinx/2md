'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const c=require('../../lib/browser/contracts');
const {createSessionNetwork}=require('../../lib/browser/networkPolicy');
const {createHumanParentBridge,createHumanChildBridge}=require('../../lib/browser/humanBridge');
const {createSessionManager}=require('../../lib/browser/sessionManager');
const {bound,grant,owner}=require('./support.cjs');
const turn=()=>new Promise(r=>setImmediate(r));
const request=(origin='https://new.example',method='GET')=>({url:origin+'/owned',method,type:'fetch',body:'OWNED',mainFrame:false});
function network(extra={}){let now=1000;return {advance:ms=>now+=ms,policy:createSessionNetwork({sessionId:'s',limits:c.LIMITS,navigation:{mode:'public_https'},lifetime:{remaining:()=>600000},now:()=>now,resolve:async url=>({url}),drainPublic:async()=>{},verifyDecision:async(proof,r)=>proof==='approved'?r:null,...extra})};}
test('human queue holds parallel resources, rechecks destination after approval and counts each once',async()=>{
 let allow,calls=0;const f=network({requestDecision:()=>{calls++;return new Promise(r=>allow=r);}}),p=f.policy;
 await p.enterHuman('https://site.example',{asyncNetwork:true});p.startHumanAuthentication('click');
 const a=p.allow(request()),b=p.allow(request()),d=p.allow(request());await turn();assert.equal(calls,1);assert.equal(p.state().pending,true);
 allow('approved');await Promise.all([a,b,d]);assert.equal(calls,1);assert.equal(p.state().requests,3);assert.equal(p.diagnostics().blocked,0);
});
test('human queue is bounded and return/closure rejects waiting requests, never silently forwards',async()=>{
 for(const close of [false,true]){
  let allow;const f=network({requestDecision:()=>new Promise(r=>allow=r)}),p=f.policy;await p.enterHuman('https://site.example',{asyncNetwork:true});
  const first=p.allow(request());first.catch(()=>{});await turn();
  const waiting=Array.from({length:15},()=>p.allow(request()).catch(e=>e.code));await turn();
  await assert.rejects(p.allow(request()),{code:'CAPACITY'});
  if(close)p.close();else p.endHuman();
  assert.deepEqual(await Promise.all(waiting),Array(15).fill('CANCELLED'));
  allow('denied');await assert.rejects(first);assert.ok(p.diagnostics().blocked>=16);
 }
});
test('delayed requests spend original human budget; elapsed time never resets without a new click',async()=>{
 let decisions=0;const f=network({requestDecision:async()=>{decisions++;return 'approved';}}),p=f.policy;
 await p.enterHuman('https://site.example',{asyncNetwork:true});p.startHumanAuthentication('click');
 await p.allow(request('https://site.example','POST'));f.advance(5000);
 for(let i=0;i<15;i++)await p.allow(request('https://site.example','POST'));assert.equal(decisions,0);
 await p.allow(request('https://site.example','POST'));assert.equal(decisions,1);
 f.advance(30000);await p.allow(request('https://site.example','POST'));assert.equal(decisions,2);
 p.startHumanAuthentication('new-explicit-click');await p.allow(request('https://site.example','POST'));assert.equal(decisions,2);
 p.endHuman();await p.allow(request('https://site.example','POST'));assert.equal(decisions,3);
});
test('session network bridge works without a current click, verifies exact proof, and rejects credentials',async()=>{
 const controller=new AbortController();let lease={handoffId:'h',signal:controller.signal},checks=0,child;
 const record={sessionId:'s',operationId:'op',operationDigest:'a'.repeat(64),recipients:['https://owned.example'],expiresAt:Date.now()+10000,nonce:'nonce',origin:'https://owned.example',reason:'operation',type:'fetch',method:'POST',bodyBytes:5};
 const parent=createHumanParentBridge({sessionId:'s',getLease:()=>lease,getProvider:async()=>({verifyHuman:async()=>{checks++;return true;},requestDecision:async()=> 'approved',verifyDecision:async(_proof,r)=>r}),send:message=>queueMicrotask(()=>child.handle(message))});
 child=createHumanChildBridge({handoffId:'h',signal:controller.signal,getActionDeadline:()=>null,send:message=>queueMicrotask(()=>parent.handle(message))});
 try{const proof=await child.provider.requestDecision(record);assert.equal(proof,'approved');
  const exact=Object.fromEntries(Object.keys(require('../../lib/browser/operationBroker').decisionSchema.properties).map(k=>[k,record[k]]));
  assert.deepEqual(await child.provider.verifyDecision(proof,exact),exact);assert.equal(checks,4);
  await assert.rejects(child.provider.verifyDecision(proof,exact),{code:'FORBIDDEN'});
  assert.equal(child.provider.credentialAccess,undefined);
  controller.abort();lease=null;await assert.rejects(child.provider.requestDecision({...record,operationId:'late'}),{code:'CANCELLED'});
 }finally{child.close();}
});
test('human bridge rejects unrelated methods, foreign leases, and drops replies after revocation/end',async()=>{
 const controller=new AbortController();let lease={handoffId:'h',signal:controller.signal},release,verified=0;const sent=[];
 const parent=createHumanParentBridge({sessionId:'s',getLease:()=>lease,getProvider:async()=>({verifyHuman:async()=>{verified++;return true;},requestDecision:()=>new Promise(r=>release=r)}),send:m=>sent.push(m)});
 const raw={type:'human_protected_request',requestId:'human:h',callId:'call',method:'credential',input:{}};
 await parent.handle({...raw,requestId:'human:other'});assert.equal(verified,0);await parent.handle(raw);assert.equal(sent.at(-1).code,'FORBIDDEN');
 const record={sessionId:'s',operationId:'op',operationDigest:'a'.repeat(64),recipients:['https://owned.example'],expiresAt:Date.now()+10000,nonce:'nonce',origin:'https://owned.example',reason:'operation',type:'fetch',method:'POST',bodyBytes:5};
 const pending=parent.handle({...raw,method:'operation',input:record});await turn();const n=sent.length;controller.abort();lease=null;release('approved');await pending;assert.equal(sent.length,n);
});
test('idle human intervention remains separate from completed action and blocks input/frame/return',async()=>{
 const g={...grant(),policyVersion:c.POLICY,approvedByWorkspaceUserId:owner.workspaceUserId};let dispose=0;
 const m=createSessionManager({authorize:async()=>g,createWorker:async()=>({execute:async()=>({state:'active'}),dispose:async()=>dispose++}),validateOutput:require('../../lib/browser/runtime').validateWorkerOutput,runtimeEpoch:'e1',humanEnabled:true,privateEnabled:true,autoSweep:false});
 try{const s=await m.open(bound,{runtimeEpoch:'e1',actionId:'open',url:'https://example.com',mode:'login_read',purpose:'owned'}),h=await m.beginHuman(bound,s.sessionId,{viewerVersion:3}),ids={sessionId:s.sessionId,handoffId:h.handoffId};
  await m.activateHuman(bound,ids);await m.suspend(bound,{sessionId:s.sessionId,interventionId:'background',reason:'operation_consent',expiresAt:Date.now()+10000});
  const state=await m.humanState(bound,ids);assert.equal(state.interventionId,'background');assert.equal(state.action,undefined);
  await assert.rejects(m.humanFrame(bound,ids),{code:'BUSY'});await assert.rejects(m.finishHuman(bound,ids),{code:'BUSY'});
  await assert.rejects(m.humanInput(bound,{...ids,runtimeEpoch:'e1',actionId:'blocked',frameId:'f',input:{type:'click',x:0,y:0}}),{code:'BUSY'});
  await m.resumePending(bound,{sessionId:s.sessionId,interventionId:'background'});assert.equal((await m.humanState(bound,ids)).interventionId,undefined);
  assert.equal((await m.finishHuman(bound,ids)).state,'agent_control');assert.equal(dispose,0);
 }finally{await m.shutdown();}
});
