# Rollback evidence

See [passed scoped rollback drill](../../../../../docs/evidence/html2md-implementation-2026-10-22/rollback-review-2/RESULT.json). Remove only the new ingress, stop/drain only the capture runtime, verify leases, then restore the exact manifest. Never restart the legacy html2md workload for this rollback. Drained request returned 502; no late successful result. All legacy health samples passed.
