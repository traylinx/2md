\set ON_ERROR_STOP on
INSERT INTO web_read.confirmations VALUES ('dispatch','p1',false);
SELECT * FROM web_read.admit('p1',repeat('a',64),'owner','dispatch','dispatch-key','dispatch-run');
SELECT * FROM web_read.claim('dispatch-run','worker1',30000);
DO $$ BEGIN
 IF EXISTS(SELECT * FROM web_read.consume_dispatch('dispatch-run',NULL,1,repeat('a',64))) THEN RAISE EXCEPTION 'null owner'; END IF;
 IF EXISTS(SELECT * FROM web_read.consume_dispatch('dispatch-run','wrong',1,repeat('a',64))) THEN RAISE EXCEPTION 'wrong owner'; END IF;
 IF EXISTS(SELECT * FROM web_read.consume_dispatch('dispatch-run','worker1',2,repeat('a',64))) THEN RAISE EXCEPTION 'wrong fence'; END IF;
 IF EXISTS(SELECT * FROM web_read.consume_dispatch('dispatch-run','worker1',1,repeat('b',64))) THEN RAISE EXCEPTION 'wrong digest'; END IF;
 IF NOT EXISTS(SELECT * FROM web_read.consume_dispatch('dispatch-run','worker1',1,repeat('a',64))) THEN RAISE EXCEPTION 'missing consume'; END IF;
 IF EXISTS(SELECT * FROM web_read.consume_dispatch('dispatch-run','worker1',1,repeat('a',64))) THEN RAISE EXCEPTION 'duplicate consume'; END IF;
END $$;
