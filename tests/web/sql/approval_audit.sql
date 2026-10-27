SET ROLE web_read_control;
INSERT INTO web_read.confirmations(confirmation_id,plan_id,approved_by) VALUES ('audit-confirm','role-plan','human-owner');
DO $$ DECLARE n integer; BEGIN
 INSERT INTO web_read.confirmations(confirmation_id,plan_id,approved_by) VALUES ('audit-confirm','role-plan','different-owner')
 ON CONFLICT (confirmation_id) DO UPDATE SET confirmation_id=EXCLUDED.confirmation_id
 WHERE web_read.confirmations.plan_id=EXCLUDED.plan_id AND web_read.confirmations.approved_by=EXCLUDED.approved_by AND NOT web_read.confirmations.revoked;
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n <> 0 THEN RAISE EXCEPTION 'approver substitution accepted'; END IF;
 BEGIN
   UPDATE web_read.confirmations SET approved_by='different-owner' WHERE confirmation_id='audit-confirm';
   RAISE EXCEPTION 'approver audit mutable by control role';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
