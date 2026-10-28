-- Independent fixture namespace; existing manual approval tests remain intact.
INSERT INTO web_read.plans(plan_id,digest,owner_scope,body,expires_at)
SELECT 'pub-plan',repeat('c',64),'pub-owner',jsonb_build_object(
 'principalKind','agent','policyVersion','v1','urls',jsonb_build_array('https://example.com/a'),
 'deadlineMs',1000,'maxResponseBytes',1024),floor(extract(epoch FROM clock_timestamp())*1000)+60000;
INSERT INTO web_read.public_read_grants(grant_id,owner_scope,body,approved_by,expires_at)
SELECT 'grant-1','pub-owner','{"policyVersion":"v1","origins":["https://example.com"],"maxUrls":2,"deadlineMs":2000,"maxResponseBytes":2048}',
 'real-human',floor(extract(epoch FROM clock_timestamp())*1000)+60000;
SET ROLE web_read_runtime;
DO $$ BEGIN
 BEGIN PERFORM * FROM web_read.admit_public('pub-plan',repeat('c',64),'foreign','grant-1','bad');RAISE EXCEPTION 'foreign allowed';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'FORBIDDEN' THEN RAISE; END IF; END;
 BEGIN PERFORM * FROM web_read.admit_public('pub-plan',repeat('c',64),'pub-owner',NULL,'bad');RAISE EXCEPTION 'missing allowed';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'PUBLIC_READ_PERMISSION_REQUIRED' THEN RAISE; END IF; END;
END $$;
SELECT * FROM web_read.admit_public('pub-plan',repeat('c',64),'pub-owner','grant-1','pub-run');
SELECT * FROM web_read.claim('pub-run','pub-worker',10000);
RESET ROLE;
UPDATE web_read.public_read_grants SET revoked=true WHERE grant_id='grant-1';
SET ROLE web_read_runtime;
DO $$ DECLARE r record; BEGIN
 SELECT * INTO r FROM web_read.admit_public('pub-plan',repeat('c',64),'pub-owner',NULL,'duplicate');
 IF r.execution_id<>'pub-run' OR NOT r.replayed THEN RAISE EXCEPTION 'recovery duplicate'; END IF;
 BEGIN PERFORM * FROM web_read.consume_dispatch('pub-run','pub-worker',1,repeat('c',64));RAISE EXCEPTION 'revoked dispatch allowed';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'PUBLIC_READ_PERMISSION_REQUIRED' THEN RAISE; END IF; END;
 IF (SELECT dispatch_consumed_at FROM web_read.runs WHERE execution_id='pub-run') IS NOT NULL THEN RAISE EXCEPTION 'consumed revoked';END IF;
END $$;
RESET ROLE;
UPDATE web_read.public_read_grants SET revoked=false WHERE grant_id='grant-1';
SET ROLE web_read_runtime;
SELECT * FROM web_read.consume_dispatch('pub-run','pub-worker',1,repeat('c',64));
DO $$ BEGIN
 IF (SELECT count(*) FROM web_read.consume_dispatch('pub-run','pub-worker',1,repeat('c',64)))<>0 THEN RAISE EXCEPTION 'duplicate consumption';END IF;
 IF (SELECT approved_by FROM web_read.confirmations WHERE confirmation_id='public-pub-plan') IS NOT NULL THEN RAISE EXCEPTION 'fabricated owner approval';END IF;
 BEGIN UPDATE web_read.public_read_grants SET revoked=false WHERE grant_id='grant-1';RAISE EXCEPTION 'runtime changed grant';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
-- Actual SQL constraints, not only JS selection: origins/limits/version/expiry.
DO $$ DECLARE property text; original jsonb; BEGIN
 SELECT body INTO original FROM web_read.plans WHERE plan_id='pub-plan';
 FOREACH property IN ARRAY ARRAY['origin','deadline','bytes','count','policy'] LOOP
  UPDATE web_read.plans SET body=CASE property
   WHEN 'origin' THEN jsonb_set(original,'{urls}','["https://evil.example/a"]')
   WHEN 'deadline' THEN jsonb_set(original,'{deadlineMs}','3000')
   WHEN 'bytes' THEN jsonb_set(original,'{maxResponseBytes}','4096')
   WHEN 'count' THEN jsonb_set(original,'{urls}','["https://example.com/a","https://example.com/b","https://example.com/c"]')
   ELSE jsonb_set(original,'{policyVersion}','"different"') END WHERE plan_id='pub-plan';
  BEGIN PERFORM web_read.check_public_grant('grant-1','pub-plan','pub-owner');RAISE EXCEPTION 'scope accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'PUBLIC_READ_PERMISSION_REQUIRED' THEN RAISE;END IF;END;
 END LOOP;
 UPDATE web_read.plans SET body=original WHERE plan_id='pub-plan';
 UPDATE web_read.public_read_grants SET expires_at=1 WHERE grant_id='grant-1';
 BEGIN PERFORM web_read.check_public_grant('grant-1','pub-plan','pub-owner');RAISE EXCEPTION 'expired accepted';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'PUBLIC_READ_PERMISSION_REQUIRED' THEN RAISE;END IF;END;
END $$;
