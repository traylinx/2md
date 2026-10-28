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
const origin='https://example.com',apiOrigin='https://api.example.com';let bootstrap=0,logins=0,reads=0,dataPosts=0;const submissions=[];
const server=https.createServer({key:fs.readFileSync(process.env.FIXTURE_KEY),cert:fs.readFileSync(process.env.FIXTURE_CERT)},(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin',origin);
 if(req.headers.host==='api.example.com'){
  res.setHeader('Content-Type','application/json');
  if(req.method==='POST'&&req.url==='/query'){dataPosts++;req.resume();return res.end(JSON.stringify({items:['Filtered notice']}));}
  if(req.method==='POST'){logins++;let body='';req.on('data',b=>body+=b);return req.on('end',()=>{submissions.push(JSON.parse(body));res.end(JSON.stringify({account:'owned@example.test',items:['Newest notice','Second notice','Third notice']}));});}
  reads++;assert.equal(logins,1);return res.end(JSON.stringify({items:['Fourth notice','Fifth notice']}));
 }
 if(req.method==='POST'){bootstrap++;let body='';req.on('data',b=>body+=b);return req.on('end',()=>{submissions.push(JSON.parse(body));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({next:true}));});}
 res.setHeader('Content-Type','text/html');res.end(`<!doctype html><main><h1>Workspace access</h1><label>Work email<input type="email" id="identity"></label><button type="button" id="advance">Continue</button></main>
 <script>
 document.querySelector('#advance').onclick=async()=>{await fetch('/bootstrap',{method:'POST',body:JSON.stringify({user:document.querySelector('#identity').value})});document.querySelector('main').innerHTML='<h1>Complete access</h1><label>Access phrase<input id="phrase" type="password"></label><button id="unlock" type="button">Unlock workspace</button>';document.querySelector('#unlock').onclick=async()=>{const data=await (await fetch('https://api.example.com/session',{method:'POST',body:JSON.stringify({password:document.querySelector('#phrase').value})})).json();document.querySelector('main').innerHTML='<h1>Inbox for '+data.account+'</h1><ol>'+data.items.map(x=>'<li>'+x+'</li>').join('')+'</ol><button type="button" id="older">Older notices</button><button type="button" id="filter">Filter notices</button>';document.querySelector('#filter').onclick=async()=>{const data=await(await fetch('https://api.example.com/query',{method:'POST',body:JSON.stringify({filter:'recent'})})).json();document.querySelector('ol').innerHTML=data.items.map(x=>'<li>'+x+'</li>').join('');};document.querySelector('#older').onclick=async()=>{const data=await(await fetch('https://api.example.com/notices?page=2')).json();document.querySelector('ol').innerHTML=data.items.map(x=>'<li>'+x+'</li>').join('');};};};
 </script>`);
});
(async()=>{
 const lifetime=new Deadline(45000),tempRoot=fs.mkdtempSync(path.join(os.tmpdir(),'gb01-worker-owned-'));let runtime,proxy,leases=0,releases=0;
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
 const g={...grant(),policyVersion:c.POLICY,hostKeyFingerprint:bound.hostKeyFingerprint,approvedByWorkspaceUserId:owner.workspaceUserId};const nonces=new Set();
 runtime=createBrowserRuntime({privateEnabled:true,pairingOrigin:'https://traylinx.example.org',resolveHuman:async({authorization})=>{if(authorization!=='Bearer owned-human-fixture')c.deny('FORBIDDEN');return owner;},autoSweep:false,runtimeEpoch:'e1',tempRoot,executablePath:process.env.FIXTURE_CHROMIUM_WRAPPER,
 authorize:async()=>g,resolveCaller:async()=>bound,consumeNonce:async({nonce})=>{if(nonces.has(nonce))return false;nonces.add(nonce);return true;},
 lease:async()=>{leases++;proxy=createEgressProxy({deadline:lifetime,resolve:async value=>{const url=new URL(value);assert.ok([origin,apiOrigin].includes(url.origin));return {url,addresses:[{address:'127.0.0.1',family:4}]};},connect:options=>net.connect({...options,port:server.address().port})});await new Promise(r=>proxy.server.listen(0,'127.0.0.1',r));return {proxyUrl:`http://127.0.0.1:${proxy.server.address().port}`,release:async()=>{releases++;await proxy.close();}};},
 });
 const opened=await runtime.manager.open(bound,{runtimeEpoch:'e1',actionId:'open1',mode:'login_read',url:origin,purpose:'Read owned SPA notices'});assert.equal(opened.state,'succeeded',JSON.stringify(opened));
 const sessionId=opened.sessionId,pending=await runtime.broker.request({bound,input:{sessionId,origin,purpose:'Read owned SPA notices'}}),record=await runtime.broker.inspect(bound,pending.interventionId);
 const signer=createCompletionSigner({bound,grantId:g.grantId,privateKey,verifyOwner:async()=>owner});
 await runtime.broker.supply(bound,{interventionId:record.interventionId,username:'owned',password:'SYNTHETIC_WORKER_PASSWORD',proof:await signer(record,{})});
 function proof(decision){const payload=Buffer.from(JSON.stringify({version:1,audience:AUDIENCE,grantId:g.grantId,principalScope:c.scope(bound),hostId:bound.hostId,...decision,issuedAt:Date.now()})).toString('base64url');return payload+'.'+sign(null,Buffer.from(AUDIENCE+'.'+payload),privateKey).toString('base64url');}
 async function auth(actionId,field,label,button){
  const observation=await runtime.manager.query(bound,'browser_observe',{sessionId});const ref=name=>observation.controls.find(x=>x.name===name).ref;
  const request={runtimeEpoch:'e1',sessionId,actionId,observationId:observation.observationId,credentialRef:record.interventionId,fields:{[field]:ref(label)},submitRef:ref(button)};
  const decision={sessionId,operationId:actionId,operationDigest:c.digest(request),recipients:[origin],expiresAt:Date.now()+30000,nonce:actionId};
  await runtime.broker.prepare(bound,{request,decision,recipients:[origin],proof:proof(decision)});return runtime.manager.execute(bound,'browser_authenticate',request);
 }
 const first=await auth('username','usernameRef','Work email','Continue');assert.equal(first.state,'succeeded',JSON.stringify(first));assert.equal(bootstrap,1);assert.deepEqual(submissions[0],{user:'owned'});
 const second=await auth('password','passwordRef','Access phrase','Unlock workspace');assert.equal(second.state,'needs_input',JSON.stringify(second));assert.equal(second.output.reason,'recipient_consent');assert.equal(logins,0);
 const operation=await runtime.operations.inspect(bound,second.output.interventionId);assert.equal(operation.origin,apiOrigin);assert.equal(operation.method,'POST');assert.doesNotMatch(JSON.stringify(operation),/SYNTHETIC_WORKER_PASSWORD/);
 const decision=Object.fromEntries(Object.keys(require('../../lib/browser/operationBroker').decisionSchema.properties).map(key=>[key,operation[key]]));
 await runtime.operations.complete(bound,{operationId:operation.operationId,proof:proof(decision)});
 let result;for(let i=0;i<150;i++){result=await runtime.manager.status(bound,{runtimeEpoch:'e1',sessionId,actionId:'password'});if(!['running','needs_input'].includes(result.state))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(result.state,'succeeded',JSON.stringify(result));assert.equal(result.output.state,'login_submitted');assert.equal(logins,1);assert.deepEqual(submissions[1],{password:'SYNTHETIC_WORKER_PASSWORD'});
 let content=await runtime.manager.query(bound,'browser_extract',{sessionId});assert.equal(content.source.privacy,'private');assert.match(content.markdown,/owned@example.test/);assert.match(content.markdown,/Newest notice[\s\S]*Third notice/);assert.doesNotMatch(JSON.stringify(content),/SYNTHETIC_WORKER_PASSWORD/);
 const observed=await runtime.manager.query(bound,'browser_observe',{sessionId});const pagination=await runtime.manager.execute(bound,'browser_act',{runtimeEpoch:'e1',sessionId,actionId:'older',observationId:observed.observationId,action:{type:'click',ref:observed.controls.find(x=>x.name==='Older notices').ref}});assert.equal(pagination.state,'succeeded',JSON.stringify(pagination));
 content=await runtime.manager.query(bound,'browser_extract',{sessionId});assert.match(content.markdown,/Fourth notice[\s\S]*Fifth notice/);assert.equal(reads,1);assert.equal(logins,1);assert.equal(bootstrap,1);
 const filteredView=await runtime.manager.query(bound,'browser_observe',{sessionId});
 const filtered=await runtime.manager.execute(bound,'browser_act',{runtimeEpoch:'e1',sessionId,actionId:'filter',observationId:filteredView.observationId,action:{type:'click',ref:filteredView.controls.find(x=>x.name==='Filter notices').ref}});
 assert.equal(filtered.state,'needs_input',JSON.stringify(filtered));assert.equal(filtered.output.reason,'operation_consent');assert.equal(dataPosts,0);
 const opaque=await runtime.operations.inspect(bound,filtered.output.interventionId);assert.equal(opaque.reason,'operation');assert.equal(opaque.origin,apiOrigin);assert.equal(opaque.method,'POST');assert.doesNotMatch(JSON.stringify(opaque),/recent/);
 const exact=Object.fromEntries(Object.keys(require('../../lib/browser/operationBroker').decisionSchema.properties).map(key=>[key,opaque[key]]));
 await runtime.operations.complete(bound,{operationId:opaque.operationId,proof:proof(exact)});
 let final;for(let i=0;i<150;i++){final=await runtime.manager.status(bound,{runtimeEpoch:'e1',sessionId,actionId:'filter'});if(!['running','needs_input'].includes(final.state))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(final.state,'succeeded',JSON.stringify(final));assert.equal(dataPosts,1);assert.equal(logins,1);
 assert.match((await runtime.manager.query(bound,'browser_extract',{sessionId})).markdown,/Filtered notice/);
 await runtime.manager.close(bound,sessionId);assert.equal(releases,1);assert.deepEqual(fs.readdirSync(tempRoot),[]);
 console.log('PASS: real worker form-less email-first SPA, bootstrap without password, unknown API POST withheld until exact signed recipient approval, one login, same-recipient GET pagination without repeat consent, separate exact consent for unknown authenticated data POST, private evidence and cleanup');
 }finally{await runtime?.stop();await proxy?.close();lifetime.close();server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(tempRoot,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
