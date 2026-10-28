'use strict';
const c = require('./contracts');
const web = require('../web/contracts');

function human(value) {
  let p; try { p=web.principal(value); } catch { c.deny('FORBIDDEN'); }
  if (p.kind!=='human' || !['OWNER','ADMIN'].includes(p.effectiveRole)) c.deny('FORBIDDEN');
  return p;
}
function ownerMatches(owner,subject) {
  if (owner.organizationId!==subject.organizationId || owner.projectId!==subject.projectId) c.deny('FORBIDDEN');
}
// Repository and current-agent resolver are mandatory trusted dependencies.
// Validation of a submitted grant shape NEVER constitutes owner authorization.
function createGrantAuthority({repository,resolveAgent,now=Date.now}={}) {
  if (!repository || ['create','get','revoke'].some(k=>typeof repository[k]!=='function') || typeof resolveAgent!=='function') c.deny('UNAVAILABLE');
  return Object.freeze({
    async create(input,owner,{signal}={}) {
      const h=human(owner),g=c.parseGrant(input,now()); ownerMatches(h,g.agent);
      if (signal?.aborted) c.deny('CANCELLED');
      const p=c.actor(await resolveAgent(g.agent,{signal}));
      if (c.digest(c.identity(p))!==c.digest(g.agent)) c.deny('FORBIDDEN');
      if (signal?.aborted) c.deny('CANCELLED');
      const stored=c.frozen({...g,policyVersion:c.POLICY,approvedBy:h.authSubject,
        approvedByWorkspaceUserId:h.workspaceUserId,hostKeyFingerprint:c.fingerprint(g.hostPublicKey)});
      await repository.create(stored,{signal});
      return {grantId:g.grantId,hostId:g.hostId,expiresAt:g.expiresAt,policyVersion:c.POLICY};
    },
    async revoke(grantId,owner,{signal}={}) {
      const h=human(owner); c.validate(c.id,grantId);
      if (signal?.aborted) c.deny('CANCELLED');
      // Scope is passed to repository, avoiding cross-tenant lookup/disclosure.
      await repository.revoke({grantId,organizationId:h.organizationId,projectId:h.projectId},{signal});
      return {grantId,revoked:true};
    },
    async authorize(grantId,bound,{signal}={}) {
      const b=c.binding(bound); c.validate(c.id,grantId);
      const g=await repository.get({grantId,organizationId:b.principal.organizationId,projectId:b.principal.projectId},{signal});
      if (!g || g.revoked || g.policyVersion!==c.POLICY || g.expiresAt<=now() ||
          c.digest(g.agent)!==c.digest(c.identity(b.principal)) || g.hostId!==b.hostId || g.hostKeyFingerprint!==b.hostKeyFingerprint) c.deny('PERMISSION_REQUIRED');
      // Never trust a malformed or legacy grant to acquire new browser authority.
      const raw=Object.fromEntries(Object.keys(c.grantSchema.properties).map(k=>[k,g[k]]));
      c.parseGrant(raw,now());
      if (c.fingerprint(g.hostPublicKey)!==b.hostKeyFingerprint) c.deny('PERMISSION_REQUIRED');
      if (signal?.aborted) c.deny('CANCELLED');
      return c.frozen({...g});
    },
  });
}
module.exports={createGrantAuthority,human,ownerMatches};
