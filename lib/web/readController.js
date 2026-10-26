'use strict';
const c = require('./contracts');
const { Deadline } = require('../capture/deadline');
const { confirmedReadScope } = require('./confirmedReadScope');

// Internal composition only. No production registration and no fallback ports.
// admit must atomically validate a separately authenticated confirmation and
// claim one logical execution. S02 supplies durable storage/transport, not here.
function createReadController({ resolvePrincipal, loadPlan, admit, execute, policyVersion } = {}) {
  if ([resolvePrincipal, loadPlan, admit, execute].some(f => typeof f !== 'function')) c.deny('UNAVAILABLE');
  c.identifier(policyVersion);
  return async function read(input = {}) {
    // Copy selectors before any await; do not retain the caller's mutable object.
    const organizationId = c.identifier(input.organizationId), projectId = c.identifier(input.projectId);
    const planId = c.identifier(input.planId), confirmationId = c.identifier(input.confirmationId);
    const authorization = input.authorization, parentSignal = input.signal;
    const deadline = new Deadline(180000, parentSignal);
    const resolve = () => deadline.run(() => resolvePrincipal({ authorization, organizationId, projectId, signal: deadline.signal }));
    try {
      const actor = c.executionPrincipal(await resolve());
      if (actor.organizationId !== organizationId || actor.projectId !== projectId) c.deny('FORBIDDEN');
      const scope = c.plan(await deadline.run(() => loadPlan({ planId, principal: actor, signal: deadline.signal })));
      c.bindPrincipal(actor, scope);
      if (scope.planId !== planId || scope.policyVersion !== policyVersion ||
          scope.expiresAt <= Date.now() || scope.expiresAt > Date.now() + 300000) c.deny('STALE_PLAN');
      deadline.tighten(Math.min(scope.deadlineMs, scope.expiresAt - Date.now()));
      const decision = await deadline.run(() => admit({ confirmationId, planId, planDigest: c.digest(scope),
        principal: actor, signal: deadline.signal }));
      const { grant } = confirmedReadScope({ principal: actor, plan: scope, decision, policyVersion });
      deadline.tighten(Math.min(scope.deadlineMs, grant.expiresAt - Date.now()));
      // Revocation after confirmation cannot start a new browser action.
      c.bindPrincipal(c.executionPrincipal(await resolve()), scope);
      const result = await deadline.run(() => execute(Object.freeze({ executionId: grant.executionId,
        planDigest: grant.planDigest }), deadline.signal));
      // Creator + current project authorization required even for transient results.
      c.bindPrincipal(c.executionPrincipal(await resolve()), scope);
      if (Date.now() >= grant.expiresAt) c.deny('INVALID_CONFIRMATION');
      return Object.freeze({ executionId: grant.executionId, planDigest: grant.planDigest, result });
    } catch (error) {
      if (parentSignal?.aborted) c.deny('CANCELLED');
      if (error instanceof c.WebBoundaryError) throw error;
      if (error?.code === 'DEADLINE') c.deny('DEADLINE_EXCEEDED');
      c.deny('UNAVAILABLE');
    } finally { deadline.close(); }
  };
}
module.exports = { createReadController };
