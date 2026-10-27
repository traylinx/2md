-- Manual operator migration after 001..004. No passwords or LOGIN roles.
-- Existing role names cause an atomic failure rather than adopting unknown grants.
BEGIN;
CREATE ROLE web_read_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE web_read_control NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE web_read_executor NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA web_read TO web_read_runtime, web_read_control, web_read_executor;
GRANT SELECT ON web_read.plans, web_read.confirmations, web_read.runs, web_read.outbox TO web_read_runtime;
GRANT INSERT ON web_read.plans, web_read.confirmations TO web_read_runtime;
GRANT UPDATE (confirmation_id) ON web_read.confirmations TO web_read_runtime;
GRANT SELECT ON web_read.plans, web_read.confirmations TO web_read_control;
GRANT INSERT ON web_read.confirmations TO web_read_control;
GRANT UPDATE (confirmation_id) ON web_read.confirmations TO web_read_control;
-- The function owner has the transaction permissions, never a LOGIN or caller membership.
GRANT SELECT ON ALL TABLES IN SCHEMA web_read TO web_read_executor;
GRANT INSERT, UPDATE ON web_read.runs TO web_read_executor;
GRANT INSERT, DELETE ON web_read.outbox TO web_read_executor;
-- SELECT FOR UPDATE needs an UPDATE privilege; no function changes these columns.
GRANT UPDATE (plan_id) ON web_read.plans TO web_read_executor;
GRANT UPDATE (confirmation_id) ON web_read.confirmations TO web_read_executor;
GRANT CREATE ON SCHEMA web_read TO web_read_executor;
DO $$
DECLARE signature text;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
 'web_read.admit(text,text,text,text,text,text)',
 'web_read.claim(text,text,integer)',
 'web_read.finish(text,text,bigint,text,text,bigint)',
 'web_read.reconcile_expired(integer)',
 'web_read.consume_dispatch(text,text,bigint,text)'
 ] LOOP
   EXECUTE 'ALTER FUNCTION ' || signature || ' OWNER TO web_read_executor';
   EXECUTE 'ALTER FUNCTION ' || signature || ' SECURITY DEFINER';
   EXECUTE 'ALTER FUNCTION ' || signature || ' SET search_path = pg_catalog, web_read, pg_temp';
   EXECUTE 'REVOKE ALL ON FUNCTION ' || signature || ' FROM PUBLIC';
   EXECUTE 'GRANT EXECUTE ON FUNCTION ' || signature || ' TO web_read_runtime';
 END LOOP;
END $$;
REVOKE CREATE ON SCHEMA web_read FROM web_read_executor;
COMMIT;
