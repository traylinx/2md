'use strict';
const assert=require('node:assert/strict'),https=require('node:https'),fs=require('node:fs'),net=require('node:net'),path=require('node:path'),os=require('node:os');
const {sign}=require('node:crypto');
const {Deadline}=require('../../lib/capture/deadline');
const {createEgressProxy}=require('../../lib/capture/egressProxy');
const {createBrowserRuntime}=require('../../lib/browser/runtime');
const {createCompletionSigner}=require('../../lib/browser/completionProof');
const {AUDIENCE}=require('../../lib/browser/consent');
const {bound,owner,grant,privateKey}=require('./support.cjs');
const c=require('../../lib/browser/contracts');
const origin='https://example.com';let posts=0,body='',messageReads=0;
const messages=['Message 5: latest synthetic update','Message 4: synthetic schedule','Message 3: synthetic proposal','Message 2: synthetic receipt','Message 1: earliest synthetic note'];
const server=https.createServer({key:fs.readFileSync(process.env.FIXTURE_KEY),cert:fs.readFileSync(process.env.FIXTURE_CERT)},(req,res)=>{
 res.setHeader('Content-Type','text/html');
 if(req.url.startsWith('/messages')){
  if(!req.headers.cookie?.includes('owned_session=fixture')){res.statusCode=401;return res.end('Login required');}
  messageReads++;const second=req.url==='/messages?page=2';
  return res.end('<main><h1>Inbox for owned@example.test</h1><ol>'+messages.slice(second?3:0,second?5:3).map(m=>'<li>'+m+'</li>').join('')+'</ol><p hidden>HIDDEN_MESSAGE</p>'+(second?'':'<a href="/messages?page=2">Older messages</a>')+'</main>');
 }
 if(req.method==='POST'){res.setHeader('Set-Cookie','owned_session=fixture; Secure; HttpOnly; SameSite=Strict');posts++;req.on('data',b=>{body+=b;});return req.on('end',()=>res.end('<aside>OUTSIDE_REGION</aside><main><h1>Owned organization</h1><p>Private membership details. Echo: SYNTHETIC_WORKER_PASSWORD</p><a href="/messages">Messages</a><p hidden>HIDDEN_REGION</p><input value="INPUT_REGION"></main>'));}
 res.end('<h1>Login</h1><form method="post" action="/account"><label>Username<input name="username"></label><label>Password<input type="password" name="password"></label><button>Log in</button></form>');
});
(async()=>{
 const lifetime=new Deadline(process.env.FIXTURE_RPC==='1'?240000:45000),tempRoot=fs.mkdtempSync(path.join(os.tmpdir(),'gb01-worker-owned-'));let runtime,proxy,leases=0,releases=0;
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
 const g={...grant(),policyVersion:c.POLICY,hostKeyFingerprint:bound.hostKeyFingerprint,approvedByWorkspaceUserId:owner.workspaceUserId};const nonces=new Set();
 runtime=createBrowserRuntime({privateEnabled:true,pairingOrigin:'https://traylinx.example.org',resolveHuman:async({authorization})=>{if(authorization!=='Bearer owned-human-fixture')c.deny('FORBIDDEN');return owner;},autoSweep:false,runtimeEpoch:'e1',tempRoot,executablePath:process.env.FIXTURE_CHROMIUM_WRAPPER,
 authorize:async()=>g,resolveCaller:async()=>bound,consumeNonce:async({nonce})=>{if(nonces.has(nonce))return false;nonces.add(nonce);return true;},
 lease:async()=>{leases++;proxy=createEgressProxy({deadline:lifetime,resolve:async value=>{const url=new URL(value);assert.equal(url.origin,origin);return {url,addresses:[{address:'127.0.0.1',family:4}]};},connect:options=>net.connect({...options,port:server.address().port})});await new Promise(r=>proxy.server.listen(0,'127.0.0.1',r));return {proxyUrl:`http://127.0.0.1:${proxy.server.address().port}`,release:async()=>{releases++;await proxy.close();}};},
 });
 if(process.env.FIXTURE_RPC==='1'){await require('./privateClientBridge.cjs').servePrivateClient(runtime,g);return;}
 const opened=await runtime.manager.open(bound,{runtimeEpoch:'e1',actionId:'open1',mode:'login_read',url:origin,purpose:'Owned synthetic account'});assert.equal(opened.state,'succeeded',JSON.stringify(opened));
 const sessionId=opened.sessionId,observed=await runtime.manager.query(bound,'browser_observe',{sessionId});const ref=name=>observed.controls.find(x=>x.name===name).ref;
 const pending=await runtime.broker.request({bound,input:{sessionId,origin,purpose:'Owned synthetic account'}}),record=await runtime.broker.inspect(bound,pending.interventionId);
 const signer=createCompletionSigner({bound,grantId:g.grantId,privateKey,verifyOwner:async()=>owner});
 await runtime.broker.supply(bound,{interventionId:record.interventionId,username:'owned',password:'SYNTHETIC_WORKER_PASSWORD',proof:await signer(record,{})});
 const request={runtimeEpoch:'e1',sessionId,actionId:'login1',observationId:observed.observationId,credentialRef:record.interventionId,fields:{usernameRef:ref('Username'),passwordRef:ref('Password')},submitRef:ref('Log in')};
 const decision={sessionId,operationId:'login1',operationDigest:c.digest(request),recipients:[origin],expiresAt:Date.now()+30000,nonce:'auth1'};
 const payload=Buffer.from(JSON.stringify({version:1,audience:AUDIENCE,grantId:g.grantId,principalScope:c.scope(bound),hostId:bound.hostId,...decision,issuedAt:Date.now()})).toString('base64url');
 await runtime.broker.prepare(bound,{request,decision,recipients:[origin],proof:payload+'.'+sign(null,Buffer.from(AUDIENCE+'.'+payload),privateKey).toString('base64url')});
 const login=await runtime.manager.execute(bound,'browser_authenticate',request);assert.equal(login.state,'succeeded',JSON.stringify(login));assert.equal(login.output.state,'login_submitted');
 assert.deepEqual(await runtime.manager.execute(bound,'browser_authenticate',request),login);assert.equal(posts,1);assert.equal(new URLSearchParams(body).get('password'),'SYNTHETIC_WORKER_PASSWORD');
 const extracted=await runtime.manager.query(bound,'browser_extract',{sessionId});assert.equal(extracted.source.privacy,'private');assert.match(extracted.markdown,/Owned organization/);assert.doesNotMatch(JSON.stringify(extracted),/SYNTHETIC_WORKER_PASSWORD/);assert.equal(posts,1);
 const snapshot=await runtime.manager.query(bound,'browser_observe',{sessionId});const regionRef=snapshot.regions.find(r=>r.role==='main').ref;
 const region=await runtime.manager.query(bound,'browser_extract',{sessionId,regionRef});assert.match(region.markdown,/Owned organization/);assert.doesNotMatch(region.markdown,/OUTSIDE_REGION|HIDDEN_REGION|INPUT_REGION|SYNTHETIC_WORKER_PASSWORD/);assert.equal(region.source.privacy,'private');assert.equal(posts,1);
 // Discover links from observations, retain the same private cookie session.
 let messageText='';
 for(const [index,label] of ['Messages','Older messages'].entries()){
  const view=await runtime.manager.query(bound,'browser_observe',{sessionId});
  const link=view.links.find(l=>l.name===label);assert.ok(link,JSON.stringify(view.links));
  const action={runtimeEpoch:'e1',sessionId,actionId:'messages'+index,observationId:view.observationId,action:{type:'click',ref:link.ref}};
  const receipt=await runtime.manager.execute(bound,'browser_act',action);assert.equal(receipt.state,'succeeded',JSON.stringify(receipt));
  assert.deepEqual(await runtime.manager.execute(bound,'browser_act',action),receipt);
  const evidence=await runtime.manager.query(bound,'browser_extract',{sessionId});
  assert.equal(evidence.source.privacy,'private');assert.match(evidence.markdown,/Inbox for owned@example.test/);
  assert.doesNotMatch(evidence.markdown,/HIDDEN_MESSAGE|SYNTHETIC_WORKER_PASSWORD/);
  assert.match(JSON.stringify(evidence.source),/messages/);messageText+='\n'+evidence.markdown;
 }
 assert.equal(messageReads,2);assert.equal(posts,1);
 let previous=-1;for(const message of messages){const at=messageText.indexOf(message);assert.ok(at>previous);previous=at;}
 await runtime.manager.close(bound,sessionId);assert.equal(leases,1);assert.equal(releases,1);assert.deepEqual(fs.readdirSync(tempRoot),[]);assert.equal(runtime.manager.diagnostics().active,0);
 await assert.rejects(runtime.broker.inspect(bound,record.interventionId));
 console.log('PASS: real forked browser-worker + Chromium + signed completion/consent + private IPC; one login, private redacted extraction, receipt replay without resubmit, region-scoped extraction, cookie-bound two-page five-message ordering/account/source fidelity without refetch, profile and proxy cleanup');
 }finally{await runtime?.stop();await proxy?.close();lifetime.close();server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(tempRoot,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
