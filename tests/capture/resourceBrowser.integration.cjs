'use strict';
// Owned cross-origin fixture only. Run with --network=none; resolver/CA exceptions
// below are test-only and are never wired into the production entrypoint.
const assert=require('node:assert/strict'),https=require('node:https'),fs=require('node:fs'),net=require('node:net');
const puppeteer=require('puppeteer');
const {Deadline}=require('../../lib/capture/deadline');
const {createEgressProxy}=require('../../lib/capture/egressProxy');
const {captureWithBrowser}=require('../../lib/capture/browserCapture');
const site='https://site.example.com',cdn='https://assets.example.net';
const observed=[];
const server=https.createServer({key:fs.readFileSync('/fixtures/key.pem'),cert:fs.readFileSync('/fixtures/cert.pem')},(req,res)=>{
 observed.push({host:req.headers.host,path:req.url,method:req.method});
 if(req.url==='/app.js'){
  res.setHeader('Content-Type','application/javascript');
  return res.end(`setTimeout(()=>{document.querySelector('main').innerHTML='<h1>Owned subscription plans</h1><table><tr><th>Plan</th><th>Price</th></tr><tr><td>Standard</td><td>27</td></tr></table><p>This is the complete public content hydrated by the separate asset origin.</p>'},650)`);
 }
 res.setHeader('Content-Type','text/html');
 res.end(`<html><head><title>Owned plans</title></head><body><main>Public page shell awaiting application content.</main><script src="${cdn}/app.js"></script></body></html>`);
});
const resolver=async value=>{const url=new URL(value);assert.ok([site,cdn].includes(url.origin));return {url,addresses:[{address:'127.0.0.1',family:4}]};};
async function capture(resources){
 const deadline=new Deadline(15000);
 const proxy=createEgressProxy({deadline,resolve:resolver,connect:options=>net.connect({...options,port:server.address().port})});
 await new Promise(resolve=>proxy.server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await puppeteer.launch({executablePath:'/usr/bin/chromium',headless:true,pipe:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-quic','--ignore-certificate-errors',`--proxy-server=http://127.0.0.1:${proxy.server.address().port}`,'--proxy-bypass-list=<-loopback>']});
  return await captureWithBrowser(browser,{url:site+'/plans'},{deadline,resolver,allowedOrigins:[site],allowedResourceOrigins:resources});
 }finally{await browser?.close();await proxy.close();deadline.close();}
}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const blocked=await capture([]);assert.doesNotMatch(blocked.markdown,/Standard/);assert.ok(blocked.warnings.includes('RESOURCE_BLOCKED'));assert.ok(!observed.some(x=>x.path==='/app.js'));
  const fixed=await capture([cdn]);assert.match(fixed.markdown,/Standard/);assert.match(fixed.markdown,/27/);assert.ok(observed.some(x=>x.path==='/app.js'&&x.method==='GET'));assert.ok(observed.every(x=>x.method==='GET'));
  console.log(JSON.stringify({test:'owned cross-origin hydration',blockedWithoutGrant:true,renderedWithResourceOnlyGrant:true,contentIncludesPrice:true,writesObserved:false}));
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
