'use strict';
const {createHash}=require('node:crypto');
const c=require('./contracts');
const hash=s=>createHash('sha256').update(s).digest('hex');
const codes=new Set(['INPUT_INVALID','TARGET_DENIED','PROOF_UNAVAILABLE','UNAUTHENTICATED','FORBIDDEN','DEADLINE_EXCEEDED','CANCELLED','DEPENDENCY_UNAVAILABLE','RESPONSE_INVALID','RESPONSE_TOO_LARGE','NOT_ATTEMPTED']);
// Validate before publication. Markdown remains untrusted text, never executable HTML.
function readResult(value, plan) {
  const p=c.plan(plan);
  c.exact(value,['state','manifest','pages',...(Object.hasOwn(value||{},'collectionWindow')?['collectionWindow']:[])]);
  let collectionWindow;
  if(value.collectionWindow!==undefined){
    c.exact(value.collectionWindow,['startedAt','finishedAt']);
    const {startedAt,finishedAt}=value.collectionWindow;
    if(!Number.isSafeInteger(startedAt)||!Number.isSafeInteger(finishedAt)||startedAt<=0||finishedAt<startedAt||finishedAt>Date.now()+1000)c.deny('INVALID_RESULT');
    collectionWindow=Object.freeze({startedAt,finishedAt});
  }
  c.exact(value.manifest,['version','serviceAgentId','urls','sha256']);
  const m=value.manifest;
  if(m.version!==1 || typeof m.serviceAgentId!=='string' || JSON.stringify(m.urls)!==JSON.stringify(p.urls) ||
     m.sha256!==hash(JSON.stringify([1,m.serviceAgentId,m.urls]))) c.deny('INVALID_RESULT');
  c.identifier(m.serviceAgentId);
  if(!Array.isArray(value.pages) || value.pages.length!==p.urls.length) c.deny('INVALID_RESULT');
  const pages=value.pages.map((page,i)=>{
    if(page?.url!==p.urls[i]) c.deny('INVALID_RESULT');
    if(page.success===true) {
      c.exact(page,['url','success','finalUrl','markdown','sha256','quality']);
      if(!p.urls.includes(page.finalUrl) || typeof page.markdown!=='string' || !page.markdown.trim() ||
         Buffer.byteLength(page.markdown)>p.maxResponseBytes || page.sha256!==hash(page.markdown) ||
         !['complete','degraded','unknown'].includes(page.quality)) c.deny('INVALID_RESULT');
      return Object.freeze({...page});
    }
    c.exact(page,['url','success','code']);
    if(page.success!==false || !codes.has(page.code)) c.deny('INVALID_RESULT');
    return Object.freeze({...page});
  });
  const successes=pages.filter(p=>p.success).length;
  const state=successes===pages.length?'complete':successes?'partial':'failed';
  if(value.state!==state) c.deny('INVALID_RESULT');
  const result={state,manifest:{...m,urls:[...p.urls]},pages,...(collectionWindow?{collectionWindow}:{})};
  // Aggregate bound separate from the per-page capture limit; fail closed.
  if(Buffer.byteLength(JSON.stringify(result))>2*1024*1024) c.deny('INVALID_RESULT');
  return Object.freeze(result);
}
module.exports={readResult};
