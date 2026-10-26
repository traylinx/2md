-- Explicit migration; never run as part of automatic deployment.
BEGIN;
ALTER TABLE web_read.runs ADD COLUMN fence bigint NOT NULL DEFAULT 0;
ALTER TABLE web_read.runs ADD COLUMN worker_id text;
ALTER TABLE web_read.runs ADD COLUMN lease_until timestamptz;
ALTER TABLE web_read.runs ADD COLUMN finished_at timestamptz;
ALTER TABLE web_read.runs ADD COLUMN result_state text CHECK(result_state IN ('complete','partial','failed'));
CREATE INDEX web_read_expired_runs ON web_read.runs(lease_until) WHERE state='running';
CREATE FUNCTION web_read.claim(p_execution text, p_worker text, p_lease_ms integer)
RETURNS TABLE(execution_id text, plan_digest text, fence bigint, plan jsonb, lease_until timestamptz)
LANGUAGE plpgsql AS $$
DECLARE r web_read.runs; p web_read.plans; consent web_read.confirmations; until_at timestamptz;
BEGIN
 IF p_lease_ms IS NULL OR p_lease_ms NOT BETWEEN 1000 AND 180000 OR p_worker IS NULL OR length(p_worker) NOT BETWEEN 1 AND 128 THEN
   RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 SELECT * INTO r FROM web_read.runs WHERE web_read.runs.execution_id=p_execution FOR UPDATE;
 IF NOT FOUND OR r.state <> 'admitted' THEN RETURN; END IF;
 SELECT * INTO p FROM web_read.plans WHERE plan_id=r.plan_id;
 SELECT * INTO consent FROM web_read.confirmations WHERE confirmation_id=r.confirmation_id FOR UPDATE;
 IF consent.revoked OR p.expires_at <= floor(extract(epoch FROM clock_timestamp())*1000) THEN
   UPDATE web_read.runs SET state='failed',finished_at=clock_timestamp() WHERE web_read.runs.execution_id=p_execution;
   DELETE FROM web_read.outbox WHERE web_read.outbox.execution_id=p_execution;
   RETURN;
 END IF;
 until_at := LEAST(clock_timestamp()+p_lease_ms*interval '1 millisecond',to_timestamp(p.expires_at/1000.0));
 UPDATE web_read.runs SET state='running',fence=r.fence+1,worker_id=p_worker,lease_until=until_at
   WHERE web_read.runs.execution_id=p_execution;
 DELETE FROM web_read.outbox WHERE web_read.outbox.execution_id=p_execution;
 RETURN QUERY SELECT r.execution_id,r.digest,r.fence+1,p.body,until_at;
END $$;
CREATE FUNCTION web_read.finish(p_execution text,p_worker text,p_fence bigint,p_state text,p_result text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE changed integer;
BEGIN
 IF p_state NOT IN ('completed','failed','needs_reconciliation') OR p_state IS NULL THEN
   RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 IF (p_result IS NOT NULL AND p_result NOT IN ('complete','partial','failed')) OR
    (p_state='completed' AND (p_result IS NULL OR p_result NOT IN ('complete','partial'))) OR
    (p_state<>'completed' AND p_result IS NOT NULL AND NOT (p_state='failed' AND p_result='failed')) THEN
   RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 UPDATE web_read.runs SET state=p_state,result_state=p_result,finished_at=clock_timestamp()
 WHERE execution_id=p_execution AND worker_id=p_worker AND fence=p_fence
   AND state='running' AND lease_until>clock_timestamp();
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed=1;
END $$;
-- Bounded sweeper. Never requeue work whose external outcome could be unknown.
CREATE FUNCTION web_read.reconcile_expired(p_limit integer)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE changed integer;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 WITH expired AS (
   SELECT execution_id FROM web_read.runs WHERE state='running' AND lease_until<=clock_timestamp()
   ORDER BY lease_until LIMIT p_limit FOR UPDATE SKIP LOCKED
 ) UPDATE web_read.runs r SET state='needs_reconciliation',finished_at=clock_timestamp()
   FROM expired e WHERE r.execution_id=e.execution_id;
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA web_read FROM PUBLIC;
COMMIT;
