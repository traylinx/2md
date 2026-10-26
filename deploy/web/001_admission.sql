-- Apply only to a separately approved product database. Not part of auto-deploy.
BEGIN;
CREATE SCHEMA web_read;
CREATE TABLE web_read.plans (
  plan_id text PRIMARY KEY,
  digest text NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
  owner_scope text NOT NULL,
  body jsonb NOT NULL,
  expires_at bigint NOT NULL
);
CREATE TABLE web_read.confirmations (
  confirmation_id text PRIMARY KEY,
  plan_id text NOT NULL REFERENCES web_read.plans,
  revoked boolean NOT NULL DEFAULT false
);
CREATE TABLE web_read.runs (
  execution_id text PRIMARY KEY,
  idempotency_scope text NOT NULL UNIQUE,
  confirmation_id text NOT NULL UNIQUE REFERENCES web_read.confirmations,
  plan_id text NOT NULL REFERENCES web_read.plans,
  digest text NOT NULL,
  owner_scope text NOT NULL,
  state text NOT NULL DEFAULT 'admitted' CHECK (state IN
    ('admitted','running','completed','failed','needs_reconciliation')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- Queue entries contain references only, never credentials or captured output.
CREATE TABLE web_read.outbox (
  execution_id text PRIMARY KEY REFERENCES web_read.runs,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION web_read.admit(p_plan text, p_digest text, p_owner text,
  p_confirmation text, p_key text, p_execution text)
RETURNS TABLE(execution_id text, plan_digest text, state text, replayed boolean)
LANGUAGE plpgsql AS $$
DECLARE existing web_read.runs; selected web_read.plans; consent web_read.confirmations;
BEGIN
  -- Serialize same scoped key even when callers reference different plans.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_key, 0));
  SELECT * INTO existing FROM web_read.runs r WHERE r.idempotency_scope = p_key;
  IF FOUND THEN
    IF existing.owner_scope <> p_owner OR existing.digest <> p_digest OR
       existing.plan_id <> p_plan OR existing.confirmation_id <> p_confirmation THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    RETURN QUERY SELECT existing.execution_id, existing.digest, existing.state, true;
    RETURN;
  END IF;
  SELECT * INTO selected FROM web_read.plans WHERE plan_id = p_plan FOR UPDATE;
  IF NOT FOUND OR selected.owner_scope <> p_owner OR selected.digest <> p_digest THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  IF selected.expires_at <= floor(extract(epoch FROM clock_timestamp()) * 1000) THEN
    RAISE EXCEPTION 'STALE_PLAN' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO consent FROM web_read.confirmations WHERE confirmation_id = p_confirmation FOR UPDATE;
  IF NOT FOUND OR consent.plan_id <> p_plan OR consent.revoked THEN
    RAISE EXCEPTION 'INVALID_CONFIRMATION' USING ERRCODE = 'P0001';
  END IF;
  -- A second key cannot spend the same confirmation again.
  IF EXISTS (SELECT 1 FROM web_read.runs r WHERE r.confirmation_id = p_confirmation) THEN
    RAISE EXCEPTION 'ALREADY_ADMITTED' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO web_read.runs(execution_id,idempotency_scope,confirmation_id,plan_id,digest,owner_scope)
    VALUES(p_execution,p_key,p_confirmation,p_plan,p_digest,p_owner);
  INSERT INTO web_read.outbox(execution_id) VALUES(p_execution);
  RETURN QUERY SELECT p_execution, p_digest, 'admitted'::text, false;
END $$;
REVOKE ALL ON SCHEMA web_read FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA web_read FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA web_read FROM PUBLIC;
COMMIT;
