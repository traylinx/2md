'use strict';
const c=require('./contracts');
const {describeElement}=require('./observations');

// Fixed worker primitives, not a selector/script escape hatch. Network policy
// remains authoritative: semantic checks alone cannot prove a JS click read-only.
function createInteractions({page,pageId,observations,validateNavigation}) {
  async function act(request,deadline){
    const {action,observationId}=request;
    if(observationId!==observations.observationId)c.deny('STALE_REFERENCE');
    if(action.type==='select_page'){
      if(action.pageId!==pageId)c.deny('UNSUPPORTED');
      return;
    }
    if(action.type==='wait'){await deadline.sleep(action.milliseconds);return;}
    if(action.type==='scroll'){
      await deadline.run(()=>observations.page.evaluate(y=>window.scrollBy(0,y),action.deltaY));return;
    }
    const handle=await deadline.run(()=>observations.resolve(observationId,action.ref));
    const meta=await handle.evaluate(describeElement);
    if(action.type==='fill'){
      // Credentials belong exclusively to protected input, never browser_act.
      const secret=await handle.evaluate(el=>el.type==='password'||el.type==='file'||/password|one-time-code|cc-|webauthn/.test(el.autocomplete||''));
      if(secret)c.deny('PROTECTED_INPUT_REQUIRED');
      if(!['input','textarea'].includes(meta.tag)||meta.tag==='input'&&!['text','email','search','url','tel','number'].includes(meta.type))c.deny('UNSUPPORTED');
      await deadline.run(()=>handle.evaluate((el,text)=>{
        const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto,'value').set.call(el,text);
        el.dispatchEvent(new Event('input',{bubbles:true,composed:true}));
        el.dispatchEvent(new Event('change',{bubbles:true}));
      },action.text));return;
    }
    if(action.type==='select'){
      if(meta.tag!=='select')c.deny('UNSUPPORTED');
      await deadline.run(()=>handle.select(...action.values));return;
    }
    if(action.type==='click'){
      const prohibited=await handle.evaluate(el=>el.hasAttribute('download')||el.type==='file'||!!el.form&&(el.type==='submit'||el.type==='reset'));
      if(prohibited)c.deny('OPERATION_PERMISSION_REQUIRED');
      if(/\b(delete|remove|send|purchase|buy|pay|subscribe|unsubscribe|logout|log out|sign out|publish|save|transfer|cancel subscription)\b/i.test(meta.name))c.deny('OPERATION_PERMISSION_REQUIRED');
      if(meta.href)await validateNavigation(meta.href,deadline);
      // Validate again after async DNS/permission check; never retarget.
      await observations.resolve(observationId,action.ref);
      await deadline.run(()=>handle.click());
      // Keep command/receipt ownership through requests triggered by the click.
      // Active deadline (and session TTL) bounds this wait, including owner pauses.
      await deadline.run(()=>page.waitForNetworkIdle({idleTime:500,timeout:0}));return;
    }
    c.deny('UNSUPPORTED');
  }
  async function navigate(request,deadline){
    let url=request.target.url;
    if(request.target.back){
      const session=await page.createCDPSession();
      try{const history=await session.send('Page.getNavigationHistory');url=history.entries[history.currentIndex-1]?.url;}finally{await session.detach();}
      if(!url)c.deny('TARGET_DENIED');
    }
    await validateNavigation(url,deadline);await observations.clear();
    const options={waitUntil:'domcontentloaded',timeout:0};
    const response=await deadline.run(()=>request.target.back?page.goBack(options):page.goto(url,options));
    if(response&&response.status()>=400)c.deny('UNAVAILABLE');
  }
  return {act,navigate};
}
module.exports={createInteractions};
