'use strict';
const {randomUUID}=require('node:crypto');
const c=require('./contracts');
const {Deadline}=require('../capture/deadline');

// Host-owned volatile provider. submit/consume are protected-channel methods,
// never MCP tools. An independent owner pairing verifier is mandatory.
function createCredentialProvider({verifyOwner,now=Date.now,maxEntries=32}={}){
  if(typeof verifyOwner!=='function'||!Number.isInteger(maxEntries)||maxEntries<1||maxEntries>64)c.deny('UNAVAILABLE');
  const entries=new Map();
  function erase(record){for(const bytes of Object.values(record.secret||{}))bytes.fill(0);record.secret=null;entries.delete(record.id);}
  function sweep(){for(const record of entries.values())if(record.expiresAt<=now())erase(record);}
  function owned(bound,id){sweep();const record=entries.get(id);if(!record)c.deny('SESSION_LOST');if(record.scope!==c.scope(c.binding(bound)))c.deny('FORBIDDEN');return record;}
  function view(record){return c.frozen({interventionId:record.id,sessionId:record.sessionId,origin:record.origin,purpose:record.purpose,
    recipients:[...record.recipients],expiresAt:record.expiresAt,state:record.secret?'ready':'needs_input'});}
  async function paired(record,context){
    const owner=await verifyOwner(context,{hostId:record.bound.hostId,hostKeyFingerprint:record.bound.hostKeyFingerprint});
    if(!owner||owner.workspaceUserId!==record.ownerId||owner.organizationId!==record.bound.principal.organizationId||owner.projectId!==record.bound.principal.projectId)c.deny('FORBIDDEN');
    if(record.expiresAt<=now()||entries.get(record.id)!==record)c.deny('SESSION_LOST');
  }
  function request(bound,{sessionId,origin,purpose,recipients,ownerId,expiresAt}){
    const binding=c.binding(bound);c.validate(c.id,sessionId);c.validate(c.id,ownerId);c.validate(c.origin,origin);c.validate(c.str(1000),purpose);
    c.validate({type:'array',items:c.origin,minItems:1,maxItems:32,uniqueItems:true},recipients);
    if(!recipients.includes(origin)||!Number.isSafeInteger(expiresAt)||expiresAt<=now())c.deny('INVALID_INPUT');
    sweep();const scope=c.scope(binding);
    const existing=[...entries.values()].find(r=>r.scope===scope&&r.sessionId===sessionId);
    if(existing){if(existing.origin!==origin||existing.purpose!==purpose||c.digest(existing.recipients)!==c.digest(recipients)||existing.ownerId!==ownerId)c.deny('BUSY');return view(existing);}
    if(entries.size>=maxEntries)c.deny('CAPACITY');
    const record={id:randomUUID(),scope,bound:binding,sessionId,origin,purpose,recipients:[...recipients],ownerId,expiresAt:Math.min(expiresAt,now()+120000),secret:null};
    entries.set(record.id,record);return view(record);
  }
  async function inspect(id,context){sweep();const record=entries.get(id);if(!record)c.deny('SESSION_LOST');await paired(record,context);return view(record);}
  async function submit(id,context,input){
    sweep();const record=entries.get(id);if(!record)c.deny('SESSION_LOST');await paired(record,context);
    if(record.secret)c.deny('IDEMPOTENCY_CONFLICT');
    c.validate(c.obj({username:{type:'string',maxLength:4096},password:c.str(4096),accountLabel:c.str(128)},['username','password']),input);
    record.secret={username:Buffer.from(input.username),password:Buffer.from(input.password)};
    // Account labels are not used as proof of website identity.
    return {state:'ready',credentialRef:record.id,expiresAt:record.expiresAt};
  }
  function resolve(bound,{sessionId,origin}){
    sweep();const scope=c.scope(c.binding(bound));const record=[...entries.values()].find(r=>r.scope===scope&&r.sessionId===sessionId&&r.origin===origin);
    return record?view(record):null;
  }
  async function consume(bound,{credentialRef,sessionId,origin,recipients},use){
    if(typeof use!=='function')c.deny('UNAVAILABLE');const record=owned(bound,credentialRef);
    if(record.sessionId!==sessionId||record.origin!==origin||c.digest(record.recipients)!==c.digest(recipients))c.deny('FORBIDDEN');
    if(!record.secret)c.deny('PROTECTED_INPUT_REQUIRED');
    // Remove before invoking downstream work: failure/timeout never enables replay.
    entries.delete(record.id);const secret=record.secret;record.secret=null;
    const deadline=new Deadline(Math.min(30000,Math.max(1,record.expiresAt-now())));
    try{return await deadline.run(()=>use(secret,{signal:deadline.signal}));}finally{deadline.close();for(const bytes of Object.values(secret))bytes.fill(0);}
  }
  function cancel(bound,id){const record=owned(bound,id);erase(record);}
  const timer=setInterval(sweep,1000);timer.unref?.();
  return Object.freeze({request,inspect,submit,resolve,consume,cancel,
    close(){clearInterval(timer);for(const record of entries.values())erase(record);},
    diagnostics(){sweep();return {entries:entries.size};},
  });
}
module.exports={createCredentialProvider};
