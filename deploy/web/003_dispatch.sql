BEGIN;
ALTER TABLE web_read.runs ADD COLUMN dispatch_consumed_at timestamptz;
CREATE FUNCTION web_read.consume_dispatch(p_execution text,p_worker text,p_fence bigint,p_digest text)
RETURNS TABLE(plan jsonb,expires_at bigint) LANGUAGE plpgsql AS $$
DECLARE r web_read.runs; p web_read.plans; consent web_read.confirmations;
BEGIN
 SELECT * INTO r FROM web_read.runs WHERE execution_id=p_execution FOR UPDATE;
 IF p_execution IS NULL OR p_worker IS NULL OR p_fence IS NULL OR p_digest IS NULL OR
    NOT FOUND OR r.state<>'running' OR r.worker_id<>p_worker OR r.fence<>p_fence OR
    r.digest<>p_digest OR r.dispatch_consumed_at IS NOT NULL OR r.lease_until<=clock_timestamp() THEN RETURN; END IF;
 SELECT * INTO p FROM web_read.plans WHERE plan_id=r.plan_id;
 SELECT * INTO consent FROM web_read.confirmations WHERE confirmation_id=r.confirmation_id FOR UPDATE;
 IF consent.revoked OR p.expires_at<=floor(extract(epoch FROM clock_timestamp())*1000) THEN RETURN; END IF;
 UPDATE web_read.runs SET dispatch_consumed_at=clock_timestamp() WHERE execution_id=p_execution;
 RETURN QUERY SELECT p.body,LEAST(p.expires_at,floor(extract(epoch FROM r.lease_until)*1000)::bigint);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA web_read FROM PUBLIC;
COMMIT;
