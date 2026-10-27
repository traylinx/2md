-- Actual SET ROLE checks, not just ACL catalogue snapshots.
SET ROLE web_read_runtime;
INSERT INTO web_read.plans VALUES ('role-plan',repeat('d',64),'role-owner','{}',floor(extract(epoch FROM clock_timestamp())*1000)+60000);
INSERT INTO web_read.confirmations VALUES ('role-confirm','role-plan',false);
SELECT * FROM web_read.admit('role-plan',repeat('d',64),'role-owner','role-confirm','role-key','role-run');
SELECT * FROM web_read.claim('role-run','role-worker',10000);
SELECT * FROM web_read.consume_dispatch('role-run','role-worker',1,repeat('d',64));
SELECT web_read.finish('role-run','role-worker',1,'failed',NULL,NULL);
SELECT web_read.reconcile_expired(10);
DO $$ BEGIN
 BEGIN
   UPDATE web_read.runs SET state='completed' WHERE execution_id='role-run';
   RAISE EXCEPTION 'runtime bypassed fenced lifecycle';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   DELETE FROM web_read.plans WHERE plan_id='role-plan';
   RAISE EXCEPTION 'runtime deleted immutable plan';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   CREATE TABLE web_read.unwanted (id integer);
   RAISE EXCEPTION 'runtime has schema create';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE web_read_control;
SELECT plan_id FROM web_read.plans WHERE plan_id='role-plan';
INSERT INTO web_read.confirmations VALUES ('control-confirm','role-plan',false)
 ON CONFLICT (confirmation_id) DO UPDATE SET confirmation_id=EXCLUDED.confirmation_id;
DO $$ BEGIN
 BEGIN
   PERFORM web_read.admit('role-plan',repeat('d',64),'role-owner','control-confirm','forbidden','forbidden');
   RAISE EXCEPTION 'control can admit';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   SELECT execution_id FROM web_read.runs LIMIT 1;
   RAISE EXCEPTION 'control can read runs';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('web_read_runtime','web_read_control','web_read_executor') AND (rolcanlogin OR rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls)) THEN
   RAISE EXCEPTION 'unsafe role attributes'; END IF;
 IF (SELECT state FROM web_read.runs WHERE execution_id='role-run') <> 'failed' THEN RAISE EXCEPTION 'runtime lifecycle failed'; END IF;
END $$;
