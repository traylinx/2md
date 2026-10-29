'use strict';

// Serialized into the nonce-protected loopback page. No remote content is code;
// all transport remains same-origin/CSRF protected, outside MCP/model results.
function bootHumanViewer({csrf,expiresAt,viewerV2=false,interaction=false}) {
 const $=id=>document.getElementById(id),screen=$('screen');
 const controllers=new Set();
 let frame=null,busy=false,stopped=false,pending=null,timer,expiryTimer;
 let activated=!viewerV2;
 let outstanding=null,recoveries=0,lastError='',frameAt=0,canFinish=false;
 const terminal={
  SESSION_LOST:'This remote session has ended. Return to your agent for a fresh session; this link cannot be reused.',
  FORBIDDEN:'Viewer authorization is no longer valid. Return to your agent; do not retry the old link.',
  UNAUTHENTICATED:'Viewer authorization is no longer valid. Return to your agent.',
  PERMISSION_REQUIRED:'Browser permission is no longer available. Return to your agent.',
  LIMIT_EXCEEDED:'This session reached its limit. Return to your agent.',
 };
 function say(message){$('status').textContent=message;}
 function controls(){
  const ready=!stopped&&!busy&&!!frame;
  $('screenCover').hidden=stopped||screen.hidden||!busy;
  screen.setAttribute('aria-busy',String(busy&&!stopped));
  screen.setAttribute('aria-disabled',String(!ready));screen.style.pointerEvents=ready?'auto':'none';
  for(const id of ['type','press','up','down','text','key'])$(id).disabled=!ready;
  $('refresh').disabled=stopped||busy;
  $('finish').disabled=stopped||busy||!canFinish;
  for(const id of ['allow','deny'])$(id).disabled=stopped||busy||!pending;
 }
 function hide(){frame=null;screen.hidden=true;screen.removeAttribute('src');controls();}
 function hold(){frame=null;controls();} // Keep layout/pixels stable, but never accept stale input.
 function decision(value){
  pending=value||null;$('decision').hidden=!pending;
  if(pending)$('request').textContent='Paused request: '+pending.method+' '+pending.origin+' ('+pending.type+', '+pending.bodyBytes+' bytes). Exact digest: '+pending.operationDigest+'. '+(pending.reason==='recipient'?'This destination becomes an approved recipient for this private session. ':'')+'Allow only if needed for your requested login or verification.';
  controls();
 }
 function stop(message,state='ended'){
  stopped=true;clearTimeout(timer);clearInterval(expiryTimer);
  for(const controller of controllers)controller.abort();
  hide();decision(null);$('text').value='';document.body.dataset.state=state;say(message);controls();
 }
 function tick(){
  if(stopped||!activated)return;
  const seconds=Math.max(0,Math.ceil((expiresAt-Date.now())/1000));
  $('expiry').textContent='Time remaining: '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')+'. Keep this tab and your agent running.';
  if(!seconds)stop('This handoff has expired. Return to your agent for a fresh session. The old link cannot work anymore.','expired');
 }
 async function api(path,input={}){
  const controller=new AbortController();controllers.add(controller);
  // A slow/lost response must not freeze the viewer for the whole lease. An
  // abort is NOT cancellation of the remote operation: recover its receipt only.
  const timeout=setTimeout(()=>controller.abort(),10000);
  try{
   const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(input),cache:'no-store',signal:controller.signal});
   const value=await r.json();
   if(!r.ok)throw Error(/^[A-Z_]{1,64}$/.test(value.error)?value.error:'UNAVAILABLE');
   return value;
  }catch(error){throw Error(error.name==='AbortError'?'RESPONSE_TIMEOUT':/^[A-Z_]{1,64}$/.test(error.message)?error.message:'UNAVAILABLE');}
  finally{clearTimeout(timeout);controllers.delete(controller);}
 }
 function schedule(delay){clearTimeout(timer);timer=setTimeout(()=>guard(refresh),delay);}
 function recover(message){
  hide();canFinish=false;document.body.dataset.state='recovering';
  say(message+(lastError?' Last error: '+lastError+'.':'')+' No input will be repeated.');
  if(++recoveries<=5)schedule(3000);
  else say($('status').textContent+' Automatic recovery paused. Use Refresh view / recover status.');
 }
 async function refresh(received){
  if(!activated){
   const active=await api('/activate');if(stopped)return;
   expiresAt=active.expiresAt;activated=true;tick();if(stopped)return;
  }
  const s=received||await api(viewerV2?'/view':'/state');if(stopped)return;
  expiresAt=Math.min(expiresAt,s.expiresAt);tick();if(stopped)return;
  if(s.state!=='human_control'){
   stop(s.state==='agent_control'?'Returned to agent. Tell your agent to continue.':'This remote session has ended. Return to your agent for a fresh session.',s.state);return;
  }
  // A lost submission response must match THIS action, not an older receipt.
  if(outstanding&&s.action?.actionId!==outstanding){decision(null);recover('Checking the original action receipt; its outcome is not yet confirmed.');return;}
  decision(s.pending);
  if(s.action?.state==='outcome_unknown'){
   hide();canFinish=false;document.body.dataset.state='unknown';say('The last action outcome is unknown. Do not repeat it. Return to your agent to inspect the original action status.');return;
  }
  if(s.pending||['running','needs_input'].includes(s.action?.state)){
   hide();canFinish=false;
   if(s.pending){recoveries=0;document.body.dataset.state='decision';say('The page is waiting for your permission to contact another destination or submit a request. Choose Allow or Deny below, then the view will resume.');}
   else recover('The original action is still running; checking its receipt.');
   return;
  }
  if(outstanding){outstanding=null;lastError='';}
  canFinish=true;
  const f=viewerV2?s.frame:await api('/frame');if(stopped)return;if(!f)throw Error('FRAME_UNAVAILABLE');
  const capturedAt=Date.now(),nextImage=new Image();nextImage.src='data:image/jpeg;base64,'+f.jpeg;
  try{await nextImage.decode();}catch{throw Error('FRAME_UNAVAILABLE');}
  if(stopped)return;
  screen.src=nextImage.src;frame=f;frameAt=capturedAt;screen.hidden=false;$('site').textContent='Current site: '+f.origin;
  recoveries=0;lastError='';document.body.dataset.state='ready';
  say(s.action?.state==='failed'?'Last action stopped: '+s.action.error+'. View refreshed; choose your next action.':'Click the remote page. When finished, choose Return to agent.');
  // Worker frames expire after 30s. Refresh early without replaying any input.
  schedule(20000);
 }
 async function guard(work){
  tick();if(busy||stopped)return;
  busy=true;clearTimeout(timer);document.body.dataset.state='working';say('Working in your remote session…');controls();
  try{await work();}
  catch(error){
   if(!stopped){
    if(terminal[error.message])stop(terminal[error.message]);
    else {lastError=error.message;decision(null);recover('Connection interrupted. Recovering the current view and original action status.');}
   }
  }finally{busy=false;if(!stopped)tick();controls();}
 }
 async function input(value){
  if(!frame)return; // No stale image/keyboard can overwrite the original error.
  if(Date.now()-frameAt>=20000){hold();await refresh();if(!stopped)say('View refreshed before input. Please choose the control again. Nothing was submitted.');return;}
  const id=frame.frameId;outstanding=crypto.randomUUID();hold();canFinish=false;recoveries=0;
  const reply=await api(interaction?'/interact':'/input',{actionId:outstanding,frameId:id,input:value});if(!stopped)await refresh(interaction?reply:undefined);
 }
 screen.onclick=e=>{
  if(!frame||busy||stopped)return;
  const r=screen.getBoundingClientRect();
  const x=Math.max(0,Math.min(frame.width-1,Math.floor((e.clientX-r.left-screen.clientLeft)*frame.width/screen.clientWidth)));
  const y=Math.max(0,Math.min(frame.height-1,Math.floor((e.clientY-r.top-screen.clientTop)*frame.height/screen.clientHeight)));
  void guard(()=>input({type:'click',x,y}));
 };
 $('refresh').onclick=()=>{recoveries=0;void guard(async()=>{hold();await refresh();});};
 $('up').onclick=()=>guard(()=>input({type:'scroll',deltaY:-600}));
 $('down').onclick=()=>guard(()=>input({type:'scroll',deltaY:600}));
 $('type').onclick=()=>guard(()=>{const text=$('text').value;$('text').value='';return input({type:'text',text});});
 $('press').onclick=()=>guard(()=>input({type:'key',key:$('key').value}));
 for(const choice of ['allow','deny'])$(choice).onclick=()=>guard(async()=>{
  if(!pending)return;
  await api('/decision',{operationId:pending.operationId,operationDigest:pending.operationDigest,decision:choice==='allow'?'approve':'deny'});
  decision(null);recoveries=0;await refresh();
 });
 $('finish').onclick=()=>guard(async()=>{
  await api('/finish');stop('Returned to agent. Tell your agent to continue; it will observe this same session.','agent_control');
 });
 window.addEventListener('pagehide',()=>{clearTimeout(timer);clearInterval(expiryTimer);for(const controller of controllers)controller.abort();});
 controls();tick();if(!stopped)expiryTimer=setInterval(tick,250);void guard(refresh);
}
module.exports={bootHumanViewer};
