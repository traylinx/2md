'use strict';
const c = require('./contracts');

// Only consume a trusted admission decision. This module never manufactures
// consent from request fields, chat text, model output or a service identity.
function confirmedReadScope({ principal, plan, decision, policyVersion, now = Date.now() }) {
  const actor = c.executionPrincipal(principal);
  const scope = c.plan(plan);
  c.bindPrincipal(actor, scope);
  if (scope.policyVersion !== policyVersion || scope.expiresAt <= now || scope.expiresAt > now + 300000) c.deny('STALE_PLAN');
  const grant = c.admission(decision);
  c.bindPrincipal(actor, grant);
  if (grant.planId !== scope.planId || grant.planDigest !== c.digest(scope) ||
      grant.expiresAt <= now || grant.expiresAt > scope.expiresAt) c.deny('INVALID_CONFIRMATION');
  return Object.freeze({ scope, grant });
}
module.exports = { confirmedReadScope };
