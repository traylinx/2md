'use strict';
// Owned delayed/parallel page. No real account, CAPTCHA, or external traffic.
const assert=require('node:assert/strict'),https=require('node:https'),fs=require('node:fs'),net=require('node:net'),path=require('node:path'),os=require('node:os');
const {Deadline}=require('../../lib/capture/deadline'),{createEgressProxy}=require('../../lib/capture/egressProxy'),{createBrowserRuntime}=require('../../lib/browser/runtime');
const {bound,owner,grant,privateKey}=require('./support.cjs'),c=require('../../lib/browser/contracts');
const seen=[];const origins=['https://example.com','https://frame.example.net'];
const server=https.createServer({key:fs.readFileSync(process.env.FIXTURE_KEY),cert:fs.readFileSync(process.env.FIXTURE_CERT)},(req,res)=>{
 seen.push({path:req.url,method:req.method});
 res.setHeader('Access-Control-Allow-Origin',origins[0]);res.setHeader('Cache-Control','no-store');
 if(req.url.startsWith('/asset')){res.setHeader('Content-Type','text/plain');return res.end('asset');}
 if(req.url==='/done'){let body='';req.on('data',x=>body+=x);return req.on('end',()=>{assert.equal(body,'owned-delayed');res.end('ASYNC COMPLETE: all three parallel assets and delayed POST succeeded');});}
 res.setHeader('Content-Type','text/html');
 res.end(`<style>body{margin:0}button{position:absolute;left:20px;top:20px;width:250px;height:70px}h1{position:absolute;top:120px}</style>
 <button id="start">Start owned delayed update</button><h1>WAITING</h1><script>
 document.getElementById('start').onclick=()=>{document.querySelector('h1').textContent='SCHEDULED';setTimeout(()=>{
 Promise.all([1,2,3].map(n=>fetch('${origins[1]}/asset'+n).then(r=>r.text())))
 .then(()=>fetch('/done',{method:'POST',body:'owned-delayed'})).then(r=>r.text()).then(t=>document.querySelector('h1').textContent=t)
 .catch(()=>document.querySelector('h1').textContent='FAILED');},2000);};</script>`);
});
(async()=>{
 const lifetime=new Deadline(80000),root=fs.mkdtempSync(path.join(os.tmpdir(),'gb01-async-owned-'));let runtime,proxy,host,httpServer,viewer;
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const g={...grant(),policyVersion:c.POLICY,approvedByWorkspaceUserId:owner.workspaceUserId},nonces=new Set();
  runtime=createBrowserRuntime({privateEnabled:true,humanEnabled:true,embeddedFrames:true,autoSweep:false,runtimeEpoch:'e1',tempRoot:root,executablePath:process.env.FIXTURE_CHROMIUM_WRAPPER,
   authorize:async()=>g,resolveCaller:async()=>bound,consumeNonce:async({nonce})=>{if(nonces.has(nonce))return false;nonces.add(nonce);return true;},lease:async()=>{
    proxy=createEgressProxy({deadline:lifetime,resolve:async value=>{const url=new URL(value);assert.ok(origins.includes(url.origin));return {url,addresses:[{address:'127.0.0.1',family:4}]};},connect:options=>net.connect({...options,port:server.address().port})});await new Promise(r=>proxy.server.listen(0,'127.0.0.1',r));return {proxyUrl:`http://127.0.0.1:${proxy.server.address().port}`,release:()=>proxy.close()};
   }});
  httpServer=runtime.app.listen(0,'127.0.0.1');await new Promise(r=>httpServer.once('listening',r));
  const calls=[];
  const client=require('../../lib/browser/httpClient').createBrowserHttpClient({url:'https://owned-runtime.test/api/browser/v1',bound,grantId:g.grantId,privateKey,agentId:bound.principal.workspaceUserId,sdk:{getAgentRequestHeaders:async()=>({'x-agent-user-id':bound.principal.workspaceUserId,'x-agent-secret-token':'synthetic-only'})},fetchImpl:async(url,options)=>{
   calls.push(new URL(url).pathname);const r=await fetch('http://127.0.0.1:'+httpServer.address().port+new URL(url).pathname,options);return new Response(r.body,{status:r.status,headers:r.headers});
  }});
  assert.equal((await client.call('get_browser_capabilities',{includeHumanAsync:true})).humanAsyncAvailable,true);
  const opened=await client.call('browser_open',{runtimeEpoch:'e1',actionId:'open',mode:'login_read',url:origins[0],purpose:'Owned delayed networking fixture'});assert.equal(opened.state,'succeeded');const sessionId=opened.sessionId;
  host=await require('../../lib/browser/humanHost').createHumanHost({client});const handoff=await host.call('browser_handoff',{sessionId,action:'start'});
  const origin=new URL(handoff.inputUrl).origin,launch=await fetch(handoff.inputUrl,{redirect:'manual'}),cookie=launch.headers.get('set-cookie').split(';')[0];
  const html=await(await fetch(origin+'/viewer',{headers:{cookie}})).text();assert.match(html,/asyncUpdates:true/);
  viewer=new(require('jsdom').JSDOM)(html,{url:origin+'/viewer',runScripts:'dangerously',beforeParse(w){w.AbortController=AbortController;w.HTMLImageElement.prototype.decode=async()=>{};w.fetch=(route,options)=>fetch(origin+route,{...options,headers:{...options.headers,cookie,origin}});}});
  const w=viewer.window,$=id=>w.document.getElementById(id),screen=$('screen');screen.getBoundingClientRect=()=>({left:0,top:0,width:1280,height:800});
  for(const [key,value]of Object.entries({clientWidth:1280,clientHeight:800,clientLeft:0,clientTop:0}))Object.defineProperty(screen,key,{value});
  async function until(check){for(let n=0;n<350;n++){lifetime.remaining();if(check())return;await lifetime.sleep(50);}assert.ok(check(),$('status').textContent);}
  const ready=()=>w.document.body.dataset.state==='ready'&&!$('refresh').disabled;
  await until(ready);screen.dispatchEvent(new w.MouseEvent('click',{clientX:100,clientY:50,bubbles:true}));await until(ready);
  assert.equal(seen.filter(r=>r.path.startsWith('/asset')).length,0,'input receipt must precede delayed networking');
  await until(()=>!$('allow').disabled);assert.match($('request').textContent,/frame.example.net/);
  assert.equal(seen.filter(r=>r.path.startsWith('/asset')).length,0,'none of the queued requests may forward without consent');
  await lifetime.sleep(1000);$('allow').click();await until(ready);
  await until(()=>seen.some(r=>r.path==='/done'));assert.equal(seen.filter(r=>r.path.startsWith('/asset')).length,3);
  assert.equal(calls.filter(p=>p.endsWith('/human-decide')).length,1);assert.equal(calls.filter(p=>p.endsWith('/human-interact')).length,1);
  // No further input: automatic refresh must carry the asynchronous DOM update.
  const before=screen.src,viewCount=calls.filter(p=>p.endsWith('/human-view')).length;
  await until(()=>calls.filter(p=>p.endsWith('/human-view')).length>viewCount&&ready());
  assert.ok(screen.src.startsWith('data:image/jpeg;base64,'));
  assert.equal(seen.filter(r=>r.path==='/done').length,1,'no replay');
  $('finish').click();await until(()=>w.document.body.dataset.state==='agent_control');assert.equal(screen.hidden,true);
  assert.equal((await host.call('browser_handoff',{sessionId,action:'status'})).state,'agent_control');
  const extracted=await client.call('browser_extract',{sessionId});assert.match(extracted.markdown,/ASYNC COMPLETE/);assert.doesNotMatch(extracted.markdown,/FAILED/);
  await client.call('browser_close',{sessionId});assert.equal(runtime.manager.diagnostics().active,0);assert.deepEqual(fs.readdirSync(root),[]);
  console.log(JSON.stringify({result:'PASS',lateRequestsAfterInput:true,parallelAssets:3,permissionDecisions:1,posts:1,automaticFrameRefresh:true,returnedToAgent:true,extraction:'ASYNC COMPLETE',externalTraffic:false}));
 }finally{if(viewer){viewer.window.dispatchEvent(new viewer.window.Event('pagehide'));viewer.window.close();}await host?.close();await runtime?.stop();httpServer?.closeAllConnections();if(httpServer)await new Promise(r=>httpServer.close(r));await proxy?.close();lifetime.close();server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
