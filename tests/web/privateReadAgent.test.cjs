'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createPrivateReadAgent}=require('../../lib/web/privateReadAgent');
const {createLoginConnections}=require('../../lib/web/loginConnections');
const {createPrivateReadClient}=require('../../lib/web/privateReadClient');
const {CaptureError}=require('../../lib/capture/errors');
const origin='https://site.example.com';
const native={submitPath:'/login',readPaths:['/report'],fields:{form:'form',username:'#user',password:'#pass',submit:'button'},proof:{selector:'#account',attribute:'textContent'}};
function connection(){return {id:'site',label:'Test account',origins:[origin],postUrls:[origin+'/login'],loginUrl:origin+'/login',login:native,username:'synthetic-user',password:'synthetic-password'};}
function setup(capture){let clock=1000;const connections={list:()=>[],get:()=>connection()};return {agent:createPrivateReadAgent({connections,capture,now:()=>clock}),tick:()=>{clock+=600001;},connections};}
const propose=agent=>agent.call({name:'propose_authenticated_read',arguments:{connectionId:'site',url:origin+'/report'}});
const run=(agent,id)=>agent.call({name:'run_authenticated_read',arguments:{planId:id}});
test('private plan has no credentials; synchronous result and concurrent/replayed submissions never relogin',async()=>{
 let calls=0,finish;const {agent}=setup(async request=>{calls++;assert.equal(request.auth.password,'synthetic-password');await new Promise(r=>{finish=r;});return {success:true,markdown:'Private report'};});
 const p=await propose(agent);assert.doesNotMatch(JSON.stringify(p),/synthetic-user|synthetic-password/);
 const first=run(agent,p.planId);assert.equal((await run(agent,p.planId)).state,'running');finish();assert.equal((await first).state,'completed');assert.equal((await run(agent,p.planId)).result.markdown,'Private report');assert.equal(calls,1);
});
test('uncertain failure never retries and never exposes upstream secret exception',async()=>{
 let calls=0;const {agent}=setup(async()=>{calls++;throw Error('synthetic-password');});const p=await propose(agent);
 const r=await run(agent,p.planId);assert.equal(r.error,'UNAVAILABLE');assert.doesNotMatch(JSON.stringify(r),/synthetic-password/);await run(agent,p.planId);assert.equal(calls,1);
});
test('restart/expiry cannot recover by performing a new login',async()=>{
 const {agent,tick}=setup(async()=>{});const p=await propose(agent);tick();await assert.rejects(run(agent,p.planId));
 await assert.rejects(run(setup(async()=>{}).agent,p.planId));
});
test('credentials in tool args, unapproved origins/posts and account changes rejected',async()=>{
 const {agent,connections}=setup(async()=>{throw Error('should not execute');});
 await assert.rejects(agent.call({name:'propose_authenticated_read',arguments:{connectionId:'site',url:origin+'/report',password:'no'}}));
 await assert.rejects(agent.call({name:'propose_authenticated_read',arguments:{connectionId:'site',url:origin+'/report',login:{...native,submitPath:'/delete'}}}));
 const p=await propose(agent);connections.get=()=>({...connection(),username:'other-user'});assert.equal((await run(agent,p.planId)).error,'FORBIDDEN');
});
test('host credential file refuses broad permissions, symlinks and extra fields; listing does not expose secrets',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'login-connection-test-')),file=path.join(dir,'connections.json');
 try{
  fs.writeFileSync(file,JSON.stringify({connections:[connection()]}),{mode:0o600});const store=createLoginConnections(file);assert.equal(store.get('site').password,'synthetic-password');assert.doesNotMatch(JSON.stringify(store.list()),/synthetic-user|synthetic-password/);
  fs.chmodSync(file,0o644);assert.throws(()=>store.list());fs.chmodSync(file,0o600);fs.symlinkSync(file,file+'.link');assert.throws(()=>createLoginConnections(file+'.link').list());
  fs.writeFileSync(file,JSON.stringify({connections:[{...connection(),token:'bad'}]}));assert.throws(()=>store.list());
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('private HTTP uses fresh Sentinel proof, no redirects/cache, rechecks project, no retry on error',async()=>{
 let checks=0,calls=0;const client=createPrivateReadClient({url:'https://capture.example.com/api/capture/v1',agentId:'agent1',sdk:{getAgentRequestHeaders:async()=>({'X-Agent-User-Id':'agent1','X-Agent-Secret-Token':'synthetic-proof',Authorization:'must-not-forward'})},backend:{capabilities:async()=>{checks++;}},fetchImpl:async(url,o)=>{calls++;assert.equal(url,'https://capture.example.com/api/capture/v1/authenticated');assert.equal(o.redirect,'error');assert.equal(o.headers.Authorization,undefined);return Response.json({success:true,url:origin+'/report',markdown:'Report',cache:'miss'},{headers:{'Cache-Control':'no-store'}});}});
 await client({url:origin+'/report',budgetMs:1000});assert.equal(calls,1);assert.equal(checks,2);
});
test('official MCP client discovers and executes private read without plaintext credentials or owner IDs',async()=>{
 const {Client}=require('../../deploy/web-agent/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js');
 const {InMemoryTransport}=require('../../deploy/web-agent/node_modules/@modelcontextprotocol/sdk/dist/cjs/inMemory.js');
 const {createAgentMcpServer}=require('../../lib/web/mcpServer');
 const {agent}=setup(async()=>({success:true,markdown:'Verified organization evidence'}));
 const server=createAgentMcpServer({backend:{plan:async()=>{},read:async()=>{}},privateReads:agent});const client=new Client({name:'private-fixture',version:'1'});const [a,b]=InMemoryTransport.createLinkedPair();
 try{
 await server.connect(a);await client.connect(b);assert.equal((await client.listTools()).tools.length,12);
 assert.match(client.getInstructions(),/propose_authenticated_read/);
 const invoke=async(name,args)=>JSON.parse((await client.callTool({name,arguments:args})).content[0].text);
 const p=await invoke('propose_authenticated_read',{connectionId:'site',url:origin+'/report'});assert.equal(p.state,'prepared');assert.doesNotMatch(JSON.stringify(p),/synthetic-password/);
 const r=await invoke('run_authenticated_read',{planId:p.planId});assert.equal(r.state,'completed');assert.match(r.result.markdown,/Verified organization/);
 }finally{await client.close();await server.close();}
});
