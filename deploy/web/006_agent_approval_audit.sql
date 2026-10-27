-- Manual additive migration; no automatic activation or backfill of approvals.
BEGIN;
ALTER TABLE web_read.confirmations ADD COLUMN approved_by text;
ALTER TABLE web_read.confirmations ADD CONSTRAINT approved_by_identifier
 CHECK (approved_by IS NULL OR approved_by ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$');
COMMIT;
