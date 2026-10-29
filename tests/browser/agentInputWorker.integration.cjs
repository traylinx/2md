'use strict';
const assert=require('node:assert/strict'),https=require('node:https'),fs=require('node:fs'),net=require('node:net'),path=require('node:path'),os=require('node:os');
const {createAgentInputHost}=require('../../lib/browser/agentInputHost');
const {createBrowserMcpAgent}=require('../../lib/browser/mcpAgent');
const {Deadline}=require('../../lib/capture/deadline'),{createEgressProxy}=require('../../lib/capture/egressProxy');
const {createBrowserRuntime}=require('../../lib/browser/runtime'),{createCompletionSigner}=require('../../lib/browser/completionProof'),{AUDIENCE}=require('../../lib/browser/consent');
const {bound,owner,grant,privateKey}=require('./support.cjs'),c=require('../../lib/browser/contracts');
const origin='https://example.com',posted=[],passive=process.env.FIXTURE_PASSIVE==='1';
function delayed(content){return '<title>Just a moment</title><aside id="captcha-pending">Checking your browser. Verification in progress.</aside><main id="after-check" style="display:none">'+content+'</main><script>setTimeout(()=>{document.querySelector("#captcha-pending").remove();document.querySelector("#after-check").style.display="block";document.title="Owned fixture";},2200);</script>';}
function pageContent(content){return passive?delayed(content):content;}
const server=https.createServer({key:fs.readFileSync(process.env.FIXTURE_KEY),cert:fs.readFileSync(process.env.FIXTURE_CERT)},(req,res)=>{
 res.setHeader('Content-Type','text/html');res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Credentials','true');
 if(req.url==='/passive-stuck')return res.end('<title>Just a moment</title><main id="captcha-pending"><p>Checking your browser</p><label>Access value<input></label><button>Continue</button></main>');
 if(req.url==='/passive-failed')return res.end('<main id="captcha-pending">Verification failed</main>');
 if(req.url==='/passive-badge')return res.end('<h1>Ordinary page</h1><div class="captcha-badge">Privacy and terms</div><section hidden class="captcha"><p>Please complete the captcha</p><input type="checkbox" aria-label="I am not a robot"></section><input aria-label="Filter">');
 if(req.url==='/passive-navigation')return res.end('<title>Just a moment</title><p>Checking your browser</p><script>setTimeout(()=>location.href="/passive-badge",1500);</script>');
 if(req.url==='/passive-success')return res.end('<title>Just a moment</title><div class="captcha">Verification successful</div><h1>Owned completed check</h1>');
 if(req.url==='/background')return; // Delay headers: Chromium counts header receipt as network-idle completion.
 if(req.url==='/human-challenge')return res.end('<main id="captcha-challenge"><h1>Verify you are human</h1><p>Please complete the reCAPTCHA.</p><label>Access value<input></label><button>Continue</button></main>');
 if(req.method==='POST'){
  let body='';req.on('data',b=>{body+=b;if(body.length>8192)req.destroy();});return req.on('end',()=>{
   posted.push({path:req.url,body});
   if(req.url==='/stage-79'){
    const values=new URLSearchParams(body);assert.equal(values.get('phrase'),'SYNTHETIC_ACCESS');assert.equal(values.get('email'),'member@example.test');assert.equal(values.get('note'),'SYNTHETIC_NOTE');
    res.setHeader('Set-Cookie','access=owned; Secure; HttpOnly; SameSite=Strict');
    return res.end(pageContent(`<h1>Next step</h1><label>Verification value<input autocomplete="one-time-code" id="v"></label><div contenteditable="true" aria-label="Recovery phrase"></div><label>PIN<input id="p" type="text"></label><button id="go">Send verification</button><main></main><script>document.querySelector('#go').onclick=async()=>{const r=await fetch('https://api.example.com/data-42',{method:'POST',body:JSON.stringify({v:document.querySelector('#v').value,p:document.querySelector('#p').value,r:document.querySelector('[contenteditable]').textContent})});document.body.innerHTML=await r.text();}</script>`));
   }
   assert.equal(req.url,'/data-42');assert.deepEqual(JSON.parse(body),{v:'123456',p:'SYNTHETIC_PIN',r:'SYNTHETIC_RECOVERY'});
   return res.end('<main><h1>Owned organization</h1><p>Organization: Fixture team</p><p>Echoes: SYNTHETIC_ACCESS SYNTHETIC_NOTE member@example.test 123456 SYNTHETIC_PIN SYNTHETIC_RECOVERY</p><label>Filter<input aria-label="Filter" oninput="document.querySelector(\'output\').textContent=this.value"></label><output></output></main><script>void fetch("/background").catch(()=>{});</script>');
  });
 }
 if(passive)res.statusCode=403;
 res.end(pageContent('<h1>Beta access required</h1><form method="post" action="/stage-79"><label>Invitation code<input name="phrase"></label><label>Team email<input type="email" name="email"></label><label>Context<textarea name="note"></textarea></label><button>Continue</button></form><script>void fetch("/background").catch(()=>{});</script>'));
});
(async()=>{
 const lifetime=new Deadline(60000),tempRoot=fs.mkdtempSync(path.join(os.tmpdir(),'gb01-generic-owned-'));let runtime,proxy,releases=0;
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const g={...grant(),policyVersion:c.POLICY,hostKeyFingerprint:bound.hostKeyFingerprint,approvedByWorkspaceUserId:owner.workspaceUserId},nonces=new Set();
  runtime=createBrowserRuntime({privateEnabled:true,agentInputHosts:[bound.hostId],autoSweep:false,runtimeEpoch:'e1',tempRoot,executablePath:process.env.FIXTURE_CHROMIUM_WRAPPER,authorize:async()=>g,resolveCaller:async()=>bound,consumeNonce:async({nonce})=>{if(nonces.has(nonce))return false;nonces.add(nonce);return true;},lease:async()=>{
   proxy=createEgressProxy({deadline:lifetime,resolve:async value=>{const url=new URL(value);assert.ok([origin,'https://api.example.com'].includes(url.origin));return {url,addresses:[{address:'127.0.0.1',family:4}]};},connect:options=>net.connect({...options,port:server.address().port})});await new Promise(r=>proxy.server.listen(0,'127.0.0.1',r));return {proxyUrl:`http://127.0.0.1:${proxy.server.address().port}`,release:async()=>{releases++;await proxy.close();}};
  }});
  const caps=await runtime.service.call('get_browser_capabilities',{includeInputModes:true},bound);assert.ok(caps.inputModes.includes('observed_fields'));
  const opened=await runtime.manager.open(bound,{runtimeEpoch:'e1',actionId:'open1',mode:'login_read',url:origin,purpose:'Read owned organization'});assert.equal(opened.state,'succeeded',JSON.stringify(opened));const sessionId=opened.sessionId;
  const client={call:(name,input)=>runtime.service.call(name,input,bound),protectedCall:(name,input)=>{
   if(name==='input-agent-supply')return runtime.broker.supplyAgent(bound,input);
   if(name==='input-agent-prepare')return runtime.broker.prepareAgent(bound,input);
   if(name==='operation-inspect')return runtime.operations.inspect(bound,input.operationId);
   if(name==='operation-agent-complete')return runtime.operations.completeAgent(bound,input);
   throw Error('Unexpected protected call '+name);
  }};
  const agent=createBrowserMcpAgent({backend:createAgentInputHost({client}),agentInput:true});let decisions=0;
  const call=(name,input)=>agent.call({name,arguments:input});
  assert.equal((await call('get_browser_capabilities',{})).agentInputAvailable,true);
  async function step(actionId,labels,values,submit){
   const observed=await runtime.manager.query(bound,'browser_observe',{sessionId});
   const field=name=>{const f=observed.controls.find(x=>x.name===name);assert.ok(f,'Missing observed field '+name);return f.ref;};
   const selection={observationId:observed.observationId,fields:labels.map(label=>({ref:field(label),label})),...(submit?{submitRef:field(submit)}:{})};
   const supplied=await call('browser_credentials',{sessionId,origin,purpose:'Complete observed access step',...selection,values});
   assert.equal(supplied.state,'ready');assert.equal(supplied.inputUrl,undefined);
   const request={runtimeEpoch:'e1',sessionId,actionId,credentialRef:supplied.credentialRef,...selection};
   let result=await call('browser_authenticate',request);
   for(let n=0;['running','needs_input'].includes(result.state)&&n<60;n++){
    if(result.state==='needs_input'){
     const operation=await call('browser_respond',{operationId:result.output.interventionId});
     assert.equal(operation.origin,'https://api.example.com');assert.ok(['POST','OPTIONS'].includes(operation.method));decisions++;
     await call('browser_respond',{operationId:operation.operationId,decision:'approve',operationDigest:operation.operationDigest});
    }
    await new Promise(r=>setTimeout(r,50));result=await call('browser_action_status',{runtimeEpoch:'e1',sessionId,actionId});
   }
   assert.equal(result.state,'succeeded',JSON.stringify(result));assert.equal(result.output.state,submit?'form_submitted':'input_applied');
   assert.deepEqual(await call('browser_authenticate',request),result);await assert.rejects(runtime.broker.inspect(bound,supplied.credentialRef));
   return observed;
  }
  assert.ok((await step('access',['Invitation code','Team email','Context'],['SYNTHETIC_ACCESS','member@example.test','SYNTHETIC_NOTE'],'Continue')).warnings.includes('INVITATION_REQUIRED'));
  assert.equal(posted.length,1);
  assert.ok((await step('verify',['Verification value','Recovery phrase','PIN'],['123456','SYNTHETIC_RECOVERY','SYNTHETIC_PIN'],'Send verification')).warnings.includes('MFA_REQUIRED'));
  assert.equal(posted.length,2);assert.ok(decisions>=1);
  await step('fillonly',['Filter'],['1']);assert.equal(posted.length,2);
  const observed=await runtime.manager.query(bound,'browser_observe',{sessionId}),extracted=await runtime.manager.query(bound,'browser_extract',{sessionId});
  assert.ok(extracted.warnings.includes('NETWORK_NOT_IDLE'));
  assert.match(extracted.markdown,/Fixture team/);assert.equal(extracted.source.privacy,'private');assert.ok(extracted.evidence.length);
  assert.doesNotMatch(JSON.stringify({observed,extracted}),/SYNTHETIC_|123456|member@example.test/);
  // A real worker pre-input challenge must preserve the session and its reason.
  assert.equal((await call('browser_navigate',{runtimeEpoch:'e1',sessionId,actionId:'challenge-nav',target:{url:origin+'/human-challenge'}})).state,'succeeded');
  const challenge=await call('browser_observe',{sessionId});assert.ok(challenge.warnings.includes('CAPTCHA_REQUIRED'));
  const selection={observationId:challenge.observationId,fields:[{ref:challenge.controls.find(x=>x.name==='Access value').ref,label:'Access value'}],submitRef:challenge.controls.find(x=>x.name==='Continue').ref};
  const supplied=await call('browser_credentials',{sessionId,origin,purpose:'Owned pre-input challenge test',...selection,values:['SYNTHETIC_NEVER_SUBMITTED']});
  const challenged={runtimeEpoch:'e1',sessionId,actionId:'challenge-once',credentialRef:supplied.credentialRef,...selection};
  const stopped=await call('browser_authenticate',challenged);assert.equal(stopped.state,'failed');assert.equal(stopped.error,'HUMAN_REQUIRED');
  assert.deepEqual(await call('browser_action_status',{runtimeEpoch:'e1',sessionId,actionId:'challenge-once'}),stopped);
  assert.deepEqual(await call('browser_authenticate',challenged),stopped);assert.equal(posted.length,2);
  assert.ok((await call('browser_observe',{sessionId})).warnings.includes('CAPTCHA_REQUIRED'));
  assert.equal((await runtime.broker.inspect(bound,supplied.credentialRef)).sessionId,sessionId);
  if(passive){
   const navigate=async(actionId,url)=>assert.equal((await call('browser_navigate',{runtimeEpoch:'e1',sessionId,actionId,target:{url:origin+url}})).state,'succeeded');
   await navigate('stuck-nav','/passive-stuck');
   const stuck=await call('browser_observe',{sessionId});assert.equal(stuck.state,'loading');assert.ok(stuck.warnings.includes('VERIFICATION_PENDING'));assert.ok(!stuck.warnings.includes('CAPTCHA_REQUIRED'));
   const selection={observationId:stuck.observationId,fields:[{ref:stuck.controls.find(x=>x.name==='Access value').ref,label:'Access value'}],submitRef:stuck.controls.find(x=>x.name==='Continue').ref};
   const secret=await call('browser_credentials',{sessionId,origin,purpose:'Owned passive pre-input test',...selection,values:['SYNTHETIC_NOT_SUBMITTED']});
   const request={runtimeEpoch:'e1',sessionId,actionId:'pending-once',credentialRef:secret.credentialRef,...selection};
   let receipt=await call('browser_authenticate',request);
   for(let i=0;receipt.state==='running'&&i<200;i++){await new Promise(r=>setTimeout(r,50));receipt=await call('browser_action_status',{runtimeEpoch:'e1',sessionId,actionId:'pending-once'});}
   assert.equal(receipt.state,'failed');assert.equal(receipt.error,'VERIFICATION_PENDING');assert.deepEqual(await call('browser_authenticate',request),receipt);assert.equal(posted.length,2);assert.equal((await runtime.broker.inspect(bound,secret.credentialRef)).sessionId,sessionId);
   await navigate('failed-nav','/passive-failed');const failure=await call('browser_extract',{sessionId});assert.equal(failure.quality,'blocked');assert.ok(failure.warnings.includes('VERIFICATION_FAILED'));
   await navigate('badge-nav','/passive-badge');const badge=await call('browser_observe',{sessionId});assert.equal(badge.state,'ready');assert.ok(!badge.warnings.includes('CAPTCHA_REQUIRED'));assert.ok(!badge.warnings.includes('VERIFICATION_PENDING'));
   await navigate('success-nav','/passive-success');assert.equal((await call('browser_observe',{sessionId})).state,'ready');
   await navigate('auto-nav','/passive-navigation');const fresh=await call('browser_extract',{sessionId});assert.match(fresh.markdown,/Ordinary page/);assert.doesNotMatch(fresh.markdown,/Checking your browser/);assert.ok(!fresh.warnings.includes('VERIFICATION_PENDING'));assert.equal(posted.length,2);
   console.log('PASS passive: 403 interstitial and post-submission check finish automatically; stale content not extracted; bounded pending retains session/ref and receipt without POST replay; explicit failure not human-required; badge/hidden challenge not blocking; document navigation recovers.');
  }
  await runtime.manager.close(bound,sessionId);assert.equal(releases,1);assert.equal(runtime.manager.diagnostics().active,0);assert.deepEqual(fs.readdirSync(tempRoot),[]);
  console.log('PASS: bounded non-idle open/auth/fill, human challenge preserved through real IPC with inspectable session, no challenge submission or replay; opted-in MCP no pairing/re-entry, agent-authorized cross-origin decision, actual worker/Chromium generic native invitation + textarea, SPA one-time-code + contenteditable + text PIN, fill without submission, agent-provenance field-bound input/IPC, no duplicate POST, all-value redaction and cleanup. No site recipe or production credentials.');
 }finally{await runtime?.stop();await proxy?.close();lifetime.close();server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(tempRoot,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
