'use strict';
const {randomUUID}=require('node:crypto');
const c=require('./contracts');
const {createGrantAuthority,human,ownerMatches}=require('./grantAuthority');
const {createOwnerPairing}=require('./ownerPairing');
const opaque={type:'string',pattern:'^[A-Za-z0-9_-]{43}$',minLength:43,maxLength:43};
const beginSchema=c.obj({hostId:c.id,hostPublicKey:c.str(256),state:opaque,challenge:opaque,redirectUri:c.str(512),operations:{type:'array',items:{enum:['browser:public','browser:login_read']},minItems:1,maxItems:2,uniqueItems:true}});
// Caller identity and new-key possession MUST be verified by transport before
// begin/exchange. Pending enrollment is not a grant or browser capability.
function createEnrollment({repository,resolveCurrentAgent,now=Date.now,maxPending=64}={}){
 if(typeof resolveCurrentAgent!=='function'||!repository)c.deny('UNAVAILABLE');
 const entries=new Map();
 const authority=createGrantAuthority({repository,resolveAgent:async()=>c.deny('UNSUPPORTED'),now});
 const pairing=createOwnerPairing({authorize:(id,b)=>authority.authorize(id,b),now});
 function sweep(){for(const [id,r]of entries)if(r.expiresAt<=now())entries.delete(id);}
 function get(id){sweep();const r=entries.get(id);if(!r)c.deny('SESSION_LOST');return r;}
 async function fresh(r){const current=c.actor(await resolveCurrentAgent(r.bound.principal));if(c.digest(c.identity(current))!==c.digest(c.identity(r.bound.principal))||c.digest(current.authorizationRef)!==c.digest(r.bound.principal.authorizationRef))c.deny('PERMISSION_REQUIRED');if(get(r.id)!==r)c.deny('SESSION_LOST');return current;}
 async function owner(r,value){const h=human(value);ownerMatches(h,r.bound.principal);await fresh(r);return h;}
 return Object.freeze({
  async begin(principal,raw){
   const p=c.actor(principal),input=c.parse(beginSchema,raw),url=new URL(input.redirectUri);
   if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.pathname!=='/pair/callback'||url.username||url.password||url.search||url.hash)c.deny('INVALID_INPUT');
   const bound=c.binding({principal:p,hostId:input.hostId,hostKeyFingerprint:c.fingerprint(input.hostPublicKey)});
   // Canonical grant parsing verifies the key type/encoding and all scope limits.
   const proposal=c.parseGrant({grantId:randomUUID(),agent:c.identity(p),hostId:input.hostId,hostPublicKey:input.hostPublicKey,operations:input.operations,navigation:{mode:'public_https'},limits:{...c.LIMITS},expiresAt:now()+86400000},now());
   sweep();if(entries.size>=maxPending)c.deny('CAPACITY');
   const r={id:'enroll_'+randomUUID(),bound,input,proposal,expiresAt:now()+120000,state:'pending'};entries.set(r.id,r);
   try{await fresh(r);}catch(error){entries.delete(r.id);throw error;}
   return {enrollmentId:r.id,grantId:proposal.grantId,expiresAt:r.expiresAt};
  },
  async inspect(id,value){const r=get(id);await owner(r,value);return c.frozen({enrollmentId:r.id,hostId:r.bound.hostId,hostKeyFingerprint:r.bound.hostKeyFingerprint,agent:c.identity(r.bound.principal),operations:r.proposal.operations,navigation:r.proposal.navigation,grantExpiresAt:r.proposal.expiresAt,expiresAt:r.expiresAt});},
  async approve(id,value){
   const r=get(id),h=await owner(r,value);if(r.state!=='pending')c.deny('IDEMPOTENCY_CONFLICT');r.state='approving';
   try{
    const grantAuthority=createGrantAuthority({repository,now,resolveAgent:()=>fresh(r)});
    await grantAuthority.create(r.proposal,h);
    const started=await pairing.begin({...r.bound,grantId:r.proposal.grantId},{grantId:r.proposal.grantId,state:r.input.state,challenge:r.input.challenge,redirectUri:r.input.redirectUri});
    r.pairingId=started.pairingId;
    const result=await pairing.approve(r.pairingId,h);r.state='approved';return result;
   }catch(error){
    // Attempt revocation on partial failure; never claim rollback if the database is unavailable.
    r.state='failed';await authority.revoke(r.proposal.grantId,h).catch(()=>{});throw error;
   }
  },
  async exchange(id,principal,input){
   const r=get(id),p=c.actor(principal);if(c.digest(c.identity(p))!==c.digest(c.identity(r.bound.principal))||c.digest(p.authorizationRef)!==c.digest(r.bound.principal.authorizationRef))c.deny('FORBIDDEN');
   await fresh(r);if(r.state!=='approved'||!r.pairingId)c.deny('PERMISSION_REQUIRED');
   const result=await pairing.exchange({...r.bound,grantId:r.proposal.grantId},{...input,pairingId:r.pairingId});entries.delete(id);return result;
  },
  close(){entries.clear();pairing.close();},
 });
}
module.exports={createEnrollment,beginSchema};
