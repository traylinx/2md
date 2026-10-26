\set ON_ERROR_STOP on
INSERT INTO web_read.confirmations VALUES ('result','p1',false);
SELECT * FROM web_read.admit('p1',repeat('a',64),'owner','result','result-key','result-run');
SELECT * FROM web_read.claim('result-run','worker1',30000);
DO $$ DECLARE expiry bigint := floor(extract(epoch FROM clock_timestamp())*1000)+60000; BEGIN
 IF web_read.finish('result-run','other',1,'completed','partial',expiry) THEN RAISE EXCEPTION 'wrong publisher'; END IF;
 IF NOT web_read.finish('result-run','worker1',1,'completed','partial',expiry) THEN RAISE EXCEPTION 'publication missing'; END IF;
 IF (SELECT result_expires_at FROM web_read.runs WHERE execution_id='result-run')<>expiry THEN RAISE EXCEPTION 'expiry missing'; END IF;
 IF web_read.finish('result-run','worker1',1,'completed','complete',expiry) THEN RAISE EXCEPTION 'publication overwritten'; END IF;
END $$;
