# AgentRelay onboarding follow-up — 4 October 2026

Canonical sprint: `/Users/sebastian/Projects/agent-relay/docs/sprints/sprint-013-onboarding-polish/SPRINT.md`.

This 2md correction changes mobile presentation only. Cookie consent width is
bounded by the actual viewport with border-box sizing and wrapping, preserving
policy link, delayed visibility and explicit accepted/declined storage behavior.
Related narrow-screen overflow from input toggles, tooltips, shortcut form, code
samples and footer is repaired at the existing640px breakpoint. No global overflow
mask, conversion behavior, published business notice, ownership file, Relay link,
receiving inbox, activation or website profile is changed.

Local tests: four files /13 passed; Vite build passed. Real Chrome at320px and390px
reports document width exactly equal to viewport. Cookie width272/342px,24px outer
inset; compact actions visible. These checks do not prove deployment.

Release approval: Sebastian authorized scoped fixes and main/production promotion.
Final exact deployment evidence belongs in Sprint013's release record.
