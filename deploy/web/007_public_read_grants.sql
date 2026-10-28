-- Additive, opt-in standing permission. No grant is created by migration.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE web_read.public_read_grants (
 grant_id text PRIMARY KEY,
 owner_scope text NOT NULL,
 body jsonb NOT NULL,
 approved_by text NOT NULL,
 expires_at bigint NOT NULL,
 revoked boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX public_read_grants_owner ON web_read.public_read_grants(owner_scope) WHERE NOT revoked;
ALTER TABLE web_read.confirmations ADD COLUMN public_read_grant_id text REFERENCES web_read.public_read_grants;
ALTER TABLE web_read.confirmations ADD CONSTRAINT distinct_approval_authority
 CHECK (public_read_grant_id IS NULL OR approved_by IS NULL);
-- Standing permissions never masquerade as human approval of an individual plan.
CREATE FUNCTION web_read.check_public_grant(p_grant text,p_plan text,p_owner text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE g web_read.public_read_grants; p web_read.plans; u text;
BEGIN
 SELECT * INTO g FROM web_read.public_read_grants WHERE grant_id=p_grant FOR SHARE;
 IF NOT FOUND OR g.revoked OR g.owner_scope<>p_owner OR
    g.expires_at<=floor(extract(epoch FROM clock_timestamp())*1000) THEN
  RAISE EXCEPTION 'PUBLIC_READ_PERMISSION_REQUIRED' USING ERRCODE='P0001';
 END IF;
 SELECT * INTO p FROM web_read.plans WHERE plan_id=p_plan;
 IF NOT FOUND OR p.owner_scope<>p_owner OR p.body->>'principalKind' IS DISTINCT FROM 'agent'
    OR p.body->>'policyVersion' IS DISTINCT FROM g.body->>'policyVersion'
    OR jsonb_array_length(p.body->'urls')>(g.body->>'maxUrls')::integer
    OR (p.body->>'deadlineMs')::integer>(g.body->>'deadlineMs')::integer
    OR (p.body->>'maxResponseBytes')::integer>(g.body->>'maxResponseBytes')::integer THEN
  RAISE EXCEPTION 'PUBLIC_READ_PERMISSION_REQUIRED' USING ERRCODE='P0001';
 END IF;
 FOR u IN SELECT jsonb_array_elements_text(p.body->'urls') LOOP
  -- Plans contain canonical HTTPS URLs without ports, userinfo or IP targets.
  IF NOT (g.body->'origins' ? substring(u from '^https://[^/]+')) THEN
   RAISE EXCEPTION 'PUBLIC_READ_PERMISSION_REQUIRED' USING ERRCODE='P0001';
  END IF;
 END LOOP;
END $$;
CREATE FUNCTION web_read.guard_public_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE grant_id text;
BEGIN
 SELECT public_read_grant_id INTO grant_id FROM web_read.confirmations WHERE confirmation_id=NEW.confirmation_id;
 IF grant_id IS NOT NULL THEN
  PERFORM web_read.check_public_grant(grant_id,NEW.plan_id,NEW.owner_scope);
 END IF;
 RETURN NEW;
END $$;
-- Database-enforced at both admission and the actual one-shot dispatch consumption.
CREATE TRIGGER public_read_admission_guard BEFORE INSERT ON web_read.runs
 FOR EACH ROW EXECUTE FUNCTION web_read.guard_public_dispatch();
CREATE TRIGGER public_read_dispatch_guard BEFORE UPDATE OF dispatch_consumed_at ON web_read.runs
 FOR EACH ROW WHEN (OLD.dispatch_consumed_at IS NULL AND NEW.dispatch_consumed_at IS NOT NULL)
 EXECUTE FUNCTION web_read.guard_public_dispatch();
CREATE FUNCTION web_read.admit_public(p_plan text,p_digest text,p_owner text,p_grant text,p_execution text)
RETURNS TABLE(execution_id text,plan_digest text,state text,replayed boolean) LANGUAGE plpgsql AS $$
DECLARE r web_read.runs; p web_read.plans; confirmation text := 'public-'||p_plan;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('public-read:'||p_owner||':'||p_plan,0));
 SELECT * INTO r FROM web_read.runs WHERE confirmation_id=confirmation;
 IF FOUND THEN
  IF r.owner_scope<>p_owner OR r.plan_id<>p_plan OR r.digest<>p_digest THEN
   RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='P0001';
  END IF;
  -- Recovery is read-only: revocation/expiry must not create an uncertain duplicate.
  RETURN QUERY SELECT r.execution_id,r.digest,r.state,true; RETURN;
 END IF;
 SELECT * INTO p FROM web_read.plans WHERE plan_id=p_plan FOR UPDATE;
 IF NOT FOUND OR p.owner_scope<>p_owner OR p.digest<>p_digest THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='P0001';
 END IF;
 IF p.expires_at<=floor(extract(epoch FROM clock_timestamp())*1000) THEN
  RAISE EXCEPTION 'STALE_PLAN' USING ERRCODE='P0001';
 END IF;
 -- Prevent a public route from duplicating a previously manually admitted plan.
 IF EXISTS(SELECT 1 FROM web_read.runs WHERE plan_id=p_plan) THEN
  RAISE EXCEPTION 'ALREADY_ADMITTED' USING ERRCODE='P0001';
 END IF;
 PERFORM web_read.check_public_grant(p_grant,p_plan,p_owner);
 INSERT INTO web_read.confirmations(confirmation_id,plan_id,public_read_grant_id) VALUES(confirmation,p_plan,p_grant);
 INSERT INTO web_read.runs(execution_id,idempotency_scope,confirmation_id,plan_id,digest,owner_scope)
 VALUES(p_execution,'public-read:'||p_owner||':'||p_plan,confirmation,p_plan,p_digest,p_owner);
 INSERT INTO web_read.outbox(execution_id) VALUES(p_execution);
 RETURN QUERY SELECT p_execution,p_digest,'admitted'::text,false;
END $$;
REVOKE ALL ON web_read.public_read_grants FROM PUBLIC;
GRANT SELECT ON web_read.public_read_grants TO web_read_runtime,web_read_control,web_read_executor;
GRANT INSERT ON web_read.public_read_grants TO web_read_control;
GRANT UPDATE(revoked) ON web_read.public_read_grants TO web_read_control;
GRANT UPDATE(grant_id) ON web_read.public_read_grants TO web_read_executor;
GRANT INSERT ON web_read.confirmations TO web_read_executor;
GRANT CREATE ON SCHEMA web_read TO web_read_executor;
DO $$ DECLARE signature text; BEGIN
 FOREACH signature IN ARRAY ARRAY['web_read.check_public_grant(text,text,text)',
 'web_read.guard_public_dispatch()','web_read.admit_public(text,text,text,text,text)'] LOOP
  EXECUTE 'ALTER FUNCTION '||signature||' OWNER TO web_read_executor';
  EXECUTE 'ALTER FUNCTION '||signature||' SECURITY DEFINER';
  EXECUTE 'ALTER FUNCTION '||signature||' SET search_path=pg_catalog,web_read,pg_temp';
  EXECUTE 'REVOKE ALL ON FUNCTION '||signature||' FROM PUBLIC';
 END LOOP;
END $$;
REVOKE CREATE ON SCHEMA web_read FROM web_read_executor;
GRANT EXECUTE ON FUNCTION web_read.admit_public(text,text,text,text,text) TO web_read_runtime;
COMMIT;
