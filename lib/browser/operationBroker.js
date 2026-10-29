'use strict';
const c=require('./contracts');
const {randomUUID}=require('node:crypto');
const decisionSchema=c.obj({sessionId:c.id,operationId:c.id,operationDigest:{type:'string',pattern:'^[a-f0-9]{64}$',minLength:64,maxLength:64},recipients:{type:'array',items:c.origin,minItems:1,maxItems:1,uniqueItems:true},expiresAt:c.num(1,Number.MAX_SAFE_INTEGER),nonce:c.id});
const requestSchema=c.obj({...decisionSchema.properties,reason:{enum:['recipient','operation']},method:{enum:['GET','HEAD','POST','OPTIONS']},origin:c.origin,type:c.str(32),bodyBytes:c.num(0,65536)});
// Parent-owned volatile coordination only. Bodies/URLs/credentials never enter it.
// Host approval is a signed exact decision, not a model tool argument.
function createOperationBroker({describeSession,verifyDecision,onPending,agentAuthorized=async()=>false,humanAuthorized=async()=>false,now=Date.now,maxEntries=32}={}){
 if([describeSession,verifyDecision,onPending].some(fn=>typeof fn!=='function')||!Number.isInteger(maxEntries)||maxEntries<1||maxEntries>32)c.deny('UNAVAILABLE');
 const entries=new Map();let closed=false;
 const key=(bound,id)=>c.scope(bound)+':'+id;
 function stop(r,error){if(entries.get(r.key)!==r)return;entries.delete(r.key);r.signal?.removeEventListener('abort',r.abort);r.reject(error);}
 function sweep(){for(const r of entries.values())if(r.record.expiresAt<=now())stop(r,new c.BrowserError('SESSION_LOST'));}
 const timer=setInterval(sweep,1000);timer.unref?.();
 async function fresh(r){
  try{const s=await describeSession(r.bound,r.record.sessionId);sweep();
   if(closed||entries.get(r.key)!==r)c.deny('SESSION_LOST');
   if(!s.ownerId||s.ownerId!==r.ownerId||s.expiresAt<=now())c.deny('PERMISSION_REQUIRED');return s;
  }catch(error){stop(r,error);throw error;}
 }
 function get(bound,id){sweep();const r=entries.get(key(bound,id));if(!r)c.deny('SESSION_LOST');return r;}
 const api={
  async request(bound,raw,{signal}={}){
   const b=c.binding(bound),record=c.parse(requestSchema,raw);
   if(record.recipients[0]!==record.origin||record.expiresAt<=now()||record.expiresAt>now()+120000)c.deny('PERMISSION_REQUIRED');
   if(signal?.aborted||closed)c.deny('CANCELLED');
   const session=await describeSession(b,record.sessionId);sweep();
   if(!session.ownerId||record.expiresAt>session.expiresAt)c.deny('PERMISSION_REQUIRED');
   if(signal?.aborted||closed)c.deny('CANCELLED');
   if(entries.size>=maxEntries)c.deny('CAPACITY');
   if([...entries.values()].some(r=>c.scope(r.bound)===c.scope(b)&&r.record.sessionId===record.sessionId))c.deny('BUSY');
   let resolve,reject;const result=new Promise((yes,no)=>{resolve=yes;reject=no;});result.catch(()=>{});
   const r={key:key(b,record.operationId),bound:b,record:c.frozen(record),ownerId:session.ownerId,resolve,reject,signal,proof:null,consumed:false,busy:false};
   r.abort=()=>stop(r,new c.BrowserError('CANCELLED'));entries.set(r.key,r);signal?.addEventListener('abort',r.abort,{once:true});
   try{await onPending(b,{sessionId:record.sessionId,interventionId:record.operationId,reason:record.reason==='recipient'?'recipient_consent':'operation_consent',expiresAt:record.expiresAt});await fresh(r);}
   catch(error){stop(r,error);throw error;}
   return result;
  },
  has(bound,id){return entries.has(key(bound,id));},
  async inspect(bound,id){const r=get(bound,id);await fresh(r);return c.frozen({...r.record,ownerId:r.ownerId});},
  async complete(bound,{operationId,proof},agent=false,human=null){
   const r=get(bound,operationId);const session=await fresh(r);if(session.handoffActive&&!human)c.deny('BUSY');
   if(r.busy||r.proof)c.deny('IDEMPOTENCY_CONFLICT');r.busy=true;
   try{
    if(typeof proof!=='string'||proof.length>8192)c.deny('INVALID_INPUT');
    const decision=c.parse(decisionSchema,Object.fromEntries(Object.keys(decisionSchema.properties).map(k=>[k,r.record[k]])));
    const accepted=human?(await humanAuthorized(bound,human)===true?decision:null):agent?(await agentAuthorized(bound)===true?decision:null):await verifyDecision(proof,r.bound,decision);await fresh(r);
    if(!accepted||accepted.sessionId!==decision.sessionId||accepted.operationId!==decision.operationId||c.digest(accepted.recipients)!==c.digest(decision.recipients))c.deny('PERMISSION_REQUIRED');
    r.source=human?'human_takeover':agent?'agent_supplied':'paired_owner';r.human=human;r.proof=proof;r.resolve(proof);return {prepared:true};
   }finally{r.busy=false;}
  },
  async completeAgent(bound,{operationId,operationDigest}){
   const r=get(bound,operationId);await fresh(r);
   if(operationDigest!==r.record.operationDigest||await agentAuthorized(bound)!==true)c.deny('PERMISSION_REQUIRED');
   return api.complete(bound,{operationId,proof:'agent:'+randomUUID()},true);
  },
  async completeHuman(bound,input){
   const r=get(bound,input.operationId);await fresh(r);
   if(r.record.sessionId!==input.sessionId||r.record.operationDigest!==input.operationDigest||await humanAuthorized(bound,input)!==true)c.deny('FORBIDDEN');
   return api.complete(bound,{operationId:input.operationId,proof:'human:'+randomUUID()},false,{sessionId:input.sessionId,handoffId:input.handoffId});
  },
  async verified(bound,proof,decision){
   const r=get(bound,decision.operationId);await fresh(r);
   if(r.source==='human_takeover'&&await humanAuthorized(bound,r.human)!==true)c.deny('PERMISSION_REQUIRED');
   if(r.source==='agent_supplied'&&await agentAuthorized(bound)!==true)c.deny('PERMISSION_REQUIRED');
   if(!r.proof||r.proof!==proof||r.consumed)c.deny('PERMISSION_REQUIRED');
   const exact=c.parse(decisionSchema,Object.fromEntries(Object.keys(decisionSchema.properties).map(k=>[k,r.record[k]])));
   if(c.digest(decision)!==c.digest(exact))c.deny('PERMISSION_REQUIRED');
   r.consumed=true;entries.delete(r.key);r.signal?.removeEventListener('abort',r.abort);return exact;
  },
  async cancel(bound,id){const r=get(bound,id);stop(r,new c.BrowserError('CANCELLED'));return {cancelled:true};},
  discardSession(bound,sessionId){for(const r of entries.values())if(c.scope(r.bound)===c.scope(bound)&&r.record.sessionId===sessionId)stop(r,new c.BrowserError('SESSION_LOST'));},
  close(){closed=true;clearInterval(timer);for(const r of entries.values())stop(r,new c.BrowserError('SESSION_LOST'));},
 };
 return Object.freeze(api);
}
module.exports={createOperationBroker,decisionSchema,requestSchema};
