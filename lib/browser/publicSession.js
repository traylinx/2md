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
const {createAuthentication}=require('./authentication');
const {extractionEvidence}=require('./evidence');
const {redactText}=require('../capture/redact');

// Session engine. Private mode requires protected runtime dependencies; never
// infer credential authority from the requested mode or from page content.
async function createPublicSession(browser,input,lifetime,{resolve=resolveTarget,protectedInput}={}) {
  if(!['public','login_read'].includes(input.mode))c.deny('UNSUPPORTED');
  if(input.mode==='login_read'&&(!protectedInput||['verifyDecision','getAuthDecision','credentialAccess'].some(k=>typeof protectedInput[k]!=='function')))c.deny('UNSUPPORTED');
  let guard;const secrets=[];
  const clean=value=>typeof value==='string'?redactText(value,secrets.map(b=>b.toString('utf8'))):Array.isArray(value)?value.map(clean):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clean(v)])):value;
  const policy=createSessionNetwork({sessionId:input.sessionId,limits:input.limits,navigation:input.navigation,lifetime,resolve,
    verifyDecision:protectedInput?.verifyDecision,requestDecision:protectedInput?.requestDecision,drainPublic:()=>guard.drainPublic()});
  const context=await browser.createBrowserContext(),page=await context.newPage();
  const pageId=randomUUID();const observations=new Observations(page,pageId);guard=await applySessionGuard(page,browser,policy,lifetime);
  await resolve(input.url,{deadline:lifetime});
  const response=await page.goto(input.url,{waitUntil:'domcontentloaded',timeout:input.limits.actionMs});
  if(!response||response.status()>=400)c.deny('UNAVAILABLE');
  const interactions=createInteractions({page,pageId,observations,async validateNavigation(url,deadline){
    const u=parseTarget(url);if(u.protocol!=='https:')c.deny('TARGET_DENIED');
    if(input.navigation.mode==='origins'&&!input.navigation.origins.includes(u.origin))c.deny('TARGET_DENIED');
    await resolve(url,{deadline});
  }});
  const authenticate=input.mode==='login_read'?createAuthentication({page,observations,network:policy,
    credentialAccess:(binding,use)=>protectedInput.credentialAccess(binding,async(secret)=>{
      if(secrets.length>=16)c.deny('LIMIT_EXCEEDED');secrets.push(Buffer.from(secret.password));return use(secret);
    })}):null;
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
    return {url,title:(await frame.evaluate(()=>document.title)).slice(0,2048),capturedAt:Date.now(),privacy:policy.state().phase==='private'?'private':'public'};
  }
  return {
    async execute(name,_request,deadline){
      lifetime.remaining();deadline.remaining();
      if(name==='browser_authenticate'){if(!authenticate)c.deny('UNSUPPORTED');const consent=await protectedInput.getAuthDecision(_request);return authenticate(_request,consent,deadline);}
      if(name==='browser_act'){await interactions.act(_request,deadline);return {state:'active'};}
      if(name==='browser_navigate'){await interactions.navigate(_request,deadline);return {state:'active'};}
      if(name==='browser_observe'){
        const frame=selected(_request);const state=await deadline.run(()=>frame.evaluate(readPageState));
        const snapshot=await deadline.run(()=>observations.observe(frame));
        return c.parseResult(name,clean({version:1,observationId:snapshot.observationId,pageId,source:await source(frame),
          state:state.challenge||state.password?'access_required':state.text.trim()?'ready':'loading',text:state.text.slice(0,100000),controls:snapshot.controls,links:snapshot.links,pages:[{pageId,title:(await page.title()).slice(0,2048)}],
          frames:frames().map(({frameId,supported})=>({frameId,supported})),warnings:[...guard.warnings,'CROSS_ORIGIN_FRAMES_UNSUPPORTED'],truncated:snapshot.truncated||state.text.length>100000||page.frames().length>32}));
      }
      if(name==='browser_extract'){
        if(_request.regionRef)c.deny('UNSUPPORTED');
        const frame=selected(_request);const html=await deadline.run(()=>frame.evaluate(renderedHtml));if(html===null)c.deny('LIMIT_EXCEEDED');
        const state=await deadline.run(()=>frame.evaluate(readPageState));
        const result=extract(html,frame.url(),state.text,secrets.map(b=>b.toString('utf8')));
        return c.parseResult(name,clean(extractionEvidence({source:await source(frame),markdown:result.markdown,
          warnings:[...guard.warnings,...result.warnings],state})));
      }
      c.deny('UNSUPPORTED');
    },
    async close(){policy.close();for(const secret of secrets)secret.fill(0);secrets.length=0;await observations.clear();await context.close();await guard.close();},
  };
}
module.exports={createPublicSession};
