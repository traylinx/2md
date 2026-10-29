'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const {createHumanSurface}=require('../../lib/browser/humanSurface');
const {BrowserError}=require('../../lib/browser/contracts');
const turn=()=>new Promise(r=>setImmediate(r));
async function until(check){for(let i=0;i<200;i++){if(check())return;await new Promise(r=>setTimeout(r,2));}assert.ok(check(),'viewer did not reach expected state');}
async function setup(options={}){
 let time=Date.now(),action,pending,frames=0,remoteState='human_control';
 const calls=[],timers=new Map();let timerId=0;
 const record={sessionId:'s',handoffId:'h',state:'human_control',expiresAt:time+180000};
 const client={protectedCall:async(name,input)=>{
  calls.push({name,input});const custom=await options.remote?.(name,input);if(custom)return custom;
  if(name==='human-activate')return {...record,expiresAt:time+300000};
  if(name==='human-interact')action={runtimeEpoch:'e1',sessionId:'s',actionId:input.actionId,state:'succeeded'};
  if(name==='human-view'||name==='human-interact')return {...record,expiresAt:time+300000,state:remoteState,...(action?{action}:{}),...(pending?{pending}:{}),...(!pending?{frame:{frameId:'f'+(++frames),jpeg:'synthetic',width:1280,height:800,origin:'https://owned.example'}}:{})};
  if(name==='human-state')return {...record,state:remoteState,...(action?{action}:{}),...(pending?{pending}:{})};
  if(name==='human-frame')return {frameId:'f'+(++frames),jpeg:'synthetic',width:1280,height:800,origin:'https://owned.example'};
  if(name==='human-input'){action={runtimeEpoch:'e1',sessionId:'s',actionId:input.actionId,state:'succeeded'};return action;}
  if(name==='human-decide'){pending=null;action.state='succeeded';return {prepared:true};}
  if(name==='human-finish'){remoteState='agent_control';return {state:remoteState};}
  throw Error(name);
 }};
 const surface=await createHumanSurface({client,now:()=>time});
 const launch=await fetch(surface.urlFor(record,'e1',{viewerV2:options.viewerV2===true,interaction:options.interaction===true}),{redirect:'manual'}),cookie=launch.headers.get('set-cookie').split(';')[0];
 const origin=new URL(launch.url).origin,html=await(await fetch(origin+'/viewer',{headers:{cookie}})).text();
 const dom=new JSDOM(html,{url:origin+'/viewer',runScripts:'dangerously',beforeParse(w){
  w.Date.now=()=>time;w.AbortController=AbortController;w.HTMLImageElement.prototype.decode=async()=>{};
  w.setTimeout=(fn,ms)=>{timers.set(++timerId,{fn,ms,interval:false});return timerId;};w.clearTimeout=id=>timers.delete(id);
  w.setInterval=(fn,ms)=>{timers.set(++timerId,{fn,ms,interval:true});return timerId;};w.clearInterval=w.clearTimeout;
  w.fetch=async(path,request)=>{
   const response=await fetch(origin+path,{...request,headers:{...request.headers,cookie,origin}});
   return options.transport?options.transport(path,request,response):response;
  };
 }});
 const w=dom.window,$=id=>w.document.getElementById(id);
 const screen=$('screen');screen.getBoundingClientRect=()=>({left:10,top:20,width:642,height:402});
 for(const [key,value]of Object.entries({clientWidth:640,clientHeight:400,clientLeft:1,clientTop:1}))Object.defineProperty(screen,key,{value});
 const state=()=>w.document.body.dataset.state;
 const wait=s=>until(()=>state()===s&&!$('refresh').disabled||state()===s&&['expired','ended','agent_control'].includes(s));
 return {w,$,calls,state,wait,timers,record,
  setAction:value=>action=value,setPending:value=>pending=value,
  click:()=>screen.dispatchEvent(new w.MouseEvent('click',{clientX:111,clientY:81,bubbles:true})),
  advance:ms=>{time+=ms;},
  async timer(ms){const entry=[...timers].find(([,t])=>t.ms===ms);assert.ok(entry,'missing timer '+ms);if(!entry[1].interval)timers.delete(entry[0]);await entry[1].fn();await turn();},
  async close(){w.dispatchEvent(new w.Event('pagehide'));w.close();await surface.close();},
 };
}
test('shipped viewer handlers click scaled coordinates once, refresh, type, scroll, key and return',async()=>{
 const f=await setup();try{
  await f.wait('ready');assert.equal(f.$('screen').hidden,false);assert.equal(f.$('type').disabled,false);
  f.click();f.click();await f.wait('ready');
  let inputs=f.calls.filter(c=>c.name==='human-input');assert.equal(inputs.length,1);assert.deepEqual(inputs[0].input.input,{type:'click',x:200,y:120});
  f.$('text').value='OWNED_SYNTHETIC';f.$('type').click();await f.wait('ready');assert.equal(f.$('text').value,'');
  f.$('down').click();await f.wait('ready');f.$('press').click();await f.wait('ready');
  inputs=f.calls.filter(c=>c.name==='human-input');assert.equal(inputs.length,4);assert.equal(new Set(inputs.map(c=>c.input.actionId)).size,4);
  assert.equal(inputs[1].input.input.text,'OWNED_SYNTHETIC');assert.equal(inputs[2].input.input.deltaY,600);assert.equal(inputs[3].input.input.key,'Tab');
  f.$('finish').click();await f.wait('agent_control');assert.equal(f.$('screen').hidden,true);assert.equal(f.$('screen').hasAttribute('src'),false);assert.equal(f.$('text').disabled,true);
 }finally{await f.close();}
});
test('lost input response recovers matching receipt without duplicate input or stale screen',async()=>{
 let fail=true;const f=await setup({transport:(path,_,response)=>{if(path==='/input'&&fail){fail=false;throw Error('lost response');}return response;}});
 try{await f.wait('ready');f.click();await f.wait('recovering');
  assert.equal(f.$('screen').hidden,true);assert.equal(f.w.getComputedStyle(f.$('screen')).display,'none');assert.equal(f.$('type').disabled,true);
  const original=f.$('status').textContent;f.click();assert.equal(f.$('status').textContent,original);assert.match(original,/UNAVAILABLE/);
  await f.timer(3000);await f.wait('ready');assert.equal(f.calls.filter(c=>c.name==='human-input').length,1);
 }finally{await f.close();}
});
test('slow submission times out UI but recovery never mistakes an older receipt for completion',async()=>{
 const f=await setup({transport:async(path,request,response)=>{if(path==='/input')return new Promise((_,reject)=>request.signal.addEventListener('abort',()=>reject(Object.assign(Error(),{name:'AbortError'})),{once:true}));return response;}});
 try{await f.wait('ready');f.click();await until(()=>[...f.timers.values()].some(t=>t.ms===10000));
  await until(()=>f.calls.some(c=>c.name==='human-input'));await f.timer(10000);await f.wait('recovering');assert.match(f.$('status').textContent,/RESPONSE_TIMEOUT/);
  const original=f.calls.find(c=>c.name==='human-input').input.actionId;
  f.setAction({actionId:'older',state:'succeeded'});await f.timer(3000);await f.wait('recovering');assert.equal(f.$('type').disabled,true);
  f.setAction({actionId:original,state:'succeeded'});await f.timer(3000);await f.wait('ready');assert.equal(f.calls.filter(c=>c.name==='human-input').length,1);
 }finally{await f.close();}
});
test('pending request exposes decision controls; allow resumes original action, never resubmits click',async()=>{
 let f;f=await setup({remote:(name,input)=>{if(name==='human-input'){
  f.setAction({actionId:input.actionId,state:'needs_input'});f.setPending({operationId:'op',operationDigest:'a'.repeat(64),method:'POST',origin:'https://owned.example',type:'XHR',bodyBytes:2,reason:'operation'});return {state:'needs_input'};
 }}});
 try{await f.wait('ready');f.click();await f.wait('decision');assert.equal(f.$('allow').disabled,false);assert.equal(f.$('type').disabled,true);assert.equal(f.$('finish').disabled,true);
  f.$('allow').click();await f.wait('ready');assert.equal(f.calls.filter(c=>c.name==='human-input').length,1);assert.equal(f.calls.filter(c=>c.name==='human-decide').length,1);
 }finally{await f.close();}
});
test('expiry during in-flight input aborts wait, clears pixels/text and cannot be overwritten by late success',async()=>{
 let release;const f=await setup({transport:async(path,_,response)=>path==='/input'?new Promise(r=>{release=()=>r(response);}):response});
 try{await f.wait('ready');f.$('text').value='not sent';f.click();await until(()=>release);
  f.advance(180001);await f.timer(250);await f.wait('expired');release();await turn();await turn();
  assert.equal(f.state(),'expired');assert.equal(f.$('screen').hasAttribute('src'),false);assert.equal(f.$('text').value,'');assert.equal(f.$('refresh').disabled,true);assert.match(f.$('expiry').textContent,/0:00/);
 }finally{await f.close();}
});
test('frame ages refresh automatically and suspended tab does not send coordinates against expired frame',async()=>{
 const f=await setup();try{await f.wait('ready');const count=()=>f.calls.filter(c=>c.name==='human-frame').length;
  await f.timer(20000);await f.wait('ready');assert.equal(count(),2);
  f.advance(31000);f.click();await f.wait('ready');assert.equal(count(),3);assert.equal(f.calls.filter(c=>c.name==='human-input').length,0);assert.match(f.$('status').textContent,/Nothing was submitted/);
 }finally{await f.close();}
});
test('session loss stops viewer, whereas temporary failure recovery is bounded',async()=>{
 for(const code of ['SESSION_LOST','UNAVAILABLE']){
  let fail=false;const f=await setup({remote:name=>{if(fail&&name==='human-state')throw new BrowserError(code);}});
  try{await f.wait('ready');fail=true;f.$('refresh').click();await f.wait(code==='SESSION_LOST'?'ended':'recovering');
   if(code==='SESSION_LOST'){assert.equal(f.$('refresh').disabled,true);assert.match(f.$('status').textContent,/fresh session/);}
   else{for(let i=0;i<5;i++){await f.timer(3000);await f.wait('recovering');}assert.ok(![...f.timers.values()].some(t=>t.ms===3000));assert.match(f.$('status').textContent,/Automatic recovery paused/);}
   assert.equal(f.$('screen').hidden,true);assert.equal(f.$('type').disabled,true);assert.equal(f.calls.filter(c=>c.name==='human-input').length,0);
  }finally{await f.close();}
 }
});
test('running receipt is polled read-only; unknown outcome never enables another input',async()=>{
 let f;f=await setup({remote:(name,input)=>{if(name==='human-input'){f.setAction({actionId:input.actionId,state:'running'});return {state:'running'};}}});
 try{await f.wait('ready');f.click();await f.wait('recovering');
  const id=f.calls.find(c=>c.name==='human-input').input.actionId;
  f.setAction({actionId:id,state:'outcome_unknown'});await f.timer(3000);await f.wait('unknown');
  f.click();f.$('type').click();assert.equal(f.calls.filter(c=>c.name==='human-input').length,1);
  assert.equal(f.$('finish').disabled,true);assert.equal(f.$('screen').hidden,true);assert.match(f.$('status').textContent,/outcome is unknown/);
 }finally{await f.close();}
});

 test('v2 uses one combined view round trip, activates once and renews countdown before input',async()=>{
 const f=await setup({viewerV2:true});try{
  await f.wait('ready');assert.match(f.$('expiry').textContent,/5:00/);
  assert.equal(f.calls.filter(c=>c.name==='human-activate').length,1);
  assert.equal(f.calls.filter(c=>c.name==='human-view').length,1);
  assert.equal(f.calls.filter(c=>['human-state','human-frame'].includes(c.name)).length,0);
  f.click();await f.wait('ready');assert.equal(f.calls.filter(c=>c.name==='human-input').length,1);
  assert.equal(f.calls.filter(c=>c.name==='human-view').length,2);
  assert.equal(f.calls.filter(c=>c.name==='human-activate').length,1);
 }finally{await f.close();}
});

test('coupled interaction preserves disabled pixels/layout while awaiting a single response, never queues extra clicks',async()=>{
 let release;const f=await setup({viewerV2:true,interaction:true,transport:async(path,_,r)=>path==='/interact'?new Promise(resolve=>release=()=>resolve(r)):r});
 try{
  await f.wait('ready');const src=f.$('screen').src;f.click();await until(()=>release);
  assert.equal(f.$('screen').hidden,false);assert.equal(f.$('screen').src,src);assert.equal(f.$('screenCover').hidden,false);
  assert.equal(f.$('screen').getAttribute('aria-disabled'),'true');assert.equal(f.$('screen').style.pointerEvents,'none');
  f.click();f.$('type').click();assert.equal(f.calls.filter(c=>c.name==='human-interact').length,1);
  release();await f.wait('ready');assert.equal(f.$('screenCover').hidden,true);
  assert.equal(f.calls.filter(c=>c.name==='human-view').length,1);assert.equal(f.calls.filter(c=>c.name==='human-input').length,0);
 }finally{await f.close();}
});
test('lost coupled response hides old pixels and recovers only original receipt; no legacy input fallback',async()=>{
 let fail=true;const f=await setup({viewerV2:true,interaction:true,transport:(path,_,r)=>{if(path==='/interact'&&fail){fail=false;throw Error('lost');}return r;}});
 try{await f.wait('ready');f.click();await f.wait('recovering');assert.equal(f.$('screen').hidden,true);assert.equal(f.$('screenCover').hidden,true);
  await f.timer(3000);await f.wait('ready');assert.equal(f.calls.filter(c=>c.name==='human-interact').length,1);assert.equal(f.calls.filter(c=>c.name==='human-input').length,0);
 }finally{await f.close();}
});
test('expiry clears retained image during delayed coupled response and late success cannot restore it',async()=>{
 let release;const f=await setup({viewerV2:true,interaction:true,transport:async(path,_,r)=>path==='/interact'?new Promise(resolve=>release=()=>resolve(r)):r});
 try{await f.wait('ready');f.click();await until(()=>release);assert.equal(f.$('screen').hidden,false);
  f.advance(300001);await f.timer(250);await f.wait('expired');release();await turn();await turn();
  assert.equal(f.state(),'expired');assert.equal(f.$('screen').hasAttribute('src'),false);assert.equal(f.$('screenCover').hidden,true);
 }finally{await f.close();}
});
