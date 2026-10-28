'use strict';
const assert=require('node:assert/strict'),https=require('node:https'),fs=require('node:fs'),net=require('node:net');
const puppeteer=require('puppeteer');
const {Deadline}=require('../../lib/capture/deadline');
const {createEgressProxy}=require('../../lib/capture/egressProxy');
const {createPublicSession}=require('../../lib/browser/publicSession');
const c=require('../../lib/browser/contracts');
const origin='https://site.example.org';let gets=0,posts=0;const submissions=[];
const {createRemoteInput}=require('../../lib/browser/remoteInput');
const {bound}=require('./support.cjs');
const broker=createRemoteInput({describeSession:async()=>({mode:'login_read',ownerId:'owner1',expiresAt:Date.now()+60000}),verifyCompletion:async()=>true,verifyDecision:async(_proof,_bound,record)=>record});
const server=https.createServer({key:fs.readFileSync(process.env.FIXTURE_KEY),cert:fs.readFileSync(process.env.FIXTURE_CERT)},(req,res)=>{
 res.setHeader('Content-Type','text/html');if(req.method==='POST'){let body='';req.on('data',chunk=>{body+=chunk;});req.on('end',()=>submissions.push({url:req.url,body}));posts++;if(req.url==='/password')return res.end('<h1>Enter password</h1><form method="post" action="/account"><label>Password<input type="password" name="password"></label><button>Log in</button></form>');return res.end('<h1>Owned organization</h1><p>Membership is active and these are the current account details.</p><p>Echo: SYNTHETIC_PASSWORD_ONLY</p><table><tr><th>Plan</th><th>Price</th></tr><tr><td>Owned plan</td><td>11</td></tr></table>');}
 gets++;res.end('<h1>Sign in</h1><form method="post" action="/password"><label>Username<input name="user"></label><button>Continue</button></form>');
});
(async()=>{
 const lifetime=new Deadline(25000);let proxy,browser,engine;
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const resolve=async value=>{const url=new URL(value);assert.equal(url.origin,origin);return {url,addresses:[{address:'127.0.0.1',family:4}]};};
 try{
 proxy=createEgressProxy({deadline:lifetime,resolve,connect:options=>net.connect({...options,port:server.address().port})});await new Promise(r=>proxy.server.listen(0,'127.0.0.1',r));
 browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH,headless:true,pipe:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-quic','--ignore-certificate-errors',`--proxy-server=http://127.0.0.1:${proxy.server.address().port}`,'--proxy-bypass-list=<-loopback>','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
 const entry=await broker.request({bound,input:{sessionId:'s1',origin,purpose:'Read account'}});const credentialRef=entry.interventionId;
 await broker.supply(bound,{interventionId:credentialRef,username:'owned',password:'SYNTHETIC_PASSWORD_ONLY',proof:'fixture'});
 const provider=broker.provider(bound);
 engine=await createPublicSession(browser,{sessionId:'s1',url:origin,mode:'login_read',limits:c.LIMITS,navigation:{mode:'origins',origins:[origin]}},lifetime,{resolve,protectedInput:provider});
 async function authenticate(request){
  const decision={sessionId:'s1',operationId:request.actionId,operationDigest:c.digest(request),recipients:[origin],expiresAt:Date.now()+30000,nonce:request.actionId};
  await broker.prepare(bound,{request,proof:'fixture',decision,recipients:[origin]});
  return engine.execute('browser_authenticate',request,lifetime);
 }
 const observed=await engine.execute('browser_observe',{sessionId:'s1'},lifetime);assert.ok(observed.controls.length>0);
 const ref=name=>observed.controls.find(x=>x.name===name).ref;
 const first=await authenticate({sessionId:'s1',runtimeEpoch:'e1',actionId:'a1',observationId:observed.observationId,credentialRef,fields:{usernameRef:ref('Username')},submitRef:ref('Continue')});
 assert.equal(first.state,'login_submitted');
 const passwordPage=await engine.execute('browser_observe',{sessionId:'s1'},lifetime);
 assert.equal(passwordPage.source.privacy,'private');
 const secondRef=name=>passwordPage.controls.find(x=>x.name===name).ref;
 const result=await authenticate({sessionId:'s1',runtimeEpoch:'e1',actionId:'a2',observationId:passwordPage.observationId,credentialRef,fields:{passwordRef:secondRef('Password')},submitRef:secondRef('Log in')});
 assert.equal(result.state,'login_submitted');const before={gets,posts};
 const extracted=await engine.execute('browser_extract',{sessionId:'s1'},lifetime);assert.equal(extracted.source.privacy,'private');assert.match(extracted.markdown,/Owned organization/);assert.doesNotMatch(JSON.stringify(extracted),/SYNTHETIC_PASSWORD_ONLY/);assert.ok(extracted.evidence.length>0);
 const after=await engine.execute('browser_observe',{sessionId:'s1'},lifetime);assert.equal(after.source.privacy,'private');assert.doesNotMatch(JSON.stringify(after),/SYNTHETIC_PASSWORD_ONLY/);assert.deepEqual({gets,posts},before);assert.equal(posts,2);assert.deepEqual(submissions.map(x=>x.url),['/password','/account']);assert.equal(new URLSearchParams(submissions[0].body).get('user'),'owned');assert.doesNotMatch(submissions[0].body,/SYNTHETIC_PASSWORD_ONLY|password=/);assert.equal(new URLSearchParams(submissions[1].body).get('password'),'SYNTHETIC_PASSWORD_ONLY');
 console.log('PASS: email-first broker -> username submit -> password submit -> private extraction/evidence; password echo redacted, no refetch or second login');
 }finally{broker.close();await engine?.close();await browser?.close();await proxy?.close();lifetime.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
