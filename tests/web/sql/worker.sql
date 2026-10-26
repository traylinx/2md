\set ON_ERROR_STOP on
DO $$ DECLARE r record; BEGIN
 SELECT * INTO r FROM web_read.claim('run1','worker1',30000);
 IF r.fence<>1 OR r.execution_id<>'run1' THEN RAISE EXCEPTION 'claim missing'; END IF;
 IF EXISTS(SELECT * FROM web_read.claim('run1','worker2',30000)) THEN RAISE EXCEPTION 'duplicate claim'; END IF;
 IF web_read.finish('run1','worker2',1,'completed','complete') THEN RAISE EXCEPTION 'wrong worker'; END IF;
 IF web_read.finish('run1','worker1',2,'completed','complete') THEN RAISE EXCEPTION 'wrong fence'; END IF;
 IF NOT web_read.finish('run1','worker1',1,'completed','partial') THEN RAISE EXCEPTION 'finish rejected'; END IF;
 IF web_read.finish('run1','worker1',1,'completed','complete') THEN RAISE EXCEPTION 'terminal overwritten'; END IF;
 IF (SELECT result_state FROM web_read.runs WHERE execution_id='run1')<>'partial' THEN RAISE EXCEPTION 'partial lost'; END IF;
END $$;
INSERT INTO web_read.confirmations VALUES ('crash','p1',false),('revoke','p1',false);
SELECT * FROM web_read.admit('p1',repeat('a',64),'owner','crash','crash-key','crash-run');
SELECT * FROM web_read.claim('crash-run','worker1',30000);
UPDATE web_read.runs SET lease_until=clock_timestamp()-interval '1 second' WHERE execution_id='crash-run';
DO $$ BEGIN
 IF web_read.finish('crash-run','worker1',1,'completed','complete') THEN RAISE EXCEPTION 'expired finish'; END IF;
 IF web_read.reconcile_expired(10)<>1 THEN RAISE EXCEPTION 'reconciliation missing'; END IF;
 IF EXISTS(SELECT * FROM web_read.claim('crash-run','worker2',30000)) THEN RAISE EXCEPTION 'uncertain replay'; END IF;
 IF EXISTS(SELECT 1 FROM web_read.outbox WHERE execution_id='crash-run') THEN RAISE EXCEPTION 'uncertain queued'; END IF;
END $$;
SELECT * FROM web_read.admit('p1',repeat('a',64),'owner','revoke','revoke-key','revoke-run');
UPDATE web_read.confirmations SET revoked=true WHERE confirmation_id='revoke';
DO $$ BEGIN
 IF EXISTS(SELECT * FROM web_read.claim('revoke-run','worker1',30000)) THEN RAISE EXCEPTION 'revoked dispatch'; END IF;
 IF (SELECT state FROM web_read.runs WHERE execution_id='revoke-run')<>'failed' THEN RAISE EXCEPTION 'revoked not terminal'; END IF;
END $$;
