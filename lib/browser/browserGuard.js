'use strict';
const c=require('./contracts');

// Additive session guard. Legacy capture CSP/interception remain unchanged.
async function applySessionGuard(page,browser,policy,lifetime){
  const session=await page.createCDPSession(),warnings=new Set(),active=new Set(),paused=new Set();
  let draining=false,closed=false;
  await page.setBypassServiceWorker(true);await page.setCacheEnabled(false);
  await session.send('Network.enable',{maxPostDataSize:65537});
  await session.send('Network.setBypassServiceWorker',{bypass:true});
  await session.send('Page.setDownloadBehavior',{behavior:'deny'});
  await session.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'},{urlPattern:'*',requestStage:'Response'}]});
  const {frameTree}=await session.send('Page.getFrameTree'),mainFrame=frameTree.frame.id;
  session.on('Network.requestWillBeSent',e=>active.add(e.requestId));
  for(const event of ['Network.loadingFinished','Network.loadingFailed'])session.on(event,e=>active.delete(e.requestId));
  session.on('Network.dataReceived',e=>{try{policy.received(e.dataLength);}catch(error){if(!draining)lifetime.abort(error.code||'LIMIT_EXCEEDED');}});
  const fail=id=>session.send('Fetch.failRequest',{requestId:id,errorReason:'BlockedByClient'}).catch(()=>{});
  session.on('Fetch.requestPaused',event=>{
    paused.add(event.requestId);
    void handle(event).catch(()=>{if(!draining&&!closed)lifetime.abort('UPSTREAM_FAILED');}).finally(()=>paused.delete(event.requestId));
  });
  async function handle(event){
    const id=event.requestId,request=event.request,document=event.resourceType==='Document',main=event.frameId===mainFrame;
    try{
      lifetime.remaining();if(draining||closed)return await fail(id);
      if(event.responseStatusCode||event.responseErrorReason){
        if(event.responseErrorReason)c.deny('TARGET_DENIED');
        let headers=event.responseHeaders||[];
        if(document){
          if(headers.some(h=>h.name.toLowerCase()==='content-disposition'&&/attachment/i.test(h.value)))c.deny('TARGET_DENIED');
          headers=headers.filter(h=>!['report-to','nel','refresh'].includes(h.name.toLowerCase()));
          // self frames only until OOPIF guards are implemented. Form transport
          // is decided at request interception, not by a preconfigured recipe.
          headers.push({name:'Content-Security-Policy',value:"worker-src 'none'; frame-src 'self'; object-src 'none'; base-uri 'none'; manifest-src 'none'; form-action https:"});
        }
        return await session.send('Fetch.continueResponse',{requestId:id,responseCode:event.responseStatusCode,responseHeaders:headers});
      }
      if(document&&!main){
        const parent=new URL(page.url());if(new URL(request.url).origin!==parent.origin)c.deny('TARGET_DENIED');
      }
      let body=request.postData||'';
      if(request.hasPostData&&request.postData===undefined){
        if(!event.networkId)c.deny('LIMIT_EXCEEDED');
        body=(await session.send('Network.getRequestPostData',{requestId:event.networkId})).postData;
        if(typeof body!=='string')c.deny('LIMIT_EXCEEDED');
      }
      if(Buffer.byteLength(body)>65536)c.deny('LIMIT_EXCEEDED');
      const upload=Object.entries(request.headers||{}).some(([k,v])=>k.toLowerCase()==='content-type'&&/multipart\/form-data/i.test(String(v)));
      await policy.allow({url:request.url,method:request.method,type:event.resourceType.toLowerCase(),mainFrame:main,body,upload});
      // Phase change may start while the asynchronous policy waits.
      if(draining||closed)return await fail(id);
      await session.send('Fetch.continueRequest',{requestId:id});
    }catch(error){
      await fail(id);warnings.add(error.code==='RECIPIENT_PERMISSION_REQUIRED'?'RECIPIENT_PERMISSION_REQUIRED':'RESOURCE_BLOCKED');
      if(!draining&&(error.code==='LIMIT_EXCEEDED'||lifetime.signal.aborted))lifetime.abort(error.code||'TARGET_DENIED');
    }
  }
  const targets=await browser.target().createCDPSession();
  const current=(await session.send('Target.getTargetInfo')).targetInfo.targetId;
  targets.on('Target.attachedToTarget',event=>{if(event.targetInfo.targetId!==current)void targets.send('Target.closeTarget',{targetId:event.targetInfo.targetId}).catch(()=>{});});
  await targets.send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true,filter:[{type:'browser',exclude:true},{type:'page'},{type:'service_worker'},{type:'shared_worker'},{type:'worker'}]});
  await page.evaluateOnNewDocument(()=>{
    window.open=()=>null;const deny=()=>{throw Error('BROWSER_POLICY');};
    for(const name of ['WebSocket','EventSource','Worker','SharedWorker','RTCPeerConnection','webkitRTCPeerConnection'])Object.defineProperty(window,name,{value:deny,configurable:false,writable:false});
    if(navigator.serviceWorker)navigator.serviceWorker.register=deny;navigator.sendBeacon=()=>false;
  });
  return {warnings,
    async drainPublic(){
      if(closed||draining)c.deny('SESSION_LOST');draining=true;
      // Stop document and subresource loads, fail paused requests, then wait for
      // Chromium's completion/failure events. No claim based on a fixed sleep.
      try{
        await session.send('Page.stopLoading');await Promise.all([...paused].map(fail));
        const until=Date.now()+3000;
        while(active.size||paused.size){lifetime.remaining();if(Date.now()>=until)c.deny('UNAVAILABLE');await new Promise(r=>setTimeout(r,20));}
        draining=false;
      }catch(error){closed=true;throw error;}
    },
    async close(){closed=true;await Promise.all([...paused].map(fail));await targets.detach().catch(()=>{});await session.detach().catch(()=>{});},
  };
}
module.exports={applySessionGuard};
