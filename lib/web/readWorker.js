'use strict';
const c = require('./contracts');
const { Deadline } = require('../capture/deadline');
// One claimed run only. Service-authenticated transport must consume this exact
// fenced reference once. No public registration or default execution authority.
function createReadWorker({ store, authorize, execute, policyVersion, workerId } = {}) {
  if (typeof store?.claim !== 'function' || typeof store?.finish !== 'function' ||
      typeof authorize !== 'function' || typeof execute !== 'function') c.deny('UNAVAILABLE');
  c.identifier(policyVersion); c.identifier(workerId);
  return async function processRun({ executionId, signal } = {}) {
    c.identifier(executionId);
    if (signal?.aborted) c.deny('CANCELLED');
    const claim = await store.claim({ executionId, workerId });
    if (!claim) return Object.freeze({ executionId, state: 'not_claimed' });
    const deadline = new Deadline(Math.max(1, Math.min(claim.plan.deadlineMs, claim.expiresAt-Date.now())), signal);
    let dispatched = false;
    const finish = async (state, resultState = null) => {
      const accepted = await store.finish({ executionId, workerId, fence: claim.fence, state, resultState });
      return Object.freeze({ executionId, state: accepted ? state : 'needs_reconciliation', resultState: accepted ? resultState : null });
    };
    try {
      if (claim.plan.policyVersion !== policyVersion || claim.expiresAt <= Date.now()) c.deny('STALE_PLAN');
      // Fresh current project/creator authority, not a persisted membership snapshot.
      const actor = c.executionPrincipal(await deadline.run(() => authorize(claim.plan, deadline.signal)));
      c.bindPrincipal(actor, claim.plan);
      if (deadline.signal.aborted) c.deny('CANCELLED');
      dispatched = true;
      const result = await deadline.run(() => execute(Object.freeze({ executionId, planDigest: claim.planDigest,
        workerId, fence: claim.fence }), deadline.signal));
      // Do not store or return capture content from the background worker.
      if (!result || !['complete','partial','failed'].includes(result.state)) c.deny('UNAVAILABLE');
      return await finish(result.state === 'failed' ? 'failed' : 'completed', result.state);
    } catch {
      // Once transport was entered, even a network error may follow an external
      // action. No blind retry. A lost terminal write is handled by lease sweep.
      try { return await finish(dispatched ? 'needs_reconciliation' : 'failed'); }
      catch { return Object.freeze({ executionId, state: 'needs_reconciliation' }); }
    } finally { deadline.close(); }
  };
}
module.exports = { createReadWorker };
