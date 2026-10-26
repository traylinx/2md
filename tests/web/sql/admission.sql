\set ON_ERROR_STOP on
INSERT INTO web_read.plans VALUES ('p1',repeat('a',64),'owner','{}',9999999999999);
INSERT INTO web_read.confirmations VALUES ('c1','p1',false),('c2','p1',true);
SELECT * FROM web_read.admit('p1',repeat('a',64),'owner','c1','key','run1');
DO $$ DECLARE r record; BEGIN
 SELECT * INTO r FROM web_read.admit('p1',repeat('a',64),'owner','c1','key','run2');
 IF r.execution_id <> 'run1' OR NOT r.replayed THEN RAISE EXCEPTION 'replay failed'; END IF;
 BEGIN
  PERFORM web_read.admit('p1',repeat('b',64),'owner','c1','key','run3');
  RAISE EXCEPTION 'missing conflict';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM <> 'IDEMPOTENCY_CONFLICT' THEN RAISE; END IF; END;
 BEGIN
  PERFORM web_read.admit('p1',repeat('a',64),'owner','c1','another-key','run3');
  RAISE EXCEPTION 'confirmation spent twice';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM <> 'ALREADY_ADMITTED' THEN RAISE; END IF; END;
 BEGIN
  PERFORM web_read.admit('p1',repeat('a',64),'foreign','c1','other','run4');
  RAISE EXCEPTION 'foreign owner admitted';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM <> 'FORBIDDEN' THEN RAISE; END IF; END;
 BEGIN
  PERFORM web_read.admit('p1',repeat('a',64),'owner','c2','revoked','run5');
  RAISE EXCEPTION 'revoked admitted';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM <> 'INVALID_CONFIRMATION' THEN RAISE; END IF; END;
 IF (SELECT count(*) FROM web_read.runs) <> 1 OR (SELECT count(*) FROM web_read.outbox) <> 1 THEN
  RAISE EXCEPTION 'non atomic admission'; END IF;
END $$;
-- Induced outbox failure must roll back its run too.
INSERT INTO web_read.confirmations VALUES ('c3','p1',false);
ALTER TABLE web_read.outbox ADD CONSTRAINT fixture_fail CHECK(execution_id <> 'fail');
DO $$ BEGIN
 BEGIN
  PERFORM web_read.admit('p1',repeat('a',64),'owner','c3','failure','fail');
  RAISE EXCEPTION 'missing failure';
 EXCEPTION WHEN check_violation THEN NULL; END;
 IF EXISTS(SELECT 1 FROM web_read.runs WHERE execution_id='fail') THEN RAISE EXCEPTION 'orphan run'; END IF;
END $$;
