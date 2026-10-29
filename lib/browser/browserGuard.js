'use strict';
const c=require('./contracts');

// Every renderer target has its own interception session. OOPIFs are attached
// while paused; install the same policy before allowing their scripts to run.
async function applySessionGuard(page,browser,policy,lifetime,{embeddedFrames=false,onFailure=()=>{},onNetwork=()=>{}}={}){
 const report=kind=>{try{onNetwork(kind);}catch{}};
 const main=await page.createCDPSession(),warnings=new Set(),guards=new Map(),installing=new Set();
 let draining=false,closed=false;
 await page.setBypassServiceWorker(true);await page.setCacheEnabled(false);
 const {frameTree}=await main.send('Page.getFrameTree'),mainFrame=frameTree.frame.id;
 const current=(await main.send('Target.getTargetInfo')).targetInfo.targetId;
 function failGuard(error){if(!closed){onFailure(error);lifetime.abort('UPSTREAM_FAILED');}}
 const restrictions=`(${function(){
  window.open=()=>null;const deny=()=>{throw Error('BROWSER_POLICY');};
  for(const name of ['WebSocket','EventSource','Worker','SharedWorker','RTCPeerConnection','webkitRTCPeerConnection'])Object.defineProperty(window,name,{value:deny,configurable:false,writable:false});
  if(navigator.serviceWorker)navigator.serviceWorker.register=deny;navigator.sendBeacon=()=>false;
 }.toString()})();`;
 async function install(session){
  if(closed)c.deny('SESSION_LOST');if(guards.has(session.id()))return;
  if(guards.size>=32)c.deny('LIMIT_EXCEEDED');
  const record={session,active:new Set(),paused:new Set()};guards.set(session.id(),record);
  const fail=id=>session.send('Fetch.failRequest',{requestId:id,errorReason:'BlockedByClient'}).catch(()=>{});
  record.fail=fail;
  session.on('Network.requestWillBeSent',e=>record.active.add(e.requestId));
  // A cross-process document can start on the parent target and finish on its
  // new OOPIF target. Network request IDs identify that same request globally.
  for(const event of ['Network.loadingFinished','Network.loadingFailed'])session.on(event,e=>{for(const guard of guards.values())guard.active.delete(e.requestId);});
  session.on('Network.loadingFailed',()=>{if(!draining&&!closed)report('transport_failed');});
  session.on('Network.dataReceived',e=>{try{policy.received(e.dataLength);}catch(error){if(!draining)lifetime.abort(error.code||'LIMIT_EXCEEDED');}});
  session.on('Fetch.requestPaused',event=>{
   record.paused.add(event.requestId);
   void handle(record,event).catch(failGuard).finally(()=>record.paused.delete(event.requestId));
  });
  session.on('Target.detachedFromTarget',event=>{guards.delete(event.sessionId);});
  session.on('Target.attachedToTarget',event=>{
   const attached=session.connection().session(event.sessionId);
   if(!embeddedFrames||event.targetInfo.type!=='iframe'||!attached){failGuard();return;}
   const task=(async()=>{await install(attached);if(closed||draining)c.deny('SESSION_LOST');await attached.send('Runtime.runIfWaitingForDebugger');})();
   installing.add(task);void task.catch(failGuard).finally(()=>installing.delete(task));
  });
  await session.send('Network.enable',{maxPostDataSize:65537});
  await session.send('Network.setBypassServiceWorker',{bypass:true});
  // Chromium applies download policy to the top-level context; OOPIF targets
  // reject this command. Response guards still deny attachment documents in every frame.
  if(session===main)await session.send('Browser.setDownloadBehavior',{behavior:'deny',browserContextId:page.browserContext().id});
  await session.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'},{urlPattern:'*',requestStage:'Response'}]});
  await session.send('Page.addScriptToEvaluateOnNewDocument',{source:restrictions});
  if(embeddedFrames)await session.send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true,filter:[{type:'iframe'}]});
 }
 async function handle(record,event){
  const {session}=record,id=event.requestId,request=event.request,document=event.resourceType==='Document',isMain=event.frameId===mainFrame;
  try{
   lifetime.remaining();if(draining||closed)return await record.fail(id);
   if(event.responseStatusCode||event.responseErrorReason){
    if(event.responseErrorReason)c.deny('TARGET_DENIED');
    if(event.responseStatusCode>=400)report(event.responseStatusCode>=500?'http5xx':'http4xx');
    let headers=event.responseHeaders||[];
    if(document){
     if(headers.some(h=>h.name.toLowerCase()==='content-disposition'&&/attachment/i.test(h.value)))c.deny('TARGET_DENIED');
     headers=headers.filter(h=>!['report-to','nel','refresh'].includes(h.name.toLowerCase()));
     headers.push({name:'Content-Security-Policy',value:`worker-src 'none'; frame-src ${embeddedFrames?'https:':"'self'"}; object-src 'none'; base-uri 'none'; manifest-src 'none'; form-action https:`});
    }
    return await session.send('Fetch.continueResponse',{requestId:id,responseCode:event.responseStatusCode,responseHeaders:headers});
   }
   if(document&&!isMain&&!embeddedFrames&&new URL(request.url).origin!==new URL(page.url()).origin)c.deny('TARGET_DENIED');
   let body=request.postData||'';
   if(request.hasPostData&&request.postData===undefined){
    if(!event.networkId)c.deny('LIMIT_EXCEEDED');body=(await session.send('Network.getRequestPostData',{requestId:event.networkId})).postData;
    if(typeof body!=='string')c.deny('LIMIT_EXCEEDED');
   }
   if(Buffer.byteLength(body)>65536)c.deny('LIMIT_EXCEEDED');
   const upload=Object.entries(request.headers||{}).some(([k,v])=>k.toLowerCase()==='content-type'&&/multipart\/form-data/i.test(String(v)));
   await policy.allow({url:request.url,method:request.method,type:event.resourceType.toLowerCase(),mainFrame:isMain,body,upload});
   if(draining||closed)return await record.fail(id);
   await session.send('Fetch.continueRequest',{requestId:id});
  }catch(error){
   if(!draining&&!closed)report('policy_blocked');
   await record.fail(id);warnings.add(error.code==='RECIPIENT_PERMISSION_REQUIRED'?'RECIPIENT_PERMISSION_REQUIRED':'RESOURCE_BLOCKED');
   if(!draining&&(error.code==='LIMIT_EXCEEDED'||lifetime.signal.aborted))lifetime.abort(error.code||'TARGET_DENIED');
  }
 }
 await install(main);
 const targets=await browser.target().createCDPSession();
 targets.on('Target.attachedToTarget',event=>{if(event.targetInfo.targetId!==current)void targets.send('Target.closeTarget',{targetId:event.targetInfo.targetId}).catch(()=>{});});
 await targets.send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true,filter:[{type:'browser',exclude:true},{type:'page'},{type:'service_worker'},{type:'shared_worker'},{type:'worker'}]});
 async function failPaused(){await Promise.all([...guards.values()].flatMap(r=>[...r.paused].map(r.fail)));}
 return {warnings,
  async drainPublic(){
   if(closed||draining)c.deny('SESSION_LOST');draining=true;
   try{
    await Promise.all([...guards.values()].map(r=>r.session.send('Page.stopLoading').catch(()=>{})));await failPaused();
    const until=Date.now()+3000;
    while(installing.size||[...guards.values()].some(r=>r.active.size||r.paused.size)){
     lifetime.remaining();if(Date.now()>=until)c.deny('UNAVAILABLE');await new Promise(r=>setTimeout(r,20));
    }
    draining=false;
   }catch(error){closed=true;throw error;}
  },
  async close(){closed=true;await failPaused();await targets.detach().catch(()=>{});await Promise.all([...guards.values()].map(r=>r.session.detach().catch(()=>{})));guards.clear();},
 };
}
module.exports={applySessionGuard};
