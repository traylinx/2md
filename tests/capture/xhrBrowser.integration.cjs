'use strict';
// Owned HTTPS pages only; run in disposable --network=none container.
const assert=require('node:assert/strict'),https=require('node:https'),fs=require('node:fs'),net=require('node:net'),puppeteer=require('puppeteer');
const {Deadline}=require('../../lib/capture/deadline'),{createEgressProxy}=require('../../lib/capture/egressProxy'),{captureWithBrowser}=require('../../lib/capture/browserCapture'),{freezeRecipe}=require('../../lib/capture/recipe');
const origin='https://site.example.com',api='https://auth.example.com',traffic=[];
const server=https.createServer({key:fs.readFileSync('/fixtures/key.pem'),cert:fs.readFileSync('/fixtures/cert.pem')},(req,res)=>{
 traffic.push({method:req.method,path:req.url});res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Headers','content-type');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
 if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
 if(req.url==='/bootstrap'){res.setHeader('Content-Type','application/json');return res.end('{}');}
 if(req.url==='/token'){
  let body='';req.on('data',b=>{body+=b;});return req.on('end',()=>{res.setHeader('Content-Type','application/json');const data=JSON.parse(body);res.end(JSON.stringify({data:{email:data.password==='fixture-password'?'fixture-user':'wrong-user'},accessToken:'fixture-access-token'}));});
 }
 if(req.url==='/organizations'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({name:'Fixture organization',plan:'Test plan'}));}
 res.setHeader('Content-Type','text/html');
 if(req.url==='/login.css'){res.setHeader('Content-Type','text/css');return res.end('@import url("https://fonts.example.org/font.css");body{font-family:sans-serif}');}
 if(req.url==='/login')return res.end(`<div id="app"></div><script>const css=document.createElement('link');css.rel='stylesheet';css.href='/login.css';css.onerror=()=>{document.querySelector('#app').textContent='CSS_LOAD_FAILED';};css.onload=()=>{document.querySelector('#app').innerHTML='<form><input id="username"><input id="password" type="password"><button type="submit">Login</button></form>';document.querySelector('form').onsubmit=async e=>{e.preventDefault();await fetch('${api}/bootstrap',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const r=await fetch('${api}/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:document.querySelector('#username').value,password:document.querySelector('#password').value})});const v=await r.json();if(v.data.email==='fixture-user'){localStorage.setItem('token',v.accessToken);location.href='/report';}}};document.head.append(css);</script>`);
 if(req.url==='/report')return res.end(`<title>Owned organization report</title><main id="report">Loading...</main><script>if(!localStorage.getItem('token'))location.href='/login';else{fetch('${api}/organizations').then(r=>r.json()).then(v=>{document.querySelector('#report').innerHTML='<h1>'+v.name+'</h1><p>This is the authenticated organization report with membership information and the current plan: '+v.plan+'</p>';});fetch('${api}/delete',{method:'POST'}).catch(()=>{});fetch('${api}/token',{method:'POST'}).catch(()=>{});}</script>`);
 res.end('Denied fixture path');
});
const resolver=async value=>{const url=new URL(value);assert.ok([origin,api].includes(url.origin));return {url,addresses:[{address:'127.0.0.1',family:4}]};};
async function operation(password,inspect=false){
 const deadline=new Deadline(20000),proxy=createEgressProxy({deadline,resolve:resolver,connect:o=>net.connect({...o,port:server.address().port})});await new Promise(r=>proxy.server.listen(0,'127.0.0.1',r));
 const profile=fs.mkdtempSync('/tmp/xhr-browser-fixture-');let browser;
 try{
 browser=await puppeteer.launch({executablePath:'/usr/bin/chromium',headless:true,pipe:true,userDataDir:profile,args:['--no-sandbox','--disable-dev-shm-usage','--disable-quic','--ignore-certificate-errors',`--proxy-server=http://127.0.0.1:${proxy.server.address().port}`,'--proxy-bypass-list=<-loopback>']});
 const request={url:origin+'/report',loginUrl:origin+'/login',auth:{mode:'inlineOnce',username:'fixture-user',password},login:{mode:'xhr',postUrls:[api+'/bootstrap',api+'/token'],readUrls:[api+'/organizations'],readPaths:['/report'],fields:{form:'form',username:'#username',password:'#password',submit:'button'},proof:{url:api+'/token',path:['data','email']}}};
 if(inspect){request.url=origin+'/login';request.inspectLogin=true;delete request.auth;delete request.login;}
 const result=await captureWithBrowser(browser,request,{deadline,resolver,recipe:inspect?undefined:freezeRecipe(request),allowedOrigins:[origin,api]});assert.equal(browser.browserContexts().length,1);return result;
 }finally{await browser?.close();await proxy.close();deadline.close();fs.rmSync(profile,{recursive:true,force:true});}
}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const inspected=await operation(undefined,true);assert.equal(inspected.kind,'login-inspection');assert.equal(inspected.inspection.forms.length,1);assert.ok(inspected.warnings.includes('STYLESHEET_OMITTED'));assert.ok(!traffic.some(t=>t.path==='/font.css'));assert.ok(!JSON.stringify(inspected).includes('fixture-password'));assert.equal(traffic.filter(t=>t.method==='POST').length,0);
 const r=await operation('fixture-password');assert.match(r.markdown,/Fixture organization/);assert.match(r.markdown,/Test plan/);assert.doesNotMatch(JSON.stringify(r),/fixture-password|fixture-access-token/);
 assert.deepEqual(traffic.filter(t=>t.method==='POST').map(t=>t.path),['/bootstrap','/token']);assert.ok(traffic.some(t=>t.method==='OPTIONS'));
 await assert.rejects(operation('wrong-fixture-password'),{code:'TARGET_UNVERIFIED'});
 assert.equal(traffic.filter(t=>t.path==='/delete').length,0);
 console.log(JSON.stringify({suite:'isolated real Chromium XHR login',passed:6,assertions:['blocked CSS import does not kill SPA bootstrap; denied resource never fetched','credential-free login inspection','cross-origin two-stage login + organization read','CORS and exact ordered POST allowance','business writes and token refresh blocked','wrong identity refused; isolated contexts closed']}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{server.closeAllConnections();server.close();});
