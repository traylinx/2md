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
 if(req.url==='/nested')return res.end(`<style>body{margin:0}button{position:absolute;left:10px;top:10px;width:200px;height:50px}</style><button onclick="fetch('/human-result',{method:'POST',body:'owned-click'}).then(r=>r.text()).then(t=>top.postMessage(t,'${origins[0]}'))">Owned manual challenge</button><script>void fetch('http://169.254.169.254/metadata');void fetch('/forbidden-early',{method:'POST',body:'not-authorized'}).catch(()=>{});</script>`);
 if(req.url==='/human-result'){let body='';req.on('data',b=>body+=b);return req.on('end',()=>{posts.push(body);res.end('Owned fixture access granted');});}
 if(req.url==='/echo'){let body='';req.on('data',b=>body+=b);return req.on('end',()=>{posts.push(body);res.end('<h1>Owned organization: Frame team</h1><p>'+body+'</p>');});}
 if(req.url==='/forbidden-early'){posts.push('EARLY_LEAK');return res.end('FAIL');}
 const content="<h1>Owned organization: Frame team</h1><p>Session continued after manual assistance</p><input style=\"position:absolute;left:20px;top:120px;width:300px;height:40px\" aria-label=\"Owned private value\"><output></output>";
 res.end(`<style>body{margin:0}iframe{position:absolute;left:20px;top:50px;width:600px;height:320px;border:0}</style><h1>Owned human verification fixture</h1><iframe src="${origins[1]}/frame"></iframe><script>window.addEventListener('message',e=>{if(e.origin==='${origins[2]}'&&e.data==='Owned fixture access granted'){document.body.innerHTML=${JSON.stringify(content)};document.querySelector('input').oninput=function(){document.querySelector('output').textContent=this.value;};}});</script>`);
});
(async()=>{
 const lifetime=new Deadline(80000),tempRoot=fs.mkdtempSync(path.join(os.tmpdir(),'gb01-human-owned-'));let runtime,proxy,host,httpServer;
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const g={...grant(),policyVersion:c.POLICY,hostKeyFingerprint:bound.hostKeyFingerprint,approvedByWorkspaceUserId:owner.workspaceUserId},nonces=new Set();
  runtime=createBrowserRuntime({privateEnabled:true,humanEnabled:true,embeddedFrames:true,autoSweep:false,runtimeEpoch:'e1',tempRoot,executablePath:process.env.FIXTURE_CHROMIUM_WRAPPER,authorize:async()=>g,resolveCaller:async()=>bound,consumeNonce:async({nonce})=>{if(nonces.has(nonce))return false;nonces.add(nonce);return true;},lease:async()=>{
   proxy=createEgressProxy({deadline:lifetime,resolve:async value=>{const url=new URL(value);assert.ok(origins.includes(url.origin));return {url,addresses:[{address:'127.0.0.1',family:4}]};},connect:options=>net.connect({...options,port:server.address().port})});await new Promise(r=>proxy.server.listen(0,'127.0.0.1',r));return {proxyUrl:`http://127.0.0.1:${proxy.server.address().port}`,release:()=>proxy.close()};
  }});
  httpServer=runtime.app.listen(0,'127.0.0.1');await new Promise(r=>httpServer.once('listening',r));
  // Use signed HTTP routes, not privileged direct manager calls for the viewer.
  const client=require('../../lib/browser/httpClient').createBrowserHttpClient({url:'https://owned-runtime.test/api/browser/v1',bound,grantId:g.grantId,privateKey,agentId:bound.principal.workspaceUserId,sdk:{getAgentRequestHeaders:async()=>({'x-agent-user-id':bound.principal.workspaceUserId,'x-agent-secret-token':'synthetic-only'})},fetchImpl:async(url,options)=>{const response=await fetch('http://127.0.0.1:'+httpServer.address().port+new URL(url).pathname,options);return new Response(response.body,{status:response.status,headers:response.headers});}});
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
  const frame=await api('/frame');assert.ok(frame.jpeg.startsWith('/9j/'));assert.equal(frame.width,1280);
  const command={actionId:'human-owned-click',frameId:frame.frameId,input:{type:'click',x:90,y:120}};
  let action=await api('/input',command);let decisions=0;
  for(let i=0;i<80;i++){
   const state=await api('/state');if(state.pending){assert.equal(state.pending.origin,origins[2]);assert.equal(state.pending.method,'POST');assert.equal(posts.length,0);await api('/decision',{operationId:state.pending.operationId,operationDigest:state.pending.operationDigest,decision:'approve'});decisions++;}
   action=state.action;if(action?.state==='succeeded')break;assert.ok(['running','needs_input'].includes(action?.state),JSON.stringify(state));await new Promise(r=>setTimeout(r,50));
  }
  assert.equal(action.state,'succeeded');assert.equal(decisions,1);assert.deepEqual(posts,['owned-click']);
  assert.equal((await api('/input',command)).state,'succeeded');assert.equal(posts.length,1);
  let next=await api('/frame');await api('/input',{actionId:'focus',frameId:next.frameId,input:{type:'click',x:100,y:140}});
  next=await api('/frame');assert.equal((await api('/input',{actionId:'type',frameId:next.frameId,input:{type:'text',text:'SYNTHETIC_HUMAN_SECRET'}})).state,'succeeded');
  assert.equal((await api('/finish')).state,'agent_control');assert.equal((await agent.call({name:'browser_handoff',arguments:{sessionId,action:'status'}})).state,'agent_control');
  const extracted=await client.call('browser_extract',{sessionId});assert.match(extracted.markdown,/Frame team/);assert.match(extracted.markdown,/REDACTED/);assert.doesNotMatch(JSON.stringify(extracted),/SYNTHETIC_HUMAN_SECRET/);assert.equal(extracted.source.privacy,'private');
  await client.call('browser_close',{sessionId});assert.equal(runtime.manager.diagnostics().active,0);assert.deepEqual(fs.readdirSync(tempRoot),[]);
  console.log('PASS: exact worker nested cross-site/OOPIF early-request containment; signed host HTTP + one-use loopback viewer; no agent control during takeover; one explicit private recipient approval; original human action idempotent; screenshot/click/text same remote session; secret redaction; Return to agent/private evidence and cleanup. Owned synthetic UI only; no real CAPTCHA automated.');
 }finally{await host?.close();await runtime?.stop();httpServer?.closeAllConnections();if(httpServer)await new Promise(r=>httpServer.close(r));await proxy?.close();lifetime.close();server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(tempRoot,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
