-- Run only in an empty owned fixture database, after 008_browser_grants.sql.
BEGIN;
SET LOCAL ROLE web_browser_control;
INSERT INTO web_browser.grants(grant_id,organization_id,project_id,agent_subject,host_id,body,expires_at)
VALUES('fixture-grant','fixture-org','fixture-project','fixture-agent','fixture-host',
'{"grantId":"fixture-grant","agent":{"organizationId":"fixture-org","projectId":"fixture-project","authSubject":"fixture-agent"},"hostId":"fixture-host","policyVersion":"browser-v1","expiresAt":9999999999999,"approvedBy":"fixture-owner","approvedByWorkspaceUserId":"fixture-owner-user","hostKeyFingerprint":"fixture-only"}',9999999999999);
DO $$ BEGIN
 BEGIN UPDATE web_browser.grants SET body='{}'::jsonb; RAISE EXCEPTION 'control rewrote grant'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM web_browser.grants; RAISE EXCEPTION 'control deleted grant'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN TRUNCATE web_browser.grants; RAISE EXCEPTION 'control truncated grant'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
UPDATE web_browser.grants SET revoked=true WHERE grant_id='fixture-grant';
RESET ROLE;
SET LOCAL ROLE web_browser_runtime;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM web_browser.grants WHERE grant_id='fixture-grant' AND revoked) THEN RAISE EXCEPTION 'reader cannot see revocation'; END IF;
 BEGIN UPDATE web_browser.grants SET revoked=false; RAISE EXCEPTION 'reader revived grant'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO web_browser.grants SELECT * FROM web_browser.grants; RAISE EXCEPTION 'reader inserted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM web_browser.grants; RAISE EXCEPTION 'reader deleted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF has_schema_privilege('web_read_runtime','web_browser','USAGE') OR has_schema_privilege('web_read_control','web_browser','USAGE') THEN RAISE EXCEPTION 'legacy roles gained browser access'; END IF;
 IF has_schema_privilege('web_browser_runtime','web_read','USAGE') OR has_schema_privilege('web_browser_control','web_read','USAGE') THEN RAISE EXCEPTION 'browser roles gained legacy access'; END IF;
 IF has_schema_privilege('public','web_browser','USAGE') THEN RAISE EXCEPTION 'public schema access'; END IF;
 IF (SELECT count(*) FROM web_browser.grants)<>1 THEN RAISE EXCEPTION 'unexpected records'; END IF;
END $$;
ROLLBACK;
DO $$ BEGIN IF (SELECT count(*) FROM web_browser.grants)<>0 THEN RAISE EXCEPTION 'fixture rollback failed'; END IF; END $$;
SELECT 'PASS: real PG migration, scoped reader/control, immutable grant body, revocation, no public access, fixture rollback' AS result;
