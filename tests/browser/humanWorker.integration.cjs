'use strict';
// Owned synthetic interaction, not an automated CAPTCHA solver. Distinct sites
// force real OOPIF processes; early iframe requests must pass the same guard.
const assert=require('node:assert/strict'),https=require('node:https'),fs=require('node:fs'),net=require('node:net'),path=require('node:path'),os=require('node:os');
const {Deadline}=require('../../lib/capture/deadline'),{createEgressProxy}=require('../../lib/capture/egressProxy'),{createBrowserRuntime}=require('../../lib/browser/runtime');
const {bound,owner,grant,privateKey}=require('./support.cjs'),c=require('../../lib/browser/contracts');
const origins=['https://example.com','https://frame.example.net','https://nested.example.org'],requests=[],posts=[];
const server=https.createServer({key:fs.readFileSync(process.env.FIXTURE_KEY),cert:fs.readFileSync(process.env.FIXTURE_CERT)},(req,res)=>{
 requests.push({host:req.headers.host,path:req.url,method:req.method});res.setHeader('Content-Type','text/html');
 if(req.url==='/frame')return res.end(`<style>body{margin:0}</style><p>Embedded frame</p><iframe src="${origins[2]}/nested" style="position:absolute;top:40px;left:0;width:400px;height:200px;border:0"></iframe>`);
 if(req.url==='/nested')return res.end(`<style>body{margin:0}button{position:absolute;left:10px;top:10px;width:200px;height:50px}</style><button onclick="fetch('/human-result',{method:'POST',body:'owned-click'}).then(r=>r.text()).then(()=>fetch('/human-result',{method:'POST',body:'owned-followup'})).then(r=>r.text()).then(t=>top.postMessage(t,'${origins[0]}'))">Owned manual challenge</button><script>void fetch('http://169.254.169.254/metadata');void fetch('/forbidden-early',{method:'POST',body:'not-authorized'}).catch(()=>{});</script>`);
 if(req.url==='/human-result'){let body='';req.on('data',b=>body+=b);return req.on('end',()=>{posts.push(body);res.end('Owned fixture access granted');});}
 if(req.url==='/echo'){let body='';req.on('data',b=>body+=b);return req.on('end',()=>{posts.push(body);res.end('<h1>Owned organization: Frame team</h1><p>'+body+'</p>');});}
 if(req.url==='/forbidden-early'){posts.push('EARLY_LEAK');return res.end('FAIL');}
 const content="<h1>Owned organization: Frame team</h1><p>Session continued after manual assistance</p><input style=\"position:absolute;left:20px;top:120px;width:300px;height:40px\" aria-label=\"Owned private value\"><output></output>";
 res.end(`<style>body{margin:0}iframe{position:absolute;left:20px;top:50px;width:600px;height:320px;border:0}</style><h1>Owned human verification fixture</h1><iframe src="${origins[1]}/frame"></iframe><script>window.addEventListener('message',e=>{if(e.origin==='${origins[2]}'&&e.data==='Owned fixture access granted'){document.body.innerHTML=${JSON.stringify(content)};document.querySelector('input').oninput=function(){document.querySelector('output').textContent=this.value;};}});</script>`);
});
(async()=>{
 const lifetime=new Deadline(80000),tempRoot=fs.mkdtempSync(path.join(os.tmpdir(),'gb01-human-owned-'));let runtime,proxy,host,httpServer,viewer;
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const g={...grant(),policyVersion:c.POLICY,hostKeyFingerprint:bound.hostKeyFingerprint,approvedByWorkspaceUserId:owner.workspaceUserId},nonces=new Set();
  runtime=createBrowserRuntime({privateEnabled:true,humanEnabled:true,embeddedFrames:true,autoSweep:false,runtimeEpoch:'e1',tempRoot,executablePath:process.env.FIXTURE_CHROMIUM_WRAPPER,authorize:async()=>g,resolveCaller:async()=>bound,consumeNonce:async({nonce})=>{if(nonces.has(nonce))return false;nonces.add(nonce);return true;},lease:async()=>{
   proxy=createEgressProxy({deadline:lifetime,resolve:async value=>{const url=new URL(value);assert.ok(origins.includes(url.origin));return {url,addresses:[{address:'127.0.0.1',family:4}]};},connect:options=>net.connect({...options,port:server.address().port})});await new Promise(r=>proxy.server.listen(0,'127.0.0.1',r));return {proxyUrl:`http://127.0.0.1:${proxy.server.address().port}`,release:()=>proxy.close()};
  }});
  httpServer=runtime.app.listen(0,'127.0.0.1');await new Promise(r=>httpServer.once('listening',r));
  // Use signed HTTP routes, not privileged direct manager calls for the viewer.
  const client=require('../../lib/browser/httpClient').createBrowserHttpClient({url:'https://owned-runtime.test/api/browser/v1',bound,grantId:g.grantId,privateKey,agentId:bound.principal.workspaceUserId,sdk:{getAgentRequestHeaders:async()=>({'x-agent-user-id':bound.principal.workspaceUserId,'x-agent-secret-token':'synthetic-only'})},fetchImpl:async(url,options)=>{if(new URL(url).pathname.endsWith('/human-view'))await lifetime.sleep(2800);const response=await fetch('http://127.0.0.1:'+httpServer.address().port+new URL(url).pathname,options);return new Response(response.body,{status:response.status,headers:response.headers});}});
  const caps=await client.call('get_browser_capabilities',{includeHuman:true});assert.equal(caps.humanHandoffAvailable,true);assert.equal(caps.embeddedFramesAvailable,true);
  let opened=await client.call('browser_open',{runtimeEpoch:'e1',actionId:'open1',mode:'login_read',url:origins[0],purpose:'Owned nested human assistance'});for(let n=0;['running','needs_input'].includes(opened.state)&&n<80;n++){if(opened.state==='needs_input'){const early=await runtime.operations.inspect(bound,opened.output.interventionId);assert.equal(early.method,'POST');assert.equal(early.origin,origins[2]);await runtime.operations.cancel(bound,early.operationId);}await new Promise(r=>setTimeout(r,50));opened=await client.call('browser_action_status',{runtimeEpoch:'e1',actionId:'open1'});}assert.equal(opened.state,'succeeded',JSON.stringify(opened));const sessionId=opened.sessionId;
  const observed=await client.call('browser_observe',{sessionId});assert.equal(observed.frames.length,3,JSON.stringify(observed));assert.ok(observed.frames.every(f=>f.supported));
  assert.ok(requests.some(r=>r.host==='nested.example.org'&&r.path==='/nested'));assert.ok(!requests.some(r=>r.path==='/forbidden-early'));assert.equal(posts.length,0);
  // Denied early operations must not leave the session stuck needs_input.
  host=await require('../../lib/browser/humanHost').createHumanHost({client});
  const agent=require('../../lib/browser/mcpAgent').createBrowserMcpAgent({backend:host,human:true});
  const handoff=await agent.call({name:'browser_handoff',arguments:{sessionId,action:'start'}});assert.equal(handoff.state,'human_control');assert.equal(handoff.jpeg,undefined);
  const origin=new URL(handoff.inputUrl).origin,launch=await fetch(handoff.inputUrl,{redirect:'manual'}),cookie=launch.headers.get('set-cookie').split(';')[0];assert.equal(launch.status,303);
  const html=await(await fetch(origin+'/viewer',{headers:{cookie}})).text(),csrf=JSON.parse(/const csrf=("[^"]+")/.exec(html)[1]);assert.match(html,/Return to agent/);
  const api=async(route,input={})=>{const r=await fetch(origin+route,{method:'POST',headers:{cookie,origin,'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify(input)});const v=await r.json();assert.equal(r.status,200,JSON.stringify(v));return v;};
  await assert.rejects(client.call('browser_observe',{sessionId}),{code:'BUSY'});
  // Run the actual delivered viewer handlers, not just its HTTP API. JSDOM
  // supplies DOM events here; native Chrome rendering is qualified separately.
  const viewerRequests=[];
  viewer=new (require('jsdom').JSDOM)(html,{url:origin+'/viewer',runScripts:'dangerously',beforeParse(w){
   w.AbortController=AbortController;w.HTMLImageElement.prototype.decode=async()=>{};
   w.fetch=(route,options)=>{viewerRequests.push({route,input:JSON.parse(options.body)});return fetch(origin+route,{...options,headers:{...options.headers,cookie,origin}});};
  }});
  const w=viewer.window,$=id=>w.document.getElementById(id),screen=$('screen');
  screen.getBoundingClientRect=()=>({left:0,top:0,width:640,height:400});
  for(const [key,value]of Object.entries({clientWidth:640,clientHeight:400,clientLeft:0,clientTop:0}))Object.defineProperty(screen,key,{value});
  async function waitFor(check){for(let n=0;n<300;n++){lifetime.remaining();if(check())return;await lifetime.sleep(50);}assert.ok(check(),$('status').textContent);}
  const ready=()=>w.document.body.dataset.state==='ready'&&!$('refresh').disabled;
  await waitFor(ready);assert.ok(screen.src.startsWith('data:image/jpeg;base64,/9j/'));
  screen.dispatchEvent(new w.MouseEvent('click',{clientX:45,clientY:60,bubbles:true}));
  await waitFor(()=>!$('allow').disabled);assert.match($('request').textContent,/https:\/\/nested.example.org/);assert.equal(posts.length,0);
  // Real human deliberation exceeds the worker's old 30s auth window.
  await lifetime.sleep(31000);await client.protectedCall('heartbeat',{sessionId});
  $('allow').click();await waitFor(ready);assert.deepEqual(posts,['owned-click','owned-followup']);
  assert.equal(viewerRequests.filter(x=>x.route==='/decision').length,1);
  assert.equal(viewerRequests.filter(x=>x.route==='/activate').length,1);assert.ok(viewerRequests.some(x=>x.route==='/view'));
  assert.equal(viewerRequests.filter(x=>['/state','/frame'].includes(x.route)).length,0);
  const command=viewerRequests.find(x=>x.route==='/interact').input;
  assert.deepEqual(command.input,{type:'click',x:90,y:120});assert.equal((await api('/input',command)).state,'succeeded');assert.equal(posts.length,2);
  const viewCount=viewerRequests.filter(x=>x.route==='/view').length;
  // Repeated ordinary field-focus clicks preserve the image and consume exactly
  // one interaction request apiece, not a second refresh for every pointer event.
  for(let i=0;i<6;i++){
   screen.dispatchEvent(new w.MouseEvent('click',{clientX:50,clientY:70,bubbles:true}));
   assert.equal(screen.hidden,false);assert.equal($('screenCover').hidden,false);assert.equal(screen.getAttribute('aria-disabled'),'true');
   await waitFor(ready);assert.equal($('screenCover').hidden,true);
  }
  assert.equal(viewerRequests.filter(x=>x.route==='/view').length,viewCount);
  assert.equal(viewerRequests.filter(x=>x.route==='/interact').length,7);
  $('text').value='SYNTHETIC_HUMAN_SECRET';$('type').click();await waitFor(ready);assert.equal($('text').value,'');
  $('finish').click();await waitFor(()=>w.document.body.dataset.state==='agent_control');assert.equal(screen.hidden,true);
  assert.equal((await agent.call({name:'browser_handoff',arguments:{sessionId,action:'status'}})).state,'agent_control');
  const extracted=await client.call('browser_extract',{sessionId});assert.match(extracted.markdown,/Frame team/);assert.match(extracted.markdown,/REDACTED/);assert.doesNotMatch(JSON.stringify(extracted),/SYNTHETIC_HUMAN_SECRET/);assert.equal(extracted.source.privacy,'private');
  await client.call('browser_close',{sessionId});assert.equal(runtime.manager.diagnostics().active,0);assert.deepEqual(fs.readdirSync(tempRoot),[]);
  console.log('PASS: exact worker nested cross-site/OOPIF early-request containment; signed host HTTP + actual delivered viewer DOM click/decision/type/return handlers; no agent control during takeover; one private recipient approval after31s human wait; combined view with2.8s transport delay; six subsequent pointer inputs each use one interaction response and preserve disabled image; original human action idempotent; screenshot/click/text same remote session; secret redaction; Return to agent/private evidence and cleanup. Owned synthetic UI only; no real CAPTCHA automated.');
 }finally{if(viewer){viewer.window.dispatchEvent(new viewer.window.Event('pagehide'));viewer.window.close();}await host?.close();await runtime?.stop();httpServer?.closeAllConnections();if(httpServer)await new Promise(r=>httpServer.close(r));await proxy?.close();lifetime.close();server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(tempRoot,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
