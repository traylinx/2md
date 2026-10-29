'use strict';
// Owned multi-step dynamic page; real worker, HTTP client and delivered viewer.
// A slow background view must not discard a click or replay a second input.
const assert=require('node:assert/strict'),https=require('node:https'),fs=require('node:fs'),net=require('node:net'),path=require('node:path'),os=require('node:os');
const {Deadline}=require('../../lib/capture/deadline'),{createEgressProxy}=require('../../lib/capture/egressProxy'),{createBrowserRuntime}=require('../../lib/browser/runtime');
const {bound,owner,grant,privateKey}=require('./support.cjs'),c=require('../../lib/browser/contracts');
const seen=[],diagnostics=[];const origins=['https://example.com'];
const originalWrite=process.stderr.write;
process.stderr.write=function(chunk,...args){try{const row=JSON.parse(String(chunk));if(['browser_human_timing','browser_network_summary'].includes(row.event))diagnostics.push(row);}catch{}return originalWrite.call(this,chunk,...args);};
const server=https.createServer({key:fs.readFileSync(process.env.FIXTURE_KEY),cert:fs.readFileSync(process.env.FIXTURE_CERT)},(req,res)=>{
 seen.push({path:req.url,method:req.method});res.setHeader('Cache-Control','no-store');
 if(req.url.startsWith('/step'))return setTimeout(()=>res.end('updated'),300);
 if(req.url==='/owned-failure'){res.statusCode=503;return res.end('owned synthetic error');}
 res.setHeader('Content-Type','text/html');res.end(`<style>body{margin:0}button{position:absolute;left:20px;top:20px;width:250px;height:70px}h1{position:absolute;top:120px}</style>
 <button id="next">Continue owned flow</button><h1>STEP 0 COMPLETE</h1><script>
 let step=0,pending=false;document.getElementById('next').onclick=async()=>{
 if(pending)return;pending=true;const n=++step;document.querySelector('h1').textContent='UPDATING';
 if(n===1)fetch('/owned-failure').catch(()=>{});
 await fetch('/step?n='+n);setTimeout(()=>{document.querySelector('h1').textContent='STEP '+n+' COMPLETE';pending=false;},300);
 };</script>`);
});
(async()=>{
 const lifetime=new Deadline(80000),root=fs.mkdtempSync(path.join(os.tmpdir(),'gb01-responsive-owned-'));let runtime,proxy,host,httpServer,viewer;
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const g={...grant(),policyVersion:c.POLICY,hostKeyFingerprint:bound.hostKeyFingerprint,approvedByWorkspaceUserId:owner.workspaceUserId},nonces=new Set();
  runtime=createBrowserRuntime({privateEnabled:true,humanEnabled:true,embeddedFrames:true,autoSweep:false,runtimeEpoch:'e1',tempRoot:root,executablePath:process.env.FIXTURE_CHROMIUM_WRAPPER,
   authorize:async()=>g,resolveCaller:async()=>bound,consumeNonce:async({nonce})=>{if(nonces.has(nonce))return false;nonces.add(nonce);return true;},lease:async()=>{
    proxy=createEgressProxy({deadline:lifetime,resolve:async value=>{const url=new URL(value);assert.ok(origins.includes(url.origin));return {url,addresses:[{address:'127.0.0.1',family:4}]};},connect:options=>net.connect({...options,port:server.address().port})});await new Promise(r=>proxy.server.listen(0,'127.0.0.1',r));return {proxyUrl:`http://127.0.0.1:${proxy.server.address().port}`,release:()=>proxy.close()};
   }});
  httpServer=runtime.app.listen(0,'127.0.0.1');await new Promise(r=>httpServer.once('listening',r));
  const calls=[];
  const client=require('../../lib/browser/httpClient').createBrowserHttpClient({url:'https://owned-runtime.test/api/browser/v1',bound,grantId:g.grantId,privateKey,agentId:bound.principal.workspaceUserId,sdk:{getAgentRequestHeaders:async()=>({'x-agent-user-id':bound.principal.workspaceUserId,'x-agent-secret-token':'synthetic-only'})},fetchImpl:async(url,options)=>{
   const route=new URL(url).pathname;calls.push(route);if(route.endsWith('/human-view')&&calls.filter(p=>p.endsWith('/human-view')).length>1)await lifetime.sleep(2800);const r=await fetch('http://127.0.0.1:'+httpServer.address().port+new URL(url).pathname,options);return new Response(r.body,{status:r.status,headers:r.headers});
  }});
  assert.equal((await client.call('get_browser_capabilities',{includeHumanResponsive:true})).humanResponsiveAvailable,true);
  const opened=await client.call('browser_open',{runtimeEpoch:'e1',actionId:'open',mode:'login_read',url:origins[0],purpose:'Owned responsive multistep fixture'});assert.equal(opened.state,'succeeded');const sessionId=opened.sessionId;
  host=await require('../../lib/browser/humanHost').createHumanHost({client});const handoff=await host.call('browser_handoff',{sessionId,action:'start'});
  const origin=new URL(handoff.inputUrl).origin,launch=await fetch(handoff.inputUrl,{redirect:'manual'}),cookie=launch.headers.get('set-cookie').split(';')[0];
  const html=await(await fetch(origin+'/viewer',{headers:{cookie}})).text();assert.match(html,/responsive:true/);
  viewer=new(require('jsdom').JSDOM)(html,{url:origin+'/viewer',runScripts:'dangerously',beforeParse(w){w.AbortController=AbortController;w.HTMLImageElement.prototype.decode=async()=>{};w.fetch=(route,options)=>fetch(origin+route,{...options,headers:{...options.headers,cookie,origin}});}});
  const w=viewer.window,$=id=>w.document.getElementById(id),screen=$('screen');screen.getBoundingClientRect=()=>({left:0,top:0,width:1280,height:800});
  for(const [key,value]of Object.entries({clientWidth:1280,clientHeight:800,clientLeft:0,clientTop:0}))Object.defineProperty(screen,key,{value});
  async function until(check){for(let n=0;n<350;n++){lifetime.remaining();if(check())return;await lifetime.sleep(50);}assert.ok(check(),$('status').textContent);}
  const ready=()=>w.document.body.dataset.state==='ready'&&!$('refresh').disabled;
  await until(ready);
  const metrics=[];
  for(let step=1;step<=3;step++){
   await until(()=>w.document.body.dataset.state==='working'&&screen.getAttribute('aria-disabled')==='false');
   const start=Date.now(),inputsBefore=calls.filter(p=>p.endsWith('/human-interact')).length;
   assert.equal($('screenCover').hidden,true,'background view does not cover the page');
   screen.dispatchEvent(new w.MouseEvent('click',{clientX:100,clientY:50,bubbles:true}));
   screen.dispatchEvent(new w.MouseEvent('click',{clientX:100,clientY:50,bubbles:true}));
   assert.match($('status').textContent,/Input captured/);
   assert.equal(screen.hidden,false,'retain visible image while intent waits');
   await until(()=>ready()&&calls.filter(p=>p.endsWith('/human-interact')).length===inputsBefore+1);
   await until(()=>seen.filter(r=>r.path.startsWith('/step?')).length===step);
   metrics.push({step,elapsedMs:Date.now()-start,requests:1});
   await lifetime.sleep(700); // owned page asynchronous DOM completion, not provider timing
  }
  assert.equal(calls.filter(p=>p.endsWith('/human-interact')).length,3);
  assert.deepEqual(seen.filter(r=>r.path.startsWith('/step?')).map(r=>r.path),['/step?n=1','/step?n=2','/step?n=3']);
  assert.ok(diagnostics.some(row=>row.event==='browser_network_summary'&&row.counts.http5xx===1),'retain owned 503 aggregate');
  assert.ok(diagnostics.some(row=>row.side==='server'&&row.ms.worker_input!==undefined));
  assert.ok(diagnostics.some(row=>row.side==='host'&&row.ms.sdk_headers!==undefined));
  assert.ok(diagnostics.every(row=>/^[a-f0-9]{16}$/.test(row.session)));
  assert.doesNotMatch(JSON.stringify(diagnostics),/example.com|owned-failure|synthetic error|STEP|jpeg|token/);
  $('finish').click();await until(()=>w.document.body.dataset.state==='agent_control');assert.equal(screen.hidden,true);
  assert.equal((await host.call('browser_handoff',{sessionId,action:'status'})).state,'agent_control');
  const extracted=await client.call('browser_extract',{sessionId});assert.match(extracted.markdown,/STEP 3 COMPLETE/);
  await client.call('browser_close',{sessionId});assert.equal(runtime.manager.diagnostics().active,0);assert.deepEqual(fs.readdirSync(root),[]);
  console.log(JSON.stringify({result:'PASS',slowBackgroundMs:2800,steps:3,deliveredInputs:3,secondInputsIgnored:3,noReplay:true,metrics,diagnosticsRetained:true,returnedToAgent:true,extraction:'STEP 3 COMPLETE',externalTraffic:false}));
 }finally{if(viewer){viewer.window.dispatchEvent(new viewer.window.Event('pagehide'));viewer.window.close();}await host?.close();await runtime?.stop();httpServer?.closeAllConnections();if(httpServer)await new Promise(r=>httpServer.close(r));await proxy?.close();lifetime.close();server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});process.stderr.write=originalWrite;}
})().catch(e=>{console.error(e);process.exitCode=1;});
