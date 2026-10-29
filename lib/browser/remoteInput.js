'use strict';
const {randomUUID}=require('node:crypto');
const c=require('./contracts');
const fields=require('./fieldInput');
// Ephemeral runtime broker. Endpoints are host-only, never registered as MCP tools.
function createRemoteInput({describeSession,verifyCompletion,verifyDecision,agentAuthorized=async()=>false,now=Date.now,maxEntries=32}={}){
 if([describeSession,verifyCompletion,verifyDecision].some(f=>typeof f!=='function'))c.deny('UNAVAILABLE');
 const credentials=new Map(),decisions=new Map();
 function erase(record){if(record.secret)Object.values(record.secret).forEach(b=>b.fill(0));record.secret=null;credentials.delete(record.id);}
 function sweep(){for(const r of credentials.values())if(r.expiresAt<=now())erase(r);for(const [id,r]of decisions)if(r.expiresAt<=now())decisions.delete(id);}
 async function session(bound,id){const value=await describeSession(bound,id);if(value.handoffActive)c.deny('BUSY');if(value.mode!=='login_read'||!value.ownerId||value.expiresAt<=now())c.deny('PERMISSION_REQUIRED');return value;}
 function own(bound,id){sweep();const r=credentials.get(id);if(!r)c.deny('SESSION_LOST');if(r.scope!==c.scope(bound))c.deny('FORBIDDEN');return r;}
 const timer=setInterval(sweep,1000);timer.unref?.();
 const api={
  async request({bound,input,session:known}){
   c.parseTool('browser_credentials',input);const s=await session(bound,input.sessionId);if(known&&known.ownerId!==s.ownerId)c.deny('FORBIDDEN');sweep();
   const scope=c.scope(bound);let r=[...credentials.values()].find(x=>x.scope===scope&&x.sessionId===input.sessionId);
   if(r&&(r.origin!==input.origin||r.purpose!==input.purpose||!fields.matches(r,input)))c.deny('BUSY');
   if(!r){if(credentials.size>=maxEntries)c.deny('CAPACITY');r={id:randomUUID(),sessionId:input.sessionId,scope,bound:c.binding(bound),origin:input.origin,purpose:input.purpose,...fields.selection(input),ownerId:s.ownerId,recipients:[input.origin],expiresAt:Math.min(s.expiresAt,now()+120000),secret:null};credentials.set(r.id,r);}
   return r.secret?{state:'ready',credentialRef:r.id,expiresAt:r.expiresAt}:{state:'needs_input',interventionId:r.id,reason:'credentials',expiresAt:r.expiresAt};
  },
  async inspect(bound,id){const r=own(bound,id);await session(bound,r.sessionId);return c.frozen({interventionId:r.id,sessionId:r.sessionId,origin:r.origin,purpose:r.purpose,...fields.selection(r),ownerId:r.ownerId,recipients:[...r.recipients],expiresAt:r.expiresAt});},
  async supply(bound,{interventionId,username,password,values,proof},agent=false){
   const r=own(bound,interventionId);await session(bound,r.sessionId);
   if(r.secret)c.deny('IDEMPOTENCY_CONFLICT');
   if(Array.isArray(r.fields)){if(username!==undefined||password!==undefined)c.deny('INVALID_INPUT');fields.validateValues(r,values);}
   else {if(values!==undefined)c.deny('INVALID_INPUT');c.validate({type:'string',maxLength:4096},username);c.validate(c.str(4096),password);}
   // Completion proof must bind the paired owner, session, recipients and entry.
   if(agent){if(await agentAuthorized(bound)!==true||!Array.isArray(r.fields))c.deny('PERMISSION_REQUIRED');}
   else if(await verifyCompletion(proof,bound,{interventionId:r.id,sessionId:r.sessionId,ownerId:r.ownerId,origin:r.origin,recipients:r.recipients,expiresAt:r.expiresAt,...fields.selection(r)})!==true)c.deny('PERMISSION_REQUIRED');
   if(own(bound,interventionId)!==r||r.secret)c.deny('IDEMPOTENCY_CONFLICT');await session(bound,r.sessionId);
   if(r.expiresAt<=now()||credentials.get(r.id)!==r)c.deny('SESSION_LOST');
   if(r.secret)c.deny('IDEMPOTENCY_CONFLICT');
   r.source=agent?'agent_supplied':'paired_owner';
   r.secret=Array.isArray(r.fields)?fields.buffers(r,values):{username:Buffer.from(username),password:Buffer.from(password)};
   return {state:'ready',credentialRef:r.id,expiresAt:r.expiresAt};
  },
  async prepare(bound,{request,proof,decision,recipients},agent=false){
   c.parseTool('browser_authenticate',request);
   c.validate(c.obj({sessionId:c.id,operationId:c.id,operationDigest:{type:'string',pattern:'^[a-f0-9]{64}$',minLength:64,maxLength:64},recipients:{type:'array',items:c.origin,minItems:1,maxItems:32,uniqueItems:true},nonce:c.id,expiresAt:c.num(1,Number.MAX_SAFE_INTEGER)}),decision);
   if(decision.expiresAt<=now()||decision.expiresAt>now()+120000)c.deny('PERMISSION_REQUIRED');const r=own(bound,request.credentialRef);await session(bound,request.sessionId);
   if(agent&&(r.source!=='agent_supplied'||await agentAuthorized(bound)!==true))c.deny('PERMISSION_REQUIRED');
   if(!fields.matches(r,request))c.deny('PERMISSION_REQUIRED');
   if(!r.secret||r.sessionId!==request.sessionId||decision.sessionId!==request.sessionId||decision.operationId!==request.actionId||decision.operationDigest!==c.digest(request)||c.digest(decision.recipients)!==c.digest(recipients)||!recipients.includes(r.origin))c.deny('PERMISSION_REQUIRED');
   c.validate({type:'array',items:c.origin,minItems:1,maxItems:32,uniqueItems:true},recipients);
   const key=c.scope(bound)+':'+request.actionId;const prior=decisions.get(key);
   if(prior){if(prior.digest!==c.digest(request))c.deny('IDEMPOTENCY_CONFLICT');return {prepared:true};}
   if(decisions.size>=maxEntries)c.deny('CAPACITY');
   // Signature/nonce verified by worker policy immediately before private phase;
   // preparing unverified bytes confers no authority and cannot consume a secret.
   if(typeof proof!=='string'||proof.length>8192)c.deny('INVALID_INPUT');
   decisions.set(key,{bound:c.binding(bound),request:c.frozen(request),digest:c.digest(request),proof,decision:c.frozen(decision),recipients:c.frozen([...recipients]),expiresAt:Math.min(r.expiresAt,decision.expiresAt||r.expiresAt),verified:false,source:agent?'agent_supplied':'paired_owner'});
   return {prepared:true};
  },
  async supplyAgent(bound,input){return api.supply(bound,input,true);},
  async prepareAgent(bound,{request}){
   const r=own(bound,request.credentialRef);
   if(r.source!=='agent_supplied'||await agentAuthorized(bound)!==true)c.deny('PERMISSION_REQUIRED');
   const decision={sessionId:request.sessionId,operationId:request.actionId,operationDigest:c.digest(request),recipients:[r.origin],nonce:randomUUID(),expiresAt:Math.min(r.expiresAt,now()+60000)};
   // Internal single-use marker, NOT a human completion/consent signature.
   return api.prepare(bound,{request,decision,recipients:decision.recipients,proof:'agent:'+randomUUID()},true);
  },
  provider(bound){return {
   async getAuthDecision(request){await session(bound,request.sessionId);sweep();const r=decisions.get(c.scope(bound)+':'+request.actionId);if(!r||r.digest!==c.digest(request))c.deny('PROTECTED_INPUT_REQUIRED');return {proof:r.proof,decision:r.decision,recipients:r.recipients};},
   async verifyDecision(proof,record){
    await session(bound,record.sessionId);sweep();const r=decisions.get(c.scope(bound)+':'+record.operationId);
    if(!r||r.proof!==proof||c.digest(r.decision)!==c.digest(record)||r.verified)c.deny('PERMISSION_REQUIRED');
    const accepted=r.source==='agent_supplied'?(await agentAuthorized(bound)===true?record:null):await verifyDecision(proof,bound,record);if(!accepted||accepted.sessionId!==record.sessionId||accepted.operationId!==record.operationId||c.digest(accepted.recipients)!==c.digest(r.recipients))c.deny('PERMISSION_REQUIRED');
    if(r.expiresAt<=now()||decisions.get(c.scope(bound)+':'+record.operationId)!==r)c.deny('SESSION_LOST');r.verified=true;return accepted;
   },
   async credentialAccess(binding,use){
    const r=own(bound,binding.credentialRef);await session(bound,r.sessionId);
    const match=[...decisions.entries()].find(([,d])=>d.verified&&d.request.credentialRef===binding.credentialRef&&c.scope(d.bound)===c.scope(bound));
    if(!r.secret||!match||binding.sessionId!==r.sessionId||binding.origin!==r.origin||c.digest(binding.recipients)!==c.digest(match[1].recipients))c.deny('PERMISSION_REQUIRED');
    if(match[1].source==='agent_supplied'&&await agentAuthorized(bound)!==true){erase(r);c.deny('PERMISSION_REQUIRED');}
    const usernameOnly=!Array.isArray(match[1].request.fields)&&!match[1].request.fields.passwordRef;
    if(usernameOnly&&r.usernameSubmitted)c.deny('PERMISSION_REQUIRED');
    decisions.delete(match[0]);
    if(usernameOnly){
     // Email-first stage: never send the password across IPC. Retain it only
     // in this bounded session entry for the separately signed password stage.
     r.usernameSubmitted=true;
     const selected={username:Buffer.from(r.secret.username),password:Buffer.alloc(0)};
     try{return await use(selected);}catch(error){erase(r);throw error;}
     finally{Object.values(selected).forEach(b=>b.fill(0));}
    }
    credentials.delete(r.id);const secret=r.secret;r.secret=null;
    try{return await use(secret);}finally{Object.values(secret).forEach(b=>b.fill(0));}
   },
  };},
  async cancel(bound,id){const r=own(bound,id);erase(r);for(const [key,d]of decisions)if(d.request.credentialRef===id)decisions.delete(key);return {cancelled:true};},
  discardSession(bound,sessionId){
   const scope=c.scope(bound);for(const r of credentials.values())if(r.scope===scope&&r.sessionId===sessionId)erase(r);
   for(const [key,d]of decisions)if(c.scope(d.bound)===scope&&d.request.sessionId===sessionId)decisions.delete(key);
  },
  close(){clearInterval(timer);for(const r of credentials.values())erase(r);decisions.clear();},
 };
 return Object.freeze(api);
}
module.exports={createRemoteInput};
