# TalentHunt — Non-payment development roadmap

Updated 7 November 2026 (Africa/Lagos). This sequence supersedes previous payment-first and admin-foundation plans.

Published to the repository on 8 November 2026 (Africa/Lagos). [GitHub Project](https://github.com/users/ebukanathan/projects/3) · [ADMIN-05 implementation proposal](../admin/dashboard-overview-plan.md). Implementation approval remains pending.

## Execution order

| Order | Work | Issues | State |
| --- | --- | --- | --- |
| 1 | Admin dashboard overview and PostgreSQL competition statistics | [ADMIN-05 #41](https://github.com/ebukanathan/TalentHunt/issues/41); audit explorer parent #18 | Next — plan approval required before coding |
| 2 | Public leaderboard and completed competition results | [#32](https://github.com/ebukanathan/TalentHunt/issues/32) | Backlog |
| 3 | Public website completion, responsiveness, accessibility and SEO | [#42](https://github.com/ebukanathan/TalentHunt/issues/42), [#30](https://github.com/ebukanathan/TalentHunt/issues/30), [#31](https://github.com/ebukanathan/TalentHunt/issues/31); parent [#11](https://github.com/ebukanathan/TalentHunt/issues/11) | Backlog |
| 4 | Standalone transactional email infrastructure and templates | [#43](https://github.com/ebukanathan/TalentHunt/issues/43); configuration support [#5](https://github.com/ebukanathan/TalentHunt/issues/5) | Backlog |
| 5 | Automated tests, security and CI/CD | [#20](https://github.com/ebukanathan/TalentHunt/issues/20), [#21](https://github.com/ebukanathan/TalentHunt/issues/21), remaining #5 | Backlog; feature tests accompany every change |
| 6 | Non-payment staging deployment and documentation | scoped [#22](https://github.com/ebukanathan/TalentHunt/issues/22), [#23](https://github.com/ebukanathan/TalentHunt/issues/23), [#4](https://github.com/ebukanathan/TalentHunt/issues/4) | Backlog |

Group/filter the board by **Roadmap workstream**, whose numbered options match this order. ADMIN-05 is the only Next task; keep at most one item In Progress after approval. Priorities of open payment-dependent items are P2 and their workstream is Paused, not a promise to resume.

## Verified source and completion

Current main is 05557ce (merged PR #40). ADMIN-01 #8, ADMIN-02 #10, ADMIN-03 #35 and ADMIN-04 #9 are closed/Done and implemented through PRs #36–#40. Foundation #1–#3, public API #27 and homepage/list #29 are also Done. PAY-01 #13 is an existing completed baseline, retained without expansion.

Inspection found a basic protected overview showing competition details/shortcuts, but no aggregate statistics or activity feed. A basic profile route exists while #30's full acceptance is unfinished. Leaderboard/results, package selection, standalone email transport/templates, sitemap/robots and CI workflows are absent. Broader #4/#5/#18/#20/#22/#23 acceptance remains unfinished; existing code is not evidence that those whole issues are Done.

Fresh inspection tests: 16 admin unit tests and 21 frontend tests passed. Merged ADMIN-04 evidence records 89 API tests, integration, builds and migration-drift checks on disposable databases. New implementation will rerun appropriate full checks; no fresh full-integration run is claimed for this planning update. Image cleanup scheduling, deployment hardening and manual visual/mobile/keyboard review remain follow-ups.

## Payment suspension and preservation

Further Paystack/payment processing is suspended until explicitly instructed to resume. #14–#17, payment reporting #19, payment-linked #6/#7/#12 and paid launch #24 stay Backlog/Paused. Existing initialization code, every payment-related model (including legacy verification models), financial records and all migration files/checksums must remain intact. Earlier model-removal proposals are superseded. Do not generate artificial financial records or infer revenue from packages/votes.

Standalone #43 prepares infrastructure/templates without payment-triggered dispatch. The new non-payment staging slice in #22 does not require paid checkout or claim a paid-voting launch. Preserve all issue IDs and historical requirements; deferred financial work is not marked complete.

## ADMIN-05 approval and delivery gate

The issue contains the concrete API/UI/data/test plan. Reuse Express-owned session authorization, active-admin checks, Prisma/PostgreSQL and Next.js/Zod. Database counts and a safe bounded recent-activity feed are selected-competition scoped. Financial summaries are read-only recorded values when qualifying rows exist, otherwise explicitly unavailable. Loading, empty/no-competition, financial-unavailable and real upstream errors must be distinct.

No application coding has started. After explicit approval: create feat/admin-05-dashboard-overview from current main, implement, test on guarded disposable localhost databases, run lint/typechecks/builds/regressions, push and open a linked PR. Never merge without approval. Project visibility and unrelated completed work remain unchanged.
