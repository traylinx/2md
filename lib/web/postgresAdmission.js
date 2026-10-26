'use strict';
const { createHash, randomUUID } = require('node:crypto');
const c = require('./contracts');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const owner = p => hash(['public-read', p.authSubject, p.workspaceUserId, p.organizationId, p.projectId]);
const known = new Set(['IDEMPOTENCY_CONFLICT', 'FORBIDDEN', 'STALE_PLAN', 'INVALID_CONFIRMATION', 'ALREADY_ADMITTED']);

// Metadata repository, not an execution authority or HTTP endpoint. A configured
// pg-compatible pool and independently authenticated confirmation authorizer are
// required. No default DB, caller bearer persistence, or automatic retry.
function createPostgresAdmission({ pool, authorizeConfirmation, policyVersion } = {}) {
  if (typeof pool?.query !== 'function' || typeof authorizeConfirmation !== 'function') c.deny('UNAVAILABLE');
  c.identifier(policyVersion);
  async function query(sql, params) {
    try { return await pool.query(sql, params); }
    catch (e) {
      if (e.code === 'P0001' && known.has(e.message)) c.deny(e.message);
      // A connection failure may follow COMMIT. Caller retries the SAME key;
      // never infer failure or start capture from a missing response.
      c.deny('UNAVAILABLE');
    }
  }
  function scope(value, actor) {
    const p = c.plan(value); c.bindPrincipal(actor, p);
    if (p.policyVersion !== policyVersion) c.deny('STALE_PLAN');
    return p;
  }
  async function loadPlan({ planId, principal }) {
    const actor = c.executionPrincipal(principal);
    const r = await query('SELECT body FROM web_read.plans WHERE plan_id=$1 AND owner_scope=$2',
      [c.identifier(planId), owner(actor)]);
    if (r.rows.length !== 1) c.deny('FORBIDDEN');
    return scope(r.rows[0].body, actor);
  }
  return Object.freeze({
    loadPlan,
    async savePlan({ plan, principal }) {
      const actor = c.executionPrincipal(principal), p = scope(plan, actor);
      if (p.expiresAt <= Date.now() || p.expiresAt > Date.now() + 300000) c.deny('STALE_PLAN');
      const digest = c.digest(p);
      await query('INSERT INTO web_read.plans(plan_id,digest,owner_scope,body,expires_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
        [p.planId, digest, owner(actor), JSON.stringify(p), p.expiresAt]);
      const saved = await loadPlan({ planId: p.planId, principal: actor });
      if (c.digest(saved) !== digest) c.deny('IDEMPOTENCY_CONFLICT');
      return saved;
    },
    async confirm({ planId, confirmationId, principal, authorization, signal }) {
      const actor = c.executionPrincipal(principal), id = c.identifier(confirmationId);
      const p = await loadPlan({ planId, principal: actor });
      if (signal?.aborted) c.deny('CANCELLED');
      // Trusted adapter verifies human web:confirm + CSRF and exact plan binding.
      // Boolean caller flags are never accepted as confirmation authority.
      const proof = await authorizeConfirmation(Object.freeze({ authorization, principal: actor,
        planId: p.planId, planDigest: c.digest(p), confirmationId: id, signal }));
      c.exact(proof, ['confirmationId', 'planDigest']);
      if (proof.confirmationId !== id || proof.planDigest !== c.digest(p)) c.deny('INVALID_CONFIRMATION');
      if (signal?.aborted) c.deny('CANCELLED');
      if (p.expiresAt <= Date.now()) c.deny('STALE_PLAN');
      const r = await query('INSERT INTO web_read.confirmations(confirmation_id,plan_id) VALUES($1,$2) ON CONFLICT (confirmation_id) DO UPDATE SET confirmation_id=EXCLUDED.confirmation_id WHERE web_read.confirmations.plan_id=EXCLUDED.plan_id AND NOT web_read.confirmations.revoked RETURNING confirmation_id', [id, p.planId]);
      if (r.rows.length !== 1) c.deny('INVALID_CONFIRMATION');
      return Object.freeze({ confirmationId: id, planDigest: c.digest(p) });
    },
    async admit({ planId, planDigest, confirmationId, idempotencyKey, executionId, principal }) {
      const actor = c.executionPrincipal(principal);
      if (typeof planDigest !== 'string' || !/^[a-f0-9]{64}$/.test(planDigest)) c.deny();
      const key = hash([owner(actor), c.identifier(idempotencyKey)]);
      // Persisted logical execution ID returned on replay; generated before SQL.
      const id = executionId === undefined ? randomUUID() : c.identifier(executionId);
      const r = await query('SELECT * FROM web_read.admit($1,$2,$3,$4,$5,$6)',
        [c.identifier(planId), planDigest, owner(actor), c.identifier(confirmationId), key, id]);
      if (r.rows.length !== 1) c.deny('UNAVAILABLE');
      const row = r.rows[0];
      return Object.freeze({ executionId: row.execution_id, planDigest: row.plan_digest,
        state: row.state, replayed: row.replayed });
    }
  });
}
module.exports = { createPostgresAdmission };
