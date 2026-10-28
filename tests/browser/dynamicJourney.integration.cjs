'use strict';
// Deterministic owned fixture: exercises tools, not independent client discovery.
const assert=require('node:assert/strict'),https=require('node:https'),fs=require('node:fs'),net=require('node:net'),path=require('node:path'),os=require('node:os');
const {Deadline}=require('../../lib/capture/deadline');
const {createEgressProxy}=require('../../lib/capture/egressProxy');
const {createBrowserRuntime}=require('../../lib/browser/runtime');
const {bound,owner,grant}=require('./support.cjs');
const c=require('../../lib/browser/contracts');
const origin='https://example.com';let posts=0;
const server=https.createServer({key:fs.readFileSync(process.env.FIXTURE_KEY),cert:fs.readFileSync(process.env.FIXTURE_CERT)},(req,res)=>{
 res.setHeader('Content-Type','text/html');
 if(req.method!=='GET'){posts++;res.statusCode=405;return res.end('Denied');}
 if(req.url==='/details')return res.end('<main><h1>Plan details</h1><p>Annual billing is charged once per year.</p></main>');
 if(req.url==='/frame')return res.end('<main><h2>Usage policy</h2><p>No absolute token quota published in this fixture.</p></main>');
 res.end(`<!doctype html><title>Owned dynamic plans</title><main><h1>Plans</h1>
 <button type="button" id="annual">Annual prices</button><label>Currency<select id="currency"><option value="USD">USD</option><option value="EUR">EUR</option></select></label>
 <section aria-label="Pricing" id="prices">Loading prices</section><a href="/details">Billing details</a>
 <div id="shadow"></div><iframe src="/frame" title="Usage policy"></iframe>
 <div style="height:1600px"></div><section aria-label="Lazy details" id="lazy">Scroll for limits</section>
 <button hidden>Hidden action</button><button disabled>Unavailable action</button></main>
 <script>
 let annual=false;const render=()=>{const currency=document.querySelector('#currency').value;
 document.querySelector('#prices').innerHTML='<table><tr><th>Plan</th><th>Price</th><th>Billing</th></tr><tr><td>Sprout</td><td>'+currency+' '+(annual?120:12)+'</td><td>'+(annual?'year':'month')+'</td></tr><tr><td>Canopy</td><td>'+currency+' '+(annual?300:30)+'</td><td>'+(annual?'year':'month')+'</td></tr></table>';};
 setTimeout(render,300);document.querySelector('#annual').onclick=()=>{annual=true;render();};document.querySelector('#currency').onchange=render;
 document.querySelector('#shadow').attachShadow({mode:'open'}).innerHTML='<button type="button">Explain limits</button><p></p>';
 document.querySelector('#shadow').shadowRoot.querySelector('button').onclick=()=>document.querySelector('#shadow').shadowRoot.querySelector('p').textContent='Usage resets monthly';
 addEventListener('scroll',()=>{document.querySelector('#lazy').textContent='Sprout: 10 projects. Canopy: 25 projects.';},{once:true});
 </script>`);
});
(async()=>{
 const lifetime=new Deadline(45000),tempRoot=fs.mkdtempSync(path.join(os.tmpdir(),'gb01-dynamic-'));let runtime,proxy,releases=0;
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
 const nonces=new Set();
 const g={...grant(),policyVersion:c.POLICY,hostKeyFingerprint:bound.hostKeyFingerprint,approvedByWorkspaceUserId:owner.workspaceUserId};
 runtime=createBrowserRuntime({autoSweep:false,runtimeEpoch:'e1',tempRoot,executablePath:process.env.FIXTURE_CHROMIUM_WRAPPER,authorize:async()=>g,resolveCaller:async()=>bound,consumeNonce:async({nonce})=>{if(nonces.has(nonce))return false;nonces.add(nonce);return true;},
 lease:async()=>{proxy=createEgressProxy({deadline:lifetime,resolve:async value=>{const url=new URL(value);assert.equal(url.origin,origin);return {url,addresses:[{address:'127.0.0.1',family:4}]};},connect:options=>net.connect({...options,port:server.address().port})});await new Promise(r=>proxy.server.listen(0,'127.0.0.1',r));return {proxyUrl:`http://127.0.0.1:${proxy.server.address().port}`,release:async()=>{releases++;await proxy.close();}};}});
 const open=await runtime.manager.open(bound,{runtimeEpoch:'e1',actionId:'open',mode:'public',url:origin,purpose:'Compare owned plans and limits'});assert.equal(open.state,'succeeded',JSON.stringify(open));
 const sessionId=open.sessionId;let seq=0;
 const observe=()=>runtime.manager.query(bound,'browser_observe',{sessionId});
 const extract=(extra={})=>runtime.manager.query(bound,'browser_extract',{sessionId,...extra});
 async function act(action){const view=await observe();const receipt=await runtime.manager.execute(bound,'browser_act',{sessionId,runtimeEpoch:'e1',actionId:'act'+(++seq),observationId:view.observationId,action:typeof action==='function'?action(view):action});assert.equal(receipt.state,'succeeded',JSON.stringify(receipt));}
 const control=(v,name)=>{const found=v.controls.find(x=>(x.name===name||(name==='Currency'&&x.role==='combobox'&&x.name.startsWith('Currency'))));assert.ok(found,'Missing '+name);return found.ref;};
 await act({type:'wait',milliseconds:400});
 let content=await extract();assert.match(content.markdown,/Sprout[\s\S]*USD 12[\s\S]*Canopy[\s\S]*USD 30/);assert.equal(content.source.privacy,'public');assert.ok(content.evidence.length);
 await act(v=>({type:'click',ref:control(v,'Annual prices')}));
 await act(v=>({type:'select',ref:control(v,'Currency'),values:['EUR']}));
 content=await extract();assert.match(content.markdown,/Sprout[\s\S]*EUR 120[\s\S]*year[\s\S]*Canopy[\s\S]*EUR 300/);
 await act(v=>({type:'click',ref:control(v,'Explain limits')}));
 assert.match((await observe()).text,/Usage resets monthly/);assert.match((await extract()).markdown,/Usage resets monthly/);
 await act({type:'scroll',deltaY:1800});await act({type:'wait',milliseconds:100});assert.match((await extract()).markdown,/10 projects[\s\S]*25 projects/);
 const view=await observe();assert.ok(!view.controls.some(x=>['Hidden action','Unavailable action'].includes(x.name)));
 let frameFound=false;for(const frame of view.frames.filter(f=>f.supported)){const evidence=await extract({frameId:frame.frameId});if(evidence.markdown.includes('No absolute token quota'))frameFound=true;}assert.equal(frameFound,true);
 await act(v=>({type:'click',ref:v.links.find(x=>x.name==='Billing details').ref}));assert.match((await extract()).markdown,/Annual billing is charged once per year/);
 const back=await runtime.manager.execute(bound,'browser_navigate',{sessionId,runtimeEpoch:'e1',actionId:'back',target:{back:true}});assert.equal(back.state,'succeeded',JSON.stringify(back));assert.equal(new URL((await extract()).source.url).pathname,'/');
 assert.equal(posts,0);await runtime.manager.close(bound,sessionId);assert.equal(releases,1);assert.deepEqual(fs.readdirSync(tempRoot),[]);
 console.log('PASS: actual worker dynamic pricing associations, annual tab/currency select, open-shadow action, lazy-scroll limits, same-origin frame extraction, link/back navigation, hidden/disabled exclusion, zero writes and cleanup');
 }finally{await runtime?.stop();await proxy?.close();lifetime.close();server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(tempRoot,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
