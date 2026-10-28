'use strict';
const assert=require('node:assert/strict');
const puppeteer=require('puppeteer');
const {Observations}=require('../../lib/browser/observations');
const {createInteractions}=require('../../lib/browser/interactions');
const {Deadline}=require('../../lib/capture/deadline');
(async()=>{
 const browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND']});
 const deadline=new Deadline(15000);
 try{
 const page=await browser.newPage();await page.setRequestInterception(true);page.on('request',r=>r.abort());
 await page.setContent('<input aria-label="Search"><input type="password" aria-label="Password"><select aria-label="Period"><option value="monthly">Monthly</option><option value="annual">Annual</option></select><button id="tab">Details</button><button>Delete account</button><a href="https://example.net/">Other site</a><form><button>Log in</button></form><output></output>');
 await page.evaluate(()=>{document.querySelector('#tab').onclick=()=>document.querySelector('output').textContent='details shown';document.querySelector('input').oninput=()=>document.body.dataset.input='received';});
 const refs=new Observations(page,'owned-page');let snapshot=await refs.observe();
 const actions=createInteractions({page,pageId:'owned-page',observations:refs,validateNavigation:async()=>{const e=new Error('TARGET_DENIED');e.code='TARGET_DENIED';throw e;}});
 const run=action=>actions.act({observationId:snapshot.observationId,action},deadline);
 const ref=name=>snapshot.controls.find(c=>c.name===name).ref;
 await run({type:'fill',ref:ref('Search'),text:'public query'});assert.equal(await page.$eval('input',e=>e.value),'public query');assert.equal(await page.$eval('body',e=>e.dataset.input),'received');
 await assert.rejects(run({type:'fill',ref:ref('Password'),text:'must not enter'}),{code:'PROTECTED_INPUT_REQUIRED'});assert.equal(await page.$eval('input[type=password]',e=>e.value),'');
 await run({type:'select',ref:ref('Period'),values:['annual']});assert.equal(await page.$eval('select',e=>e.value),'annual');
 await run({type:'click',ref:ref('Details')});assert.equal(await page.$eval('output',e=>e.textContent),'details shown');
 await assert.rejects(run({type:'click',ref:ref('Delete account')}),{code:'OPERATION_PERMISSION_REQUIRED'});
 await assert.rejects(run({type:'click',ref:ref('Log in')}),{code:'OPERATION_PERMISSION_REQUIRED'});
 await assert.rejects(run({type:'click',ref:snapshot.links[0].ref}),{code:'TARGET_DENIED'});
 await run({type:'scroll',deltaY:100});await run({type:'wait',milliseconds:5});await run({type:'select_page',pageId:'owned-page'});
 await assert.rejects(run({type:'select_page',pageId:'foreign-page'}),{code:'UNSUPPORTED'});
 await refs.observe();await assert.rejects(run({type:'click',ref:ref('Details')}),{code:'STALE_REFERENCE'});
 await refs.clear();console.log('PASS: real Chromium public fill/events, select, click, wait/scroll/page, protected-field rejection, explicit business/native-submit denial, destination denial and stale reference');
 }finally{deadline.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
