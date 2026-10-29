'use strict';
const {randomUUID}=require('node:crypto');
const c=require('./contracts');
const {resolveTarget,parseTarget}=require('../capture/targetPolicy');
const {applySessionGuard}=require('./browserGuard');
const {readBrowserPageState:readPageState}=require('./pageState');
const {renderedDocument}=require('./renderedDocument');
const {extract}=require('../capture/extract');
const {Observations}=require('./observations');
const {createInteractions}=require('./interactions');
const {createSessionNetwork}=require('./networkPolicy');
const {createAuthentication}=require('./authentication');
const {extractionEvidence}=require('./evidence');
const {redactOutput}=require('./outputRedaction');
const {waitForVerification,verificationWarnings}=require('./verification');

// Session engine. Private mode requires protected runtime dependencies; never
// infer credential authority from the requested mode or from page content.
async function createPublicSession(browser,input,lifetime,{resolve=resolveTarget,protectedInput,initialDeadline,onStage=()=>{}}={}) {
  if(!['public','login_read'].includes(input.mode))c.deny('UNSUPPORTED');
  if(input.mode==='login_read'&&(!protectedInput||['verifyDecision','getAuthDecision','credentialAccess'].some(k=>typeof protectedInput[k]!=='function')))c.deny('UNSUPPORTED');
  let guard;const secrets=[];
  const clean=value=>redactOutput(value,secrets.map(b=>b.toString('utf8')));
  const policy=createSessionNetwork({sessionId:input.sessionId,limits:input.limits,navigation:input.navigation,lifetime,resolve,
    verifyDecision:protectedInput?.verifyDecision,requestDecision:protectedInput?.requestDecision,drainPublic:()=>guard.drainPublic()});
  const context=await browser.createBrowserContext(),page=await context.newPage();
  if(input.humanEnabled)await page.setViewport({width:1280,height:800,deviceScaleFactor:1});
  const pageId=randomUUID();const observations=new Observations(page,pageId);guard=await applySessionGuard(page,browser,policy,lifetime,{embeddedFrames:input.embeddedFrames===true});
  await resolve(input.url,{deadline:lifetime});
  const load=()=>page.goto(input.url,{waitUntil:'domcontentloaded',timeout:initialDeadline?0:input.limits.actionMs});
  const response=initialDeadline?await initialDeadline.run(load):await load();
  if(initialDeadline)await require('./settle').settlePage(page,initialDeadline,{pending:()=>policy.state().pending,warnings:guard.warnings});
  if(!response)c.deny('UNAVAILABLE');
  if(response.status()>=400){
    // Some sites serve their verification interstitial with 403/503. Preserve
    // that observable state, but never turn an unrelated HTTP error into success.
    const state=initialDeadline?await initialDeadline.run(()=>page.evaluate(readPageState)):await page.evaluate(readPageState);
    if(!['pending','interactive','failed'].includes(state.verification))c.deny('UNAVAILABLE');
    guard.warnings.add('INITIAL_HTTP_ERROR');
  }
  const interactions=createInteractions({page,pageId,observations,pending:()=>policy.state().pending,warnings:guard.warnings,async validateNavigation(url,deadline){
    const u=parseTarget(url);if(u.protocol!=='https:')c.deny('TARGET_DENIED');
    if(input.navigation.mode==='origins'&&!input.navigation.origins.includes(u.origin))c.deny('TARGET_DENIED');
    await resolve(url,{deadline});
  }});
  const authenticate=input.mode==='login_read'?createAuthentication({page,observations,network:policy,warnings:guard.warnings,onStage,
    credentialAccess:(binding,use)=>protectedInput.credentialAccess(binding,async(secret)=>{
      const values=Array.isArray(secret)?secret:Object.hasOwn(secret,'field_0')?Object.values(secret):[secret.password];
      if(secrets.length+values.length>400)c.deny('LIMIT_EXCEEDED');secrets.push(...values.filter(b=>b.length).map(b=>Buffer.from(b)));return use(secret);
    })}):null;
  const human=require('./humanSession').createHumanSession({page,network:policy,observations,warnings:guard.warnings,enabled:input.humanEnabled===true&&input.mode==='login_read',remember:text=>{if(secrets.length>=400)c.deny('LIMIT_EXCEEDED');secrets.push(Buffer.from(text));}});
  const frameIds=new WeakMap();
  function frames(){return page.frames().slice(0,32).map(frame=>{
    if(!frameIds.has(frame))frameIds.set(frame,randomUUID());
    let supported=false;try{const u=new URL(frame.url());supported=u.protocol==='https:'&&(input.embeddedFrames===true||u.origin===new URL(page.url()).origin);}catch{}
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
    return {url,title:(await frame.evaluate(()=>document.title)).slice(0,2048),capturedAt:Date.now(),privacy:policy.state().phase==='private'?'private':'public'};
  }
  return {
    async execute(name,_request,deadline){
      lifetime.remaining();deadline.remaining();
      if(name.startsWith('human_'))return human.execute(name,_request,deadline);
      if(name==='browser_authenticate'){if(!authenticate)c.deny('UNSUPPORTED');onStage('auth_decision');const consent=await protectedInput.getAuthDecision(_request);return authenticate(_request,consent,deadline);}
      if(name==='browser_act'){await interactions.act(_request,deadline);return {state:'active'};}
      if(name==='browser_navigate'){await interactions.navigate(_request,deadline);return {state:'active'};}
      if(name==='browser_observe'){
        const frame=selected(_request);const state=await waitForVerification(frame,deadline);
        const snapshot=await deadline.run(()=>observations.observe(frame));
        return c.parseResult(name,clean({version:1,observationId:snapshot.observationId,pageId,source:await source(frame),
          state:state.verification==='pending'?'loading':state.challenge||state.password?'access_required':state.text.trim()?'ready':'loading',text:state.text.slice(0,100000),controls:snapshot.controls,links:snapshot.links,regions:snapshot.regions,pages:[{pageId,title:(await page.title()).slice(0,2048)}],
          frames:frames().map(({frameId,supported})=>({frameId,supported})),warnings:[...guard.warnings,...verificationWarnings(state),...(frames().some(f=>!f.supported)?['CROSS_ORIGIN_FRAMES_UNSUPPORTED']:[])],truncated:snapshot.truncated||state.truncated||state.text.length>100000||page.frames().length>32}));
      }
      if(name==='browser_extract'){
        const frame=selected(_request);const state=await waitForVerification(frame,deadline);let html,regionText;
        if(_request.regionRef){
          if(frame!==observations.page)c.deny('STALE_REFERENCE');
          const handle=await deadline.run(()=>observations.resolve(observations.observationId,_request.regionRef));
          const region=await deadline.run(()=>handle.evaluate(require('./regionExtraction').renderedRegion));
          if(!region)c.deny('UNSUPPORTED');html=region.html;regionText=region.text;
        }else html=await deadline.run(()=>frame.evaluate(renderedDocument));
        if(html===null)c.deny('LIMIT_EXCEEDED');
        const result=extract(html,frame.url(),_request.regionRef?regionText:state.text,secrets.map(b=>b.toString('utf8')),{fullDocument:true});
        return c.parseResult(name,clean(extractionEvidence({source:await source(frame),markdown:result.markdown,
          warnings:[...guard.warnings,...result.warnings,...verificationWarnings(state)],state})));
      }
      c.deny('UNSUPPORTED');
    },
    async close(){policy.close();for(const secret of secrets)secret.fill(0);secrets.length=0;await observations.clear();await context.close();await guard.close();},
  };
}
module.exports={createPublicSession};
