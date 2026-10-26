BEGIN;
ALTER TABLE web_read.runs ADD COLUMN result_expires_at bigint;
DROP FUNCTION web_read.finish(text,text,bigint,text,text);
CREATE FUNCTION web_read.finish(p_execution text,p_worker text,p_fence bigint,p_state text,p_result text DEFAULT NULL,p_result_expires bigint DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE changed integer;
BEGIN
 IF p_state NOT IN ('completed','failed','needs_reconciliation') OR p_state IS NULL THEN
   RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 IF (p_result IS NOT NULL AND p_result NOT IN ('complete','partial','failed')) OR
    (p_state='completed' AND (p_result IS NULL OR p_result NOT IN ('complete','partial'))) OR
    (p_state<>'completed' AND p_result IS NOT NULL AND NOT (p_state='failed' AND p_result='failed')) THEN
   RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 IF p_result_expires IS NOT NULL AND (p_result IS NULL OR p_result_expires<=floor(extract(epoch FROM clock_timestamp())*1000) OR
    p_result_expires>floor(extract(epoch FROM clock_timestamp())*1000)+300000) THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 UPDATE web_read.runs SET state=p_state,result_state=p_result,result_expires_at=p_result_expires,finished_at=clock_timestamp()
 WHERE execution_id=p_execution AND worker_id=p_worker AND fence=p_fence
   AND state='running' AND lease_until>clock_timestamp();
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed=1;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA web_read FROM PUBLIC;
COMMIT;
