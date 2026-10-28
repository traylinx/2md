'use strict';
const assert=require('node:assert/strict');
const puppeteer=require('puppeteer');
const {Observations}=require('../../lib/browser/observations');
(async()=>{
 const browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND']});
 try{
 const page=await browser.newPage();await page.setRequestInterception(true);page.on('request',r=>r.abort());
 await page.setContent('<form action="https://example.com/login"><label>Email<input type="email" value="PRIVATE_VALUE"></label><input type="password" value="PRIVATE_PASSWORD"><button>Log in</button></form><button disabled>Disabled</button><button hidden>Hidden</button><div id="shadow"></div>');
 await page.evaluate(()=>document.querySelector('#shadow').attachShadow({mode:'open'}).innerHTML='<button>Shadow action</button>');
 const refs=new Observations(page,'owned-page');let first=await refs.observe();
 assert.equal(first.controls.length,4);assert.ok(first.controls.some(x=>x.name==='Shadow action'));assert.doesNotMatch(JSON.stringify(first),/PRIVATE_/);
 const login=first.controls.find(x=>x.name==='Log in');assert.ok(await refs.resolve(first.observationId,login.ref));
 await page.evaluate(()=>document.body.appendChild(document.createElement('p')));assert.ok(await refs.resolve(first.observationId,login.ref));
 await page.evaluate(()=>document.querySelector('form').action='https://example.net/changed');await assert.rejects(refs.resolve(first.observationId,login.ref),{code:'STALE_REFERENCE'});
 let next=await refs.observe();await assert.rejects(refs.resolve(first.observationId,login.ref),{code:'STALE_REFERENCE'});
 let button=next.controls.find(x=>x.name==='Log in');await page.evaluate(()=>document.querySelector('form button').hidden=true);await assert.rejects(refs.resolve(next.observationId,button.ref),{code:'STALE_REFERENCE'});
 await page.evaluate(()=>document.querySelector('form button').hidden=false);
 next=await refs.observe();button=next.controls.find(x=>x.name==='Log in');
 await page.evaluate(()=>{const old=document.querySelector('form'),other=document.createElement('form');other.action=old.action;document.body.append(other);other.append(old.querySelector('button'));});
 await assert.rejects(refs.resolve(next.observationId,button.ref),{code:'STALE_REFERENCE'});
 await assert.rejects(refs.resolve(next.observationId,'foreign-reference'),{code:'STALE_REFERENCE'});
 await refs.clear();console.log('PASS: real Chromium observation, open shadow root, no input values, unrelated mutation, destination change, snapshot invalidation, hidden target, form identity, foreign reference');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
