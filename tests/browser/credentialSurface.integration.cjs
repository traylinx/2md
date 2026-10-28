'use strict';
// Owned rendered UI qualification. No real account, network or owner credentials.
const assert=require('node:assert/strict');
const puppeteer=require('puppeteer');
const {createCredentialProvider}=require('../../lib/browser/credentialProvider');
const {createCredentialSurface}=require('../../lib/browser/credentialSurface');
const {bound}=require('./support.cjs');
(async()=>{
 const owner={workspaceUserId:'owner1',organizationId:bound.principal.organizationId,projectId:bound.principal.projectId};
 const provider=createCredentialProvider({verifyOwner:async context=>context==='paired'?owner:null});
 const surface=await createCredentialSurface({provider,ownerContext:async req=>req.headers.cookie==='owner=paired'?'paired':null});
 let browser;
 try{
  const request={sessionId:'s1',origin:'https://site.example.org',purpose:'Read account <script>unsafe()</script>',recipients:['https://site.example.org'],ownerId:'owner1',expiresAt:Date.now()+60000};
  const record=provider.request(bound,request),url=surface.urlFor(record.interventionId);
  browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking']});
  const page=await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request',r=>new URL(r.url()).origin===new URL(url).origin?r.continue():r.abort());
  assert.equal((await page.goto(url)).status(),403);
  await browser.setCookie({name:'owner',value:'paired',url:new URL(url).origin,httpOnly:true,sameSite:'Strict'});
  const response=await page.goto(url);assert.equal(response.status(),200);
  assert.equal(response.headers()['cache-control'],'no-store');
  assert.equal(response.headers()['referrer-policy'],'same-origin');
  assert.match(response.headers()['content-security-policy'],/form-action 'self'/);
  assert.equal(await page.$eval('input[name=password]',el=>el.type),'password');
  assert.equal(await page.$eval('input[name=password]',el=>el.labels.length),1);
  assert.equal(await page.$eval('input[name=username]',el=>el.labels.length),1);
  assert.equal(await page.$$eval('script',els=>els.length),0);
  // Native HTML validation must stop an empty-password submission.
  await page.click('button');assert.equal(provider.resolve(bound,{sessionId:'s1',origin:request.origin}).state,'needs_input');
  await page.type('input[name=username]','owned-rendered-user');
  await page.type('input[name=password]','SYNTHETIC_RENDERED_PASSWORD');
  await Promise.all([page.waitForNavigation(),page.click('button')]);
  const text=await page.$eval('body',el=>el.innerText);
  assert.match(text,/Credentials supplied/);assert.doesNotMatch(text,/SYNTHETIC_RENDERED_PASSWORD|owned-rendered-user/);
  assert.equal(await page.$$eval('input',els=>els.length),0);
  assert.equal(provider.resolve(bound,{sessionId:'s1',origin:request.origin}).state,'ready');
  await provider.consume(bound,{credentialRef:record.interventionId,...request},async secret=>{
   assert.equal(secret.username.toString(),'owned-rendered-user');assert.equal(secret.password.toString(),'SYNTHETIC_RENDERED_PASSWORD');
  });
  assert.equal((await page.goto(url)).status(),403);
  console.log('PASS: rendered protected input; pairing, labels, password masking, CSP, escaping, native required validation, native POST, no reflected credentials, one-use cleanup');
 }finally{await browser?.close();await surface.close();provider.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
