'use strict';
const c=require('./contracts');
const {Deadline}=require('../capture/deadline');
// Durable admission only. The outbox, not this request, starts execution.
function createRunAdmissionController({resolvePrincipal,repository,policyVersion}={}) {
  if(typeof resolvePrincipal!=='function' || typeof repository?.loadPlan!=='function' || typeof repository?.admit!=='function')c.deny('UNAVAILABLE');
  c.identifier(policyVersion);
  return async (input={})=>{
    const organizationId=c.identifier(input.organizationId),projectId=c.identifier(input.projectId),planId=c.identifier(input.planId);
    const confirmationId=c.identifier(input.confirmationId),idempotencyKey=c.identifier(input.idempotencyKey);
    const authorization=input.authorization,deadline=new Deadline(5000,input.signal);
    try {
      const principal=c.executionPrincipal(await deadline.run(()=>resolvePrincipal({authorization,organizationId,projectId,signal:deadline.signal})));
      if(principal.organizationId!==organizationId || principal.projectId!==projectId)c.deny('FORBIDDEN');
      const plan=c.plan(await deadline.run(()=>repository.loadPlan({planId,principal,signal:deadline.signal})));
      c.bindPrincipal(principal,plan);
      if(plan.planId!==planId || plan.policyVersion!==policyVersion)c.deny('STALE_PLAN');
      // SQL distinguishes expired new admission from an idempotent existing run.
      // Do not pre-reject expiry here: a lost admission response must be recoverable.
      return await deadline.run(()=>repository.admit({planId,planDigest:c.digest(plan),confirmationId,idempotencyKey,principal,signal:deadline.signal}));
    } catch(e){if(e instanceof c.WebBoundaryError)throw e;c.deny(input.signal?.aborted?'CANCELLED':'UNAVAILABLE');}
    finally{deadline.close();}
  };
}
module.exports={createRunAdmissionController};
