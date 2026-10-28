'use strict';
const c = require('./contracts');
const {failure}=require('./diagnostics');
const { readResult } = require('./readResult');
const { Deadline } = require('../capture/deadline');
// One claimed run only. Service-authenticated transport must consume this exact
// fenced reference once. No public registration or default execution authority.
function createReadWorker({ store, authorize, execute, results, policyVersion, workerId } = {}) {
  if (typeof store?.claim !== 'function' || typeof store?.finish !== 'function' ||
      typeof authorize !== 'function' || typeof execute !== 'function' || typeof results?.put !== 'function') c.deny('UNAVAILABLE');
  c.identifier(policyVersion); c.identifier(workerId);
  return async function processRun({ executionId, signal } = {}) {
    c.identifier(executionId);
    if (signal?.aborted) c.deny('CANCELLED');
    const claim = await store.claim({ executionId, workerId });
    if (!claim) return Object.freeze({ executionId, state: 'not_claimed' });
    const deadline = new Deadline(Math.max(1, Math.min(claim.plan.deadlineMs, claim.expiresAt-Date.now())), signal);
    let dispatched = false;
    const finish = async (state, resultState = null, resultExpiresAt = null) => {
      const accepted = await store.finish({ executionId, workerId, fence: claim.fence, state, resultState, resultExpiresAt });
      return Object.freeze({ executionId, state: accepted ? state : 'needs_reconciliation', resultState: accepted ? resultState : null });
    };
    let stage='policy';
    try {
      if (claim.plan.policyVersion !== policyVersion || claim.expiresAt <= Date.now()) c.deny('STALE_PLAN');
      // Fresh current project/creator authority, not a persisted membership snapshot.
      stage='authorize';
      const actor = c.executionPrincipal(await deadline.run(() => authorize(claim.plan, deadline.signal)));
      c.bindPrincipal(actor, claim.plan);
      if (deadline.signal.aborted) c.deny('CANCELLED');
      dispatched = true;
      const startedAt=Date.now();
      stage='dispatch';
      const result = await deadline.run(() => execute(Object.freeze({ executionId, planDigest: claim.planDigest,
        workerId, fence: claim.fence }), deadline.signal));
      // Validate and stage encrypted transient content before the fenced SQL publication.
      stage='validate';
      if (!result || !['complete','partial','failed'].includes(result.state)) c.deny('UNAVAILABLE');
      const captured=readResult({...result.result,collectionWindow:{startedAt,finishedAt:Date.now()}},claim.plan);
      if(captured.state!==result.state) c.deny('INVALID_RESULT');
      stage='cache';
      const resultExpiresAt=await deadline.run(()=>results.put(claim,captured));
      stage='finish';
      return await finish(result.state === 'failed' ? 'failed' : 'completed', result.state,resultExpiresAt);
    } catch(error) {
      failure('worker',stage,error);
      // Once transport was entered, even a network error may follow an external
      // action. No blind retry. A lost terminal write is handled by lease sweep.
      try { return await finish(dispatched ? 'needs_reconciliation' : 'failed'); }
      catch { return Object.freeze({ executionId, state: 'needs_reconciliation' }); }
    } finally { deadline.close(); }
  };
}
module.exports = { createReadWorker };
