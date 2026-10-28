-- GB01: additive permission storage only. No existing grants are widened and no
-- permission is seeded. Apply with the controlled browser release, never on boot.
-- Rollback disables browser routes/capabilities; retain this table and audit data.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE SCHEMA web_browser;
REVOKE ALL ON SCHEMA web_browser FROM PUBLIC;
CREATE TABLE web_browser.grants (
  grant_id text PRIMARY KEY CHECK (length(grant_id) BETWEEN 1 AND 128),
  organization_id text NOT NULL,
  project_id text NOT NULL,
  agent_subject text NOT NULL,
  host_id text NOT NULL,
  body jsonb NOT NULL CHECK (jsonb_typeof(body)='object'),
  expires_at bigint NOT NULL CHECK (expires_at>0),
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((body->>'grantId') IS NOT DISTINCT FROM grant_id),
  CHECK ((body->'agent'->>'organizationId') IS NOT DISTINCT FROM organization_id),
  CHECK ((body->'agent'->>'projectId') IS NOT DISTINCT FROM project_id),
  CHECK ((body->'agent'->>'authSubject') IS NOT DISTINCT FROM agent_subject),
  CHECK ((body->>'hostId') IS NOT DISTINCT FROM host_id),
  CHECK ((body->>'policyVersion') IS NOT DISTINCT FROM 'browser-v1'),
  CHECK ((body->>'expiresAt') IS NOT DISTINCT FROM expires_at::text),
  CHECK (body ? 'approvedBy' AND body ? 'approvedByWorkspaceUserId' AND body ? 'hostKeyFingerprint')
);
CREATE INDEX browser_grants_active_host ON web_browser.grants
  (organization_id,project_id,agent_subject,host_id) WHERE NOT revoked;
REVOKE ALL ON web_browser.grants FROM PUBLIC;
GRANT USAGE ON SCHEMA web_browser TO web_read_runtime,web_read_control;
GRANT SELECT ON web_browser.grants TO web_read_runtime,web_read_control;
GRANT INSERT ON web_browser.grants TO web_read_control;
GRANT UPDATE(revoked) ON web_browser.grants TO web_read_control;
COMMIT;
