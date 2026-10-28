'use strict';
const {randomUUID}=require('node:crypto');
const c=require('./contracts');
const {resolveTarget,parseTarget}=require('../capture/targetPolicy');
const {applyBrowserPolicy}=require('../capture/browserPolicy');
const {readPageState}=require('../capture/publicPageState');
const {renderedHtml}=require('../capture/browserCapture');
const {extract}=require('../capture/extract');

// Initial BROW-02 public-only engine. Interactions/private credentials are NOT
// enabled here. The isolated worker, not a caller-provided script, owns evaluation.
async function createPublicSession(browser,input,lifetime,{resolve=resolveTarget}={}) {
  if(input.mode!=='public')c.deny('UNSUPPORTED');
  let count=0,bytes=0;
  const policy={
    async allow({url,method,type,mainFrame}){
      lifetime.remaining();
      if(++count>input.limits.maxRequests)c.deny('LIMIT_EXCEEDED');
      if(!['GET','HEAD'].includes(method)||['websocket','eventsource','other','media'].includes(type)||type==='document'&&!mainFrame)c.deny('TARGET_DENIED');
      const u=parseTarget(url);if(u.protocol!=='https:')c.deny('TARGET_DENIED');
      if(type==='document'&&input.navigation.mode==='origins'&&!input.navigation.origins.includes(u.origin))c.deny('FORBIDDEN');
      return resolve(url,{deadline:lifetime});
    },
    received(n){bytes+=Math.max(0,n);if(bytes>input.limits.maxTrafficBytes)c.deny('LIMIT_EXCEEDED');},
  };
  const context=await browser.createBrowserContext(),page=await context.newPage();
  const pageId=randomUUID();const guard=await applyBrowserPolicy(page,browser,policy,lifetime);
  await resolve(input.url,{deadline:lifetime});
  const response=await page.goto(input.url,{waitUntil:'domcontentloaded',timeout:input.limits.actionMs});
  if(!response||response.status()>=400)c.deny('UNAVAILABLE');
  async function source(){
    const url=page.url();await resolve(url,{deadline:lifetime});
    return {url,title:(await page.title()).slice(0,2048),capturedAt:Date.now(),privacy:'public'};
  }
  return {
    async execute(name,_request,deadline){
      lifetime.remaining();deadline.remaining();
      if(name==='browser_observe'){
        const state=await deadline.run(()=>page.evaluate(readPageState));
        // Explicitly partial until BROW-03 installs actionable DOM references.
        return c.parseResult(name,{version:1,observationId:randomUUID(),pageId,source:await source(),
          state:'ready',text:state.text.slice(0,100000),controls:[],links:[],pages:[{pageId,title:(await page.title()).slice(0,2048)}],
          frames:[],warnings:[...guard.warnings,'INTERACTIVE_REFERENCES_UNAVAILABLE'],truncated:state.text.length>100000});
      }
      if(name==='browser_extract'){
        const html=await deadline.run(()=>page.evaluate(renderedHtml));if(html===null)c.deny('LIMIT_EXCEEDED');
        const state=await deadline.run(()=>page.evaluate(readPageState));
        const result=extract(html,page.url(),state.text);
        return c.parseResult(name,{source:await source(),markdown:result.markdown,evidence:[],quality:'degraded',
          warnings:[...new Set([...guard.warnings,...result.warnings,'SEMANTIC_EVIDENCE_PENDING'])],truncated:false});
      }
      c.deny('UNSUPPORTED');
    },
    async close(){await context.close();},
  };
}
module.exports={createPublicSession};
