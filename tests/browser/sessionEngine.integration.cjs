'use strict';
const assert=require('node:assert/strict'),https=require('node:https'),fs=require('node:fs'),net=require('node:net');
const puppeteer=require('puppeteer');
const {Deadline}=require('../../lib/capture/deadline');
const {createEgressProxy}=require('../../lib/capture/egressProxy');
const {createPublicSession}=require('../../lib/browser/publicSession');
const c=require('../../lib/browser/contracts');
const origin='https://site.example.org';let gets=0,posts=0,consumed=0;
const server=https.createServer({key:fs.readFileSync(process.env.FIXTURE_KEY),cert:fs.readFileSync(process.env.FIXTURE_CERT)},(req,res)=>{
 res.setHeader('Content-Type','text/html');if(req.method==='POST'){posts++;return res.end('<h1>Owned organization</h1><p>Membership is active and these are the current account details.</p><p>Echo: SYNTHETIC_PASSWORD_ONLY</p><table><tr><th>Plan</th><th>Price</th></tr><tr><td>Owned plan</td><td>11</td></tr></table>');}
 gets++;res.end('<h1>Sign in</h1><form method="post" action="/account"><label>Username<input name="user"></label><label>Password<input type="password" name="password"></label><button>Log in</button></form>');
});
(async()=>{
 const lifetime=new Deadline(25000);let proxy,browser,engine;
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const resolve=async value=>{const url=new URL(value);assert.equal(url.origin,origin);return {url,addresses:[{address:'127.0.0.1',family:4}]};};
 try{
 proxy=createEgressProxy({deadline:lifetime,resolve,connect:options=>net.connect({...options,port:server.address().port})});await new Promise(r=>proxy.server.listen(0,'127.0.0.1',r));
 browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH,headless:true,pipe:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-quic','--ignore-certificate-errors',`--proxy-server=http://127.0.0.1:${proxy.server.address().port}`,'--proxy-bypass-list=<-loopback>','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
 engine=await createPublicSession(browser,{sessionId:'s1',url:origin,mode:'login_read',limits:c.LIMITS,navigation:{mode:'origins',origins:[origin]}},lifetime,{resolve,protectedInput:{
 verifyDecision:async(proof,record)=>proof==='owned-verified'?record:null,
 getAuthDecision:async request=>({proof:'owned-verified',decision:{sessionId:'s1',operationId:request.actionId,operationDigest:c.digest(request),recipients:[origin]},recipients:[origin]}),
 credentialAccess:async(binding,use)=>{assert.equal(binding.credentialRef,'owned-ref');assert.equal(consumed++,0);const secret={username:Buffer.from('owned'),password:Buffer.from('SYNTHETIC_PASSWORD_ONLY')};try{return await use(secret);}finally{Object.values(secret).forEach(b=>b.fill(0));}}
 }});
 const observed=await engine.execute('browser_observe',{sessionId:'s1'},lifetime);assert.equal(observed.state,'access_required');
 const ref=name=>observed.controls.find(x=>x.name===name).ref;
 const result=await engine.execute('browser_authenticate',{sessionId:'s1',runtimeEpoch:'e1',actionId:'a1',observationId:observed.observationId,credentialRef:'owned-ref',fields:{usernameRef:ref('Username'),passwordRef:ref('Password')},submitRef:ref('Log in')},lifetime);
 assert.equal(result.state,'login_submitted');const before={gets,posts};
 const extracted=await engine.execute('browser_extract',{sessionId:'s1'},lifetime);assert.equal(extracted.source.privacy,'private');assert.match(extracted.markdown,/Owned organization/);assert.doesNotMatch(JSON.stringify(extracted),/SYNTHETIC_PASSWORD_ONLY/);assert.ok(extracted.evidence.length>0);
 const after=await engine.execute('browser_observe',{sessionId:'s1'},lifetime);assert.equal(after.source.privacy,'private');assert.doesNotMatch(JSON.stringify(after),/SYNTHETIC_PASSWORD_ONLY/);assert.deepEqual({gets,posts},before);assert.equal(posts,1);
 console.log('PASS: full session engine observe -> opaque-ref login -> private extraction/evidence; password echo redacted, no refetch or second login');
 }finally{await engine?.close();await browser?.close();await proxy?.close();lifetime.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
