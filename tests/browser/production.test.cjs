'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createCurrentAgentResolver}=require('../../lib/browser/currentAgent');
const {createRuntimeAuthority}=require('../../lib/browser/authorityAdapter');
const {createNonceStore}=require('../../lib/browser/nonceStore');
const {configuration,createProductionBrowser}=require('../../lib/browser/production');
const {bound,principal,grant}=require('./support.cjs');
const c=require('../../lib/browser/contracts');
const sdk={getAgentRequestHeaders:async()=>({'X-Agent-User-Id':'service1','X-Agent-Secret-Token':'synthetic-service-token'})};
test('current-agent lookup uses service proof plus exact reference, rejects changed generation and stale authority',async()=>{
 let body,status=200,value=principal;
 const resolve=createCurrentAgentResolver({url:'https://auth.example.org/owner-access',sdk,agentId:'service1',fetchImpl:async(_url,opts)=>{
  body=JSON.parse(opts.body);assert.equal(opts.headers['X-Agent-User-Id'],'service1');assert.equal(opts.headers.Authorization,undefined);
  return Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
 }});
 assert.deepEqual(await resolve(principal),principal);assert.equal(body.principalKind,'agent');assert.deepEqual(body.authorizationRef,principal.authorizationRef);assert.equal(body.operation,undefined);
 value={...principal,authorizationRef:{...principal.authorizationRef,generation:'b'.repeat(64)}};await assert.rejects(resolve(principal),{code:'PERMISSION_REQUIRED'});
 status=403;await assert.rejects(resolve(principal),{code:'PERMISSION_REQUIRED'});
});
test('runtime authority requires explicit grant and current principal, with no cross-grant substitution',async()=>{
 let current=principal;const g={...grant(),policyVersion:c.POLICY,hostKeyFingerprint:bound.hostKeyFingerprint};
 const authority=createRuntimeAuthority({repository:{create(){},revoke(){},get:async()=>g},resolveCurrentAgent:async()=>current});
 await assert.rejects(authority.authorize(bound),{code:'PERMISSION_REQUIRED'});
 assert.equal((await authority.authorize({...bound,grantId:g.grantId})).grantId,g.grantId);
 await assert.rejects(authority.authorizeGrant('other',{...bound,grantId:g.grantId}),{code:'PERMISSION_REQUIRED'});
 current={...principal,stopped:true};await assert.rejects(authority.authorize({...bound,grantId:g.grantId}));
});
test('nonce adapter uses atomic NX with bounded expiry and hashed names; failures never accept',async()=>{
 const calls=[],seen=new Set();const consume=createNonceStore({now:()=>1000,redis:{set:async(...args)=>{calls.push(args);if(seen.has(args[0]))return null;seen.add(args[0]);return 'OK';}}});
 const value={scope:c.scope(bound),nonce:'n1',expiresAt:2000};assert.equal(await consume(value),true);assert.equal(await consume(value),false);
 assert.deepEqual(calls[0].slice(1),['1','PX',1000,'NX']);assert.match(calls[0][0],/^browser-v1:nonce:[a-f0-9]{64}$/);
 await assert.rejects(consume({...value,expiresAt:121001}));
 const unavailable=createNonceStore({redis:{set:async()=>{throw Error('private connection');}}});await assert.rejects(unavailable({...value,expiresAt:Date.now()+1000}),{code:'UNAVAILABLE'});
});
const env={BROWSER_ENABLED:'1',BROWSER_CONTAINMENT:'isolated-proxy-v1',BROWSER_POSTGRES_URL:'postgres://fixture',BROWSER_REDIS_URL:'redis://fixture',BROWSER_AGENT_ACCESS_URL:'https://auth.example.org/agent',BROWSER_OWNER_ACCESS_URL:'https://auth.example.org/owner',BROWSER_SENTINEL_URL:'https://auth.example.org/api',BROWSER_SENTINEL_CLIENT_ID:'fixture',BROWSER_SENTINEL_CLIENT_SECRET:'SYNTHETIC',BROWSER_AGENT_ID:'service1',BROWSER_PROXY_CONTROL_URL:'http://egress:8290',BROWSER_PROXY_TOKEN:'x'.repeat(32)};
test('production defaults off and refuses missing containment/configuration',async()=>{
 assert.deepEqual(configuration({}),{enabled:false});const disabled=createProductionBrowser({}, {clientsFactory:()=>{throw Error('must not construct');}});assert.deepEqual(await disabled.start(),{enabled:false});await disabled.stop();
 assert.throws(()=>configuration({...env,BROWSER_CONTAINMENT:''}));assert.throws(()=>configuration({...env,BROWSER_PORT:'8280'}));assert.throws(()=>configuration({BROWSER_PRIVATE_ENABLED:'1'}));
 assert.equal(configuration(env).privateEnabled,false);
});
test('dedicated boot checks schema, wires authority/runtime and closes clients; never applies migrations',async()=>{
 let opened=0,closed=0,stopped=0,queries=[],deps;
 const fakeServer={once(name,callback){if(name==='listening')queueMicrotask(callback);return this;},closeAllConnections(){},close(callback){callback();}};
 const service=createProductionBrowser(env,{loadSdk:()=>({TraylinxAuthClient:class{getAgentRequestHeaders(){return sdk.getAgentRequestHeaders();}}}),clientsFactory:()=>({pool:{query:async q=>{queries.push(q.text);return {rows:[]};}},redis:{set:async()=> 'OK'},open:async()=>{opened++;},close:async()=>{closed++;}}),runtimeFactory:input=>{deps=input;return {app:{listen:()=>fakeServer},stop:async()=>{stopped++;}};}});
 assert.deepEqual(await service.start(),{enabled:true,port:8292});assert.equal(opened,1);assert.deepEqual(queries,['SELECT grant_id FROM web_browser.grants LIMIT 0']);assert.equal(typeof deps.authorize,'function');assert.equal(typeof deps.resolveCaller,'function');assert.equal(deps.privateEnabled,false);
 await service.stop();await service.stop();assert.equal(stopped,1);assert.equal(closed,1);
});
test('missing database schema fails startup and closes clients before binding listener',async()=>{
 let closed=0;const service=createProductionBrowser(env,{loadSdk:()=>({TraylinxAuthClient:class{}}),clientsFactory:()=>({pool:{query:async()=>{throw Error('schema missing');}},open:async()=>{},close:async()=>{closed++;}}),runtimeFactory:()=>{throw Error('must not construct');}});
 await assert.rejects(service.start(),{code:'UNAVAILABLE'});assert.equal(closed,1);
});
test('enrollment boot uses separate scoped writer and passes both authority boundaries',async()=>{
 const r={role:'reader',database:'web',readable:true,insertable:false,writable:false,revocable:false,deletable:false,truncatable:false,other_update:false};
 const w={...r,role:'writer',insertable:true,writable:true,revocable:true};
 let writerClosed=0,readerClosed=0,deps;
 const configured={...env,BROWSER_ENROLLMENT_ENABLED:'1',BROWSER_POSTGRES_URL:'postgres://reader@fixture/web',BROWSER_ENROLLMENT_POSTGRES_URL:'postgres://writer@fixture/web',BROWSER_PROJECT_ACCESS_URL:'https://auth.example.org/project'};
 assert.throws(()=>configuration({...configured,BROWSER_ENROLLMENT_POSTGRES_URL:''}));
 const server={once(n,fn){if(n==='listening')queueMicrotask(fn);},closeAllConnections(){},close(fn){fn();}};
 const service=createProductionBrowser(configured,{
  loadSdk:()=>({TraylinxAuthClient:class{getAgentRequestHeaders(){return sdk.getAgentRequestHeaders();}}}),
  clientsFactory:()=>({pool:{query:async()=>({rows:[r]})},redis:{set:async()=> 'OK'},open:async()=>{},close:async()=>{readerClosed++;}}),
  enrollmentPoolFactory:url=>{assert.equal(url,configured.BROWSER_ENROLLMENT_POSTGRES_URL);return {query:async()=>({rows:[w]}),end:async()=>{writerClosed++;}};},
  runtimeFactory:input=>{deps=input;return {app:{listen:()=>server},stop:async()=>{}};},
 });
 await service.start();assert.ok(deps.enrollment);assert.equal(typeof deps.resolveEnrollmentPrincipal,'function');assert.equal(typeof deps.resolveHuman,'function');assert.equal(deps.privateEnabled,false);
 await service.stop();assert.equal(writerClosed,1);assert.equal(readerClosed,1);
});
