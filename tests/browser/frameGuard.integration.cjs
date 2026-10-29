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
 const lifetime=new Deadline(30000);let browser,proxy,guard;
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const resolve=async value=>{const url=new URL(value);if(!origins.includes(url.origin))c.deny('TARGET_DENIED');return {url,addresses:[{address:'127.0.0.1',family:4}]};};
 try{proxy=createEgressProxy({deadline:lifetime,resolve,connect:options=>net.connect({...options,port:server.address().port})});await new Promise(r=>proxy.server.listen(0,'127.0.0.1',r));
 browser=await require('puppeteer').launch({executablePath:process.env.FIXTURE_CHROMIUM_WRAPPER,headless:true,pipe:true,args:['--no-sandbox','--disable-dev-shm-usage',`--proxy-server=http://127.0.0.1:${proxy.server.address().port}`,'--proxy-bypass-list=<-loopback>']});
 const page=await browser.newPage(),policy=require('../../lib/browser/networkPolicy').createSessionNetwork({sessionId:'owned',limits:c.LIMITS,navigation:{mode:'public_https'},lifetime,resolve,drainPublic:()=>guard.drainPublic()});
 guard=await require('../../lib/browser/browserGuard').applySessionGuard(page,browser,policy,lifetime,{embeddedFrames:true,onFailure:error=>console.error('OWNED guard failure',error)});
 await page.goto(origins[0],{waitUntil:'networkidle0',timeout:15000});assert.equal(page.frames().length,3);assert.equal(posts.length,0);assert.equal(lifetime.signal.aborted,false);console.log('PASS nested guard',requests);
 }finally{await guard?.close();await browser?.close();await proxy?.close();lifetime.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
