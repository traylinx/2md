'use strict';
const c = require('./contracts');
// Internal worker metadata adapter. No discovery loops, reconnect retry or capture.
function createPostgresWorker({ pool } = {}) {
  if (typeof pool?.query !== 'function') c.deny('UNAVAILABLE');
  async function query(sql, args) {
    try { return await pool.query(sql, args); } catch { c.deny('UNAVAILABLE'); }
  }
  return Object.freeze({
    async claim({ executionId, workerId, leaseMs = 180000 }) {
      c.identifier(executionId); c.identifier(workerId);
      if (!Number.isSafeInteger(leaseMs) || leaseMs < 1000 || leaseMs > 180000) c.deny();
      const r = await query('SELECT * FROM web_read.claim($1,$2,$3)', [executionId, workerId, leaseMs]);
      if (r.rows.length === 0) return null;
      if (r.rows.length !== 1) c.deny('UNAVAILABLE');
      const row = r.rows[0], plan = c.plan(row.plan);
      const fence = String(row.fence), expiresAt = new Date(row.lease_until).getTime();
      if (row.execution_id !== executionId || row.plan_digest !== c.digest(plan) ||
          !/^[1-9][0-9]{0,18}$/.test(fence) || !Number.isSafeInteger(expiresAt)) c.deny('UNAVAILABLE');
      return Object.freeze({ executionId, workerId, fence, planDigest: row.plan_digest, plan, expiresAt });
    },
    async finish({ executionId, workerId, fence, state, resultState = null }) {
      c.identifier(executionId); c.identifier(workerId);
      if (typeof fence !== 'string' || !/^[1-9][0-9]{0,18}$/.test(fence) ||
          !['completed','failed','needs_reconciliation'].includes(state)) c.deny();
      if (resultState !== null && !['complete','partial','failed'].includes(resultState)) c.deny();
      const r = await query('SELECT web_read.finish($1,$2,$3,$4,$5) AS accepted', [executionId, workerId, fence, state, resultState]);
      return r.rows[0]?.accepted === true;
    },
    async reconcileExpired(limit = 100) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) c.deny();
      const r = await query('SELECT web_read.reconcile_expired($1) AS count', [limit]);
      return r.rows[0].count;
    }
  });
}
module.exports = { createPostgresWorker };
