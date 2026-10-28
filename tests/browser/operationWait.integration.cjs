'use strict';
const assert=require('node:assert/strict'),https=require('node:https'),fs=require('node:fs'),net=require('node:net');
const puppeteer=require('puppeteer');
const {Deadline}=require('../../lib/capture/deadline');
const {createEgressProxy}=require('../../lib/capture/egressProxy');
const {createPublicSession}=require('../../lib/browser/publicSession');
const c=require('../../lib/browser/contracts');
const {ActionDeadline}=require('../../lib/browser/actionDeadline');
const origin='https://site.example.org';let posts=0,approved=false,decisions=0;
const server=https.createServer({key:fs.readFileSync(process.env.FIXTURE_KEY),cert:fs.readFileSync(process.env.FIXTURE_CERT)},(req,res)=>{
 res.setHeader('Content-Type','text/html');
 if(req.method==='POST'){posts++;assert.equal(approved,true);return res.end('Owned loaded content');}
 res.end('<h1 id="result">Loading</h1><script>fetch("/data",{method:"POST",body:"owned fixture"}).then(r=>r.text()).then(t=>document.getElementById("result").textContent=t)</script>');
});
(async()=>{
 const lifetime=new Deadline(25000);let proxy,browser,engine,action;
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const resolve=async value=>{const url=new URL(value);assert.equal(url.origin,origin);return {url,addresses:[{address:'127.0.0.1',family:4}]};};
 try{
 proxy=createEgressProxy({deadline:lifetime,resolve,connect:options=>net.connect({...options,port:server.address().port})});await new Promise(r=>proxy.server.listen(0,'127.0.0.1',r));
 browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH,headless:true,pipe:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-quic','--ignore-certificate-errors',`--proxy-server=http://127.0.0.1:${proxy.server.address().port}`,'--proxy-bypass-list=<-loopback>','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
 action=new ActionDeadline(3000,lifetime.signal);
 const started=Date.now();
 engine=await action.run(()=>createPublicSession(browser,{sessionId:'s1',url:origin,mode:'public',limits:c.LIMITS,navigation:{mode:'public_https'}},lifetime,{resolve,initialDeadline:action,protectedInput:{
  verifyDecision:async(proof,record)=>proof==='fixture-signed'?record:null,
  requestDecision:async record=>{
   decisions++;assert.equal(record.method,'POST');assert.equal(record.reason,'operation');assert.doesNotMatch(JSON.stringify(record),/owned fixture/);
   action.pause(record.operationId);
   try{await new Promise(r=>setTimeout(r,6000));assert.equal(posts,0);approved=true;return 'fixture-signed';}
   finally{action.resume(record.operationId);}
  },
 }}));
 assert.ok(Date.now()-started>=6000);assert.equal(decisions,1);assert.equal(posts,1);
 const extracted=await engine.execute('browser_extract',{sessionId:'s1'},lifetime);assert.match(extracted.markdown,/Owned loaded content/);assert.equal(extracted.source.privacy,'public');assert.equal(posts,1);
 console.log('PASS: initial public page POST held for six-second owner wait with three-second active budget; one transmission after approval; loaded content extracted');
 }finally{action?.close();await engine?.close();await browser?.close();await proxy?.close();lifetime.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
