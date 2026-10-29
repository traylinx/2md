'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {settlePage}=require('../../lib/browser/settle');
const {ActionDeadline}=require('../../lib/browser/actionDeadline');
const {failure,workerCode}=require('../../lib/browser/diagnostics');
const {createSessionManager}=require('../../lib/browser/sessionManager');
const {createBrowserHttpClient}=require('../../lib/browser/httpClient');
const {bound,grant,privateKey}=require('./support.cjs'),c=require('../../lib/browser/contracts');
const timeout=()=>Object.assign(new Error('private page URL must not be logged'),{name:'TimeoutError'});
test('background network activity is a bounded completeness warning, not failed action',async()=>{
 const deadline=new ActionDeadline(1000),warnings=new Set();let calls=0;
 try{await settlePage({waitForNetworkIdle:async options=>{calls++;assert.ok(options.timeout>0);throw timeout();}},deadline,{warnings});assert.equal(calls,1);assert.deepEqual([...warnings],['NETWORK_NOT_IDLE']);assert.ok(!deadline.signal.aborted);}finally{deadline.close();}
});
test('settling never returns success while a protected operation decision is pending',async()=>{
 const deadline=new ActionDeadline(1000),warnings=new Set();let pending=true,finished=false,calls=0;
 deadline.pause('decision1');
 try{
  const result=settlePage({waitForNetworkIdle:async()=>{calls++;if(calls===1)throw timeout();}},deadline,{pending:()=>pending,warnings}).then(()=>{finished=true;});
  await new Promise(r=>setTimeout(r,70));assert.equal(finished,false);
  pending=false;deadline.resume('decision1');await result;assert.equal(calls,2);assert.equal(warnings.size,0);
 }finally{deadline.close();}
});
test('an idle signal cannot finish a still-pending protected decision',async()=>{
 const deadline=new ActionDeadline(1000);let pending=true,finished=false,calls=0;
 try{const result=settlePage({waitForNetworkIdle:async()=>{calls++;}},deadline,{pending:()=>pending}).then(()=>{finished=true;});
 await new Promise(r=>setTimeout(r,70));assert.equal(finished,false);pending=false;await result;assert.equal(calls,2);
 }finally{deadline.close();}
});
test('settle does not swallow page loss, cancellation or exhausted action budgets',async()=>{
 const deadline=new ActionDeadline(1000);
 try{await assert.rejects(settlePage({waitForNetworkIdle:async()=>{throw Error('page lost');}},deadline),/page lost/);
 deadline.abort('DEADLINE');await assert.rejects(settlePage({},deadline),{code:'DEADLINE'});}finally{deadline.close();}
});
test('diagnostics allow fixed enums and numeric timing only, not exception or request data',()=>{
 const output=failure({operation:'browser_authenticate',stage:'auth_private_transition',code:'HUMAN_REQUIRED',elapsedMs:34.5,password:'SENSITIVE',url:'https://secret.test/',exception:new Error('SENSITIVE')});
 assert.deepEqual(output,{event:'browser_failure',operation:'browser_authenticate',stage:'auth_private_transition',code:'HUMAN_REQUIRED',elapsedMs:35});
 assert.equal(workerCode('HUMAN_REQUIRED'),'HUMAN_REQUIRED');assert.equal(workerCode('DEADLINE'),'DEADLINE');assert.equal(workerCode('SENSITIVE'),'UNAVAILABLE');
 assert.doesNotMatch(JSON.stringify(failure({operation:'SENSITIVE',stage:'SENSITIVE',code:'SENSITIVE',elapsedMs:'SENSITIVE'})),/SENSITIVE/);
});
test('pre-input HUMAN_REQUIRED keeps session inspectable and original receipt recoverable without replay',async()=>{
 let attempts=0,closed=0;const g={...grant(),policyVersion:c.POLICY};
 const manager=createSessionManager({runtimeEpoch:'e1',autoSweep:false,privateEnabled:true,authorize:async()=>g,validateOutput:async(n,r)=>r,
 createWorker:async()=>({execute:async name=>{if(name==='browser_authenticate'){attempts++;c.deny('HUMAN_REQUIRED');}return {observed:true};},dispose:async()=>{closed++;}})});
 try{const opened=await manager.open(bound,{runtimeEpoch:'e1',actionId:'open1',mode:'login_read',url:'https://example.org',purpose:'Read'});
 const input={runtimeEpoch:'e1',sessionId:opened.sessionId,actionId:'auth1',observationId:'o1',credentialRef:'c1',fields:[{ref:'r1',label:'Code'}]};
 const receipt=await manager.execute(bound,'browser_authenticate',input);assert.equal(receipt.state,'failed');assert.equal(receipt.error,'HUMAN_REQUIRED');assert.equal(closed,0);
 assert.deepEqual(await manager.status(bound,{runtimeEpoch:'e1',actionId:'auth1'}),receipt);assert.deepEqual(await manager.execute(bound,'browser_authenticate',input),receipt);assert.equal(attempts,1);
 assert.deepEqual(await manager.query(bound,'browser_observe',{sessionId:opened.sessionId}),{observed:true});
 }finally{await manager.shutdown();}assert.equal(closed,1);
});test('pre-input VERIFICATION_PENDING keeps session inspectable and original receipt recoverable without replay',async()=>{
 let attempts=0,closed=0;const g={...grant(),policyVersion:c.POLICY};
 const manager=createSessionManager({runtimeEpoch:'e1',autoSweep:false,privateEnabled:true,authorize:async()=>g,validateOutput:async(n,r)=>r,
 createWorker:async()=>({execute:async name=>{if(name==='browser_authenticate'){attempts++;c.deny('VERIFICATION_PENDING');}return {observed:true};},dispose:async()=>{closed++;}})});
 try{const opened=await manager.open(bound,{runtimeEpoch:'e1',actionId:'open1',mode:'login_read',url:'https://example.org',purpose:'Read'});
 const input={runtimeEpoch:'e1',sessionId:opened.sessionId,actionId:'auth1',observationId:'o1',credentialRef:'c1',fields:[{ref:'r1',label:'Code'}]};
 const receipt=await manager.execute(bound,'browser_authenticate',input);assert.equal(receipt.state,'failed');assert.equal(receipt.error,'VERIFICATION_PENDING');assert.equal(closed,0);
 assert.deepEqual(await manager.status(bound,{runtimeEpoch:'e1',actionId:'auth1'}),receipt);assert.deepEqual(await manager.execute(bound,'browser_authenticate',input),receipt);assert.equal(attempts,1);
 assert.deepEqual(await manager.query(bound,'browser_observe',{sessionId:opened.sessionId}),{observed:true});
 }finally{await manager.shutdown();}assert.equal(closed,1);
});test('pre-input VERIFICATION_FAILED keeps session inspectable and original receipt recoverable without replay',async()=>{
 let attempts=0,closed=0;const g={...grant(),policyVersion:c.POLICY};
 const manager=createSessionManager({runtimeEpoch:'e1',autoSweep:false,privateEnabled:true,authorize:async()=>g,validateOutput:async(n,r)=>r,
 createWorker:async()=>({execute:async name=>{if(name==='browser_authenticate'){attempts++;c.deny('VERIFICATION_FAILED');}return {observed:true};},dispose:async()=>{closed++;}})});
 try{const opened=await manager.open(bound,{runtimeEpoch:'e1',actionId:'open1',mode:'login_read',url:'https://example.org',purpose:'Read'});
 const input={runtimeEpoch:'e1',sessionId:opened.sessionId,actionId:'auth1',observationId:'o1',credentialRef:'c1',fields:[{ref:'r1',label:'Code'}]};
 const receipt=await manager.execute(bound,'browser_authenticate',input);assert.equal(receipt.state,'failed');assert.equal(receipt.error,'VERIFICATION_FAILED');assert.equal(closed,0);
 assert.deepEqual(await manager.status(bound,{runtimeEpoch:'e1',actionId:'auth1'}),receipt);assert.deepEqual(await manager.execute(bound,'browser_authenticate',input),receipt);assert.equal(attempts,1);
 assert.deepEqual(await manager.query(bound,'browser_observe',{sessionId:opened.sessionId}),{observed:true});
 }finally{await manager.shutdown();}assert.equal(closed,1);
});
function client(fetchImpl){return createBrowserHttpClient({url:'https://browser.example.org/api/browser/v1',bound,grantId:grant().grantId,privateKey,agentId:'agent1',sdk:{getAgentRequestHeaders:async()=>({'X-Agent-User-Id':'agent1','X-Agent-Secret-Token':'synthetic'})},fetchImpl});}
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
test('receipt recovery retries one transient unavailable read using a fresh signature, never executes action',async()=>{
 const proofs=[];const api=client(async(url,opts)=>{assert.match(url,/action-status$/);proofs.push(opts.headers['X-Browser-Host-Proof']);return proofs.length===1?reply({error:'UNAVAILABLE'},503):reply({runtimeEpoch:'e1',actionId:'a1',state:'succeeded'});});
 assert.equal((await api.call('browser_action_status',{runtimeEpoch:'e1',actionId:'a1'})).state,'succeeded');assert.equal(proofs.length,2);assert.notEqual(proofs[0],proofs[1]);
});
test('recovery is bounded; authorization failures and execution calls are never retried',async()=>{
 let calls=0,status=503,code='UNAVAILABLE';const api=client(async()=>{calls++;return reply({error:code},status);});
 await assert.rejects(api.call('browser_action_status',{runtimeEpoch:'e1',actionId:'a1'}),{code});assert.equal(calls,2);
 status=403;code='PERMISSION_REQUIRED';calls=0;await assert.rejects(api.call('browser_action_status',{runtimeEpoch:'e1',actionId:'a1'}),{code});assert.equal(calls,1);
 status=503;code='UNAVAILABLE';calls=0;await assert.rejects(api.call('browser_act',{runtimeEpoch:'e1',sessionId:'s1',actionId:'a1',observationId:'o1',action:{type:'click',ref:'r1'}}),{code});assert.equal(calls,1);
});
