'use strict';
const {randomUUID,sign}=require('node:crypto');
const c=require('./contracts');
const {AUDIENCE,schema}=require('./consent');
// Trusted local host state, not a model signing oracle. Only the paired form can
// call approve. Server independently verifies exact bytes, current grant and nonce.
function createAuthDecisionHost({client,bound,grantId,privateKey,verifyOwner,now=Date.now}={}){
 if(typeof client?.protectedCall!=='function'||typeof verifyOwner!=='function')c.deny('UNAVAILABLE');
 const binding=c.binding(bound),entries=new Map();
 function sweep(){for(const [id,r]of entries)if(r.expiresAt<=now())entries.delete(id);}
 function get(id){sweep();const r=entries.get(id);if(!r)c.deny('SESSION_LOST');return r;}
 async function paired(r,context){const owner=await verifyOwner(context);if(!owner||owner.workspaceUserId!==r.ownerId||owner.organizationId!==binding.principal.organizationId||owner.projectId!==binding.principal.projectId)c.deny('FORBIDDEN');if(get(r.id)!==r)c.deny('SESSION_LOST');}
 return Object.freeze({
  async request(raw){
   const action=c.parseTool('browser_authenticate',raw);sweep();let r=[...entries.values()].find(x=>x.action.actionId===action.actionId);
   if(r){if(r.digest!==c.digest(action))c.deny('IDEMPOTENCY_CONFLICT');return {id:r.id,ready:r.ready,expiresAt:r.expiresAt};}
   const credential=await client.protectedCall('input-inspect',{interventionId:action.credentialRef});
   if(credential.sessionId!==action.sessionId||credential.expiresAt<=now())c.deny('SESSION_LOST');
   if(entries.size>=1)c.deny('BUSY');
   r={id:randomUUID(),action,digest:c.digest(action),origin:credential.origin,purpose:credential.purpose,ownerId:credential.ownerId,recipients:credential.recipients,expiresAt:Math.min(credential.expiresAt,now()+120000),ready:false};entries.set(r.id,r);
   return {id:r.id,ready:false,expiresAt:r.expiresAt};
  },
  async inspect(id,context){const r=get(id);await paired(r,context);return c.frozen({interventionId:r.id,sessionId:r.action.sessionId,actionId:r.action.actionId,origin:r.origin,purpose:r.purpose,recipients:r.recipients,fields:r.action.fields,submitRef:r.action.submitRef,expiresAt:r.expiresAt});},
  async approve(id,context){
   const r=get(id);await paired(r,context);if(r.ready||r.busy)c.deny('IDEMPOTENCY_CONFLICT');r.busy=true;
   try{
    const decision={sessionId:r.action.sessionId,operationId:r.action.actionId,operationDigest:r.digest,recipients:r.recipients,nonce:randomUUID(),expiresAt:r.expiresAt};
    const body=c.parse(schema,{version:1,audience:AUDIENCE,grantId,principalScope:c.scope(binding),hostId:binding.hostId,...decision,issuedAt:now()});
    const payload=Buffer.from(JSON.stringify(body)).toString('base64url'),proof=payload+'.'+sign(null,Buffer.from(AUDIENCE+'.'+payload),privateKey).toString('base64url');
    await client.protectedCall('input-prepare',{request:r.action,proof,decision,recipients:r.recipients});
    if(get(id)!==r)c.deny('SESSION_LOST');r.ready=true;return {prepared:true};
   }finally{r.busy=false;}
  },
  release(id){entries.delete(id);},close(){entries.clear();},
 });
}
module.exports={createAuthDecisionHost};
