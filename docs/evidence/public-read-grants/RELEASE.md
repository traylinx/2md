# Public-read MCP release: ready for user testing

Runtime source: `16015872bc02d6850ae40c685d962696a50096f9`.
READ image: `ghcr.io/traylinx/web-intelligence-agent@sha256:cebd1e6fbed3c0e8d7a8438fcd58b977a7d430499aff985f0cf2ef41a6da43a8`.
Control image: `ghcr.io/traylinx/web-intelligence-agent@sha256:51db56f10dd6d18128aba3de20f9ffefb18f08923359e0851e30903fc9378c6b`.
Both deployments ready; protected configuration unchanged. Migration007 applied
transactionally on existing web_intelligence database. Private image visibility
verified before/after publishing. AUTH/USERS, wallets and capture/legacy services
were not deployed or modified for this release.

## Evidence

- 150 JS tests passed, one pre-existing optional Redis case skipped. 17 final
  host-specific tests passed after wording/state corrections.
- Real PostgreSQL16 migration/roles/scope/expiry/admission/dispatch/revocation
  checks passed. Separate real PostgreSQL/Redis HTTP journey passed, with external
  identity and capture services represented by fixtures.
- Staged Gitleaks scan: no leaks. One bounded Lope claude-safe-review timed out at
  180s without an answer. Independent review is INCONCLUSIVE, not a review pass;
  no repeated review loop. Own source review and executed tests remain the evidence.
- Actual registered stdio MCP command, protected credential-file environment:
  eight tools, current grant discovery, preview/proposal without execution,
  ready-plan execution with no confirmation ID, safe duplicate submission,
  polling and result retrieval all verified against production.
- Run `eda79258-49a6-47f4-94ef-40651bd87b17`: completed, result complete,
  MiniMax11,609 characters and documentation3,529 characters. Both pages degraded;
  completeness of all website facts is not certified. Poll/result phase25.553s.
- SQL verification confirms exactly one run for that plan and separate standing
  grant provenance, without fictional per-plan human approval. Disallowed
  example.com proposal returned TARGET_DENIED and started no execution.

## Final test setup

The existing search-agent Sentinel pass now has a one-time owner-authenticated
test grant covering only https://www.minimax.io and https://2md.traylinx.com,
maximum5URLs,60seconds,2,000,000bytes, expiring **2026-10-29T12:49:24.400000+00:00**.
No human credential was saved or passed to MCP. Further users still need one-time
owner setup through the control API; a self-service settings UI is not part of
this release. This is not a claim of general-public commercial readiness.

Restart/reconnect the existing Codex MCP process to discard its old tool catalogue.
Then ask the agent to preview the MiniMax read. After your go, the host should call
run_public_read and return evidence without owner commands or confirmation IDs.
That human-in-the-loop conversational acceptance is the final user test, not a
claim that the scripted transport test already tested every model/client.

## Rollback / resume

Root-only previous deployment specifications live on traylinx-k3s-01:
`/root/.traylinx-web-read-public-grants-before-20261028.json` and
`/root/.traylinx-web-control-public-grants-before-20261028.json`.
Revoke the release's standing permission before image rollback; retain schema,
run history and unknown-outcome records. No replay/deletion. Exact current
checkpoint: workspace docs/sprints/CURRENT_STATUS.md.
