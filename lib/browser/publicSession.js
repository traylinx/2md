'use strict';
const {randomUUID}=require('node:crypto');
const c=require('./contracts');
const {resolveTarget,parseTarget}=require('../capture/targetPolicy');
const {applySessionGuard}=require('./browserGuard');
const {readPageState}=require('../capture/publicPageState');
const {renderedHtml}=require('../capture/browserCapture');
const {extract}=require('../capture/extract');
const {Observations}=require('./observations');
const {createInteractions}=require('./interactions');
const {createSessionNetwork}=require('./networkPolicy');

// Public session engine. Private credentials are not enabled here. The isolated worker, not a caller-provided script, owns evaluation.
async function createPublicSession(browser,input,lifetime,{resolve=resolveTarget}={}) {
  if(input.mode!=='public')c.deny('UNSUPPORTED');
  const policy=createSessionNetwork({sessionId:input.sessionId,limits:input.limits,navigation:input.navigation,lifetime,resolve});
  const context=await browser.createBrowserContext(),page=await context.newPage();
  const pageId=randomUUID();const observations=new Observations(page,pageId);const guard=await applySessionGuard(page,browser,policy,lifetime);
  await resolve(input.url,{deadline:lifetime});
  const response=await page.goto(input.url,{waitUntil:'domcontentloaded',timeout:input.limits.actionMs});
  if(!response||response.status()>=400)c.deny('UNAVAILABLE');
  const interactions=createInteractions({page,pageId,observations,async validateNavigation(url,deadline){
    const u=parseTarget(url);if(u.protocol!=='https:')c.deny('TARGET_DENIED');
    if(input.navigation.mode==='origins'&&!input.navigation.origins.includes(u.origin))c.deny('TARGET_DENIED');
    await resolve(url,{deadline});
  }});
  const frameIds=new WeakMap();
  function frames(){return page.frames().slice(0,32).map(frame=>{
    if(!frameIds.has(frame))frameIds.set(frame,randomUUID());
    let supported=false;try{supported=new URL(frame.url()).origin===new URL(page.url()).origin;}catch{}
    return {frame,frameId:frameIds.get(frame),supported};
  });}
  function selected(request){
    if(request.pageId&&request.pageId!==pageId)c.deny('FORBIDDEN');
    if(!request.frameId)return page.mainFrame();
    const frame=frames().find(f=>f.frameId===request.frameId);
    if(!frame||!frame.supported)c.deny('UNSUPPORTED');return frame.frame;
  }
  async function source(frame=page.mainFrame()){
    const url=frame.url();await resolve(url,{deadline:lifetime});
    return {url,title:(await frame.evaluate(()=>document.title)).slice(0,2048),capturedAt:Date.now(),privacy:'public'};
  }
  return {
    async execute(name,_request,deadline){
      lifetime.remaining();deadline.remaining();
      if(name==='browser_act'){await interactions.act(_request,deadline);return {state:'active'};}
      if(name==='browser_navigate'){await interactions.navigate(_request,deadline);return {state:'active'};}
      if(name==='browser_observe'){
        const frame=selected(_request);const state=await deadline.run(()=>frame.evaluate(readPageState));
        const snapshot=await deadline.run(()=>observations.observe(frame));
        return c.parseResult(name,{version:1,observationId:snapshot.observationId,pageId,source:await source(frame),
          state:state.challenge||state.password?'access_required':state.text.trim()?'ready':'loading',text:state.text.slice(0,100000),controls:snapshot.controls,links:snapshot.links,pages:[{pageId,title:(await page.title()).slice(0,2048)}],
          frames:frames().map(({frameId,supported})=>({frameId,supported})),warnings:[...guard.warnings,'CROSS_ORIGIN_FRAMES_UNSUPPORTED'],truncated:snapshot.truncated||state.text.length>100000||page.frames().length>32});
      }
      if(name==='browser_extract'){
        if(_request.regionRef)c.deny('UNSUPPORTED');
        const frame=selected(_request);const html=await deadline.run(()=>frame.evaluate(renderedHtml));if(html===null)c.deny('LIMIT_EXCEEDED');
        const state=await deadline.run(()=>frame.evaluate(readPageState));
        const result=extract(html,frame.url(),state.text);
        return c.parseResult(name,{source:await source(frame),markdown:result.markdown,evidence:[],quality:'degraded',
          warnings:[...new Set([...guard.warnings,...result.warnings,'SEMANTIC_EVIDENCE_PENDING'])],truncated:false});
      }
      c.deny('UNSUPPORTED');
    },
    async close(){policy.close();await observations.clear();await context.close();await guard.close();},
  };
}
module.exports={createPublicSession};
