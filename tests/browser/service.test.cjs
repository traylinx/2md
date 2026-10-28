'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const c=require('../../lib/browser/contracts');
const {createBrowserService}=require('../../lib/browser/service');
const {createSessionManager}=require('../../lib/browser/sessionManager');
const {createBrowserMcpAgent}=require('../../lib/browser/mcpAgent');
const {bound,grant,observation}=require('./support.cjs');
test('MCP adapter dispatches through real service/manager and cannot invent private availability',async()=>{
 const g={...grant(),policyVersion:c.POLICY};let executed=0;
 const manager=createSessionManager({runtimeEpoch:'epoch1',autoSweep:false,authorize:async()=>g,createWorker:async()=>({execute:async()=>{executed++;return observation();},dispose:async()=>{}}),validateOutput:async(_name,result)=>result});
 const service=createBrowserService({manager,authorize:async()=>g});const agent=createBrowserMcpAgent({backend:{call:(name,input,options)=>service.call(name,input,bound,options)}});
 try{
 const caps=await agent.call({name:'get_browser_capabilities'});assert.equal(caps.credentialChannel,'unavailable');assert.ok(!caps.available.includes('browser_authenticate'));
 const opened=await agent.call({name:'browser_open',arguments:{runtimeEpoch:'epoch1',actionId:'a1',url:'https://example.org/',purpose:'Read',mode:'public'}});
 const observed=await agent.call({name:'browser_observe',arguments:{sessionId:opened.sessionId}});assert.equal(observed.observationId,'o1');assert.equal(executed,1);
 await assert.rejects(agent.call({name:'browser_credentials',arguments:{sessionId:opened.sessionId,origin:'https://example.org',purpose:'Login'}}),{code:'UNSUPPORTED'});
 await agent.call({name:'browser_close',arguments:{sessionId:opened.sessionId}});assert.equal(manager.diagnostics().active,0);
 }finally{await manager.shutdown();}
});
test('capabilities report absent grant without promising browser permission',async()=>{
 const manager={runtimeEpoch:'e1',open(){},query(){},execute(){},describe(){},status(){},close(){}};
 const service=createBrowserService({manager,authorize:async()=>c.deny('PERMISSION_REQUIRED')});
 const result=await service.call('get_browser_capabilities',{},bound);assert.equal(result.permission,'permission_required');assert.deepEqual(result.permitted,['get_browser_capabilities']);
});
