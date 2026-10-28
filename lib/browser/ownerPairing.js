'use strict';
const {randomBytes,createHash}=require('node:crypto');
const c=require('./contracts');
const {human,ownerMatches}=require('./grantAuthority');
const hash=s=>createHash('sha256').update(s).digest('base64url');
const opaque=()=>randomBytes(32).toString('base64url');
// Control-service state. Agent/host possession is established before begin and
// exchange. Only the existing human control boundary may invoke approve.
function createOwnerPairing({authorize,now=Date.now,maxPending=64}={}){
  if(typeof authorize!=='function')c.deny('UNAVAILABLE');
  const pending=new Map();
  function sweep(){for(const [id,p]of pending)if(p.expiresAt<=now())pending.delete(id);}
  function load(id){sweep();const p=pending.get(id);if(!p)c.deny('SESSION_LOST');return p;}
  async function fresh(p,bound){const b=c.binding(bound);if(c.scope(b)!==p.scope)c.deny('FORBIDDEN');const grant=await authorize(p.grantId,b);if(!grant||grant.revoked||grant.expiresAt<=now()||grant.hostId!==b.hostId||grant.hostKeyFingerprint!==b.hostKeyFingerprint||c.digest(grant.agent)!==c.digest(c.identity(b.principal)))c.deny('PERMISSION_REQUIRED');return grant;}
  return Object.freeze({
    async begin(bound,{grantId,state,challenge,redirectUri}){
      c.validate(c.id,grantId);for(const value of[state,challenge])if(typeof value!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(value))c.deny('INVALID_INPUT');
      const url=new URL(redirectUri);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.pathname!=='/pair/callback'||url.search||url.hash||url.username||url.password)c.deny('INVALID_INPUT');
      sweep();if(pending.size>=maxPending)c.deny('CAPACITY');const p={id:'pair_'+opaque(),grantId,state,challenge,redirectUri,scope:c.scope(c.binding(bound)),bound:c.binding(bound),expiresAt:now()+120000,owner:null,codeHash:null};
      await fresh(p,bound);sweep();if(pending.size>=maxPending)c.deny('CAPACITY');pending.set(p.id,p);
      return {pairingId:p.id,expiresAt:p.expiresAt};
    },
    async approve(pairingId,owner){
      const p=load(pairingId),h=human(owner);ownerMatches(h,p.bound.principal);const grant=await fresh(p,p.bound);load(pairingId);
      if(grant.approvedByWorkspaceUserId!==h.workspaceUserId)c.deny('FORBIDDEN');
      if(p.codeHash)c.deny('IDEMPOTENCY_CONFLICT');
      const code=opaque();p.codeHash=hash(code);p.owner={workspaceUserId:h.workspaceUserId,organizationId:h.organizationId,projectId:h.projectId};
      // Returned to authenticated human redirect handler, never tool output.
      const target=new URL(p.redirectUri);target.searchParams.set('code',code);target.searchParams.set('state',p.state);
      return {redirectUri:target.href};
    },
    async exchange(bound,{pairingId,code,state,verifier}){
      const p=load(pairingId);await fresh(p,bound);load(pairingId);
      if(typeof verifier!=='string'||!/^[A-Za-z0-9_-]{43,128}$/.test(verifier)||typeof code!=='string'||!p.codeHash||hash(code)!==p.codeHash||state!==p.state||hash(verifier)!==p.challenge)c.deny('FORBIDDEN');
      pending.delete(pairingId);return c.frozen({owner:p.owner,hostId:p.bound.hostId,hostKeyFingerprint:p.bound.hostKeyFingerprint,grantId:p.grantId});
    },
    close(){pending.clear();},
  });
}
module.exports={createOwnerPairing};
