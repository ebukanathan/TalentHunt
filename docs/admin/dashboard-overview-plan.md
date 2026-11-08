# ADMIN-05: Admin Dashboard Overview

Issue: [ADMIN-05 #41](https://github.com/ebukanathan/TalentHunt/issues/41). [Roadmap](../project-management/roadmap.md). This proposal is awaiting implementation approval; publishing it does not authorize coding or merging.

First task in the non-payment roadmap, 7 November 2026 (Africa/Lagos). Parent: #18. Status: Next, awaiting explicit implementation-plan approval. Do not begin application coding until approval.

## Inspected baseline and dependencies

- ADMIN-01 #8, ADMIN-02 #10, ADMIN-03 #35 and ADMIN-04 #9 are closed/Done and merged (PRs #36-#40). Current main: 05557ce.
- /admin currently shows competition name/status/dates and management links. It has no overview statistics or recent-activity API.
- Existing Express-owned sessions, active-admin checks, Next.js server-side page guards, Prisma models and selected-competition policy are available. No schema migration is expected.
- Fresh inspection checks: 16 admin unit tests and 21 frontend tests passed. The full 89-test API and real Next/Express/PostgreSQL flow passed in the merged ADMIN-04 verification; full checks will be rerun for this feature.
- Recurring image-cleanup scheduling and manual visual/mobile/keyboard QA remain follow-ups; they do not block read-only overview statistics.

## Proposed implementation

1. Add GET /api/v1/admin/overview behind existing session/active-admin guards, with private no-store responses. Use Prisma/PostgreSQL read queries and a consistent transaction snapshot for the selected competition, including drafts. Preserve configured-slug selection and missing-competition behavior.
2. Return competition name/status/opening/closing, total contestants, active contestants, and active vote-package count (isActive=true, separately described from current purchase eligibility). Counts must be competition-scoped, including correct zero values when the selected competition has no rows.
3. Return the 10 most recent administrative changes belonging to that competition and its contestants/packages, ordered deterministically by timestamp and ID. Project only a safe action label, entity reference, actor display and timestamp. Do not expose raw audit details, IP addresses, secrets or payment contact data. The full audit-history explorer stays in #18.
4. Read existing Payment records only for optional financial summaries. Display recorded counts and recorded PAID NGN amounts only when supported by qualifying persisted rows; clearly distinguish recorded amounts from settled/provider-confirmed revenue. Exclude pending/failed/refunded amounts, keep integer-kobo precision, and show explicit unavailable/no-payment-data states when no qualifying records exist. Never infer revenue from packages or contestant vote totals.
5. Render protected /admin overview cards, Africa/Lagos dates, links to list/register/manage contestants and competition/packages, plus recent activity. Validate the server response with Zod. Show accessible loading, no-competition, empty-activity, financial-unavailable and retryable error states; database failures must never become zero statistics.
6. Add authorization/expiry/inactive-admin, selection/competition-isolation, count accuracy, empty/error, activity projection/order/limit and exact financial-display tests. Exercise the Next/Express/PostgreSQL path. Do not manufacture financial rows to populate the dashboard; use read mocks for non-empty finance cases and empty financial tables in the new database fixtures.

## Acceptance criteria

- [ ] Protected API and page use the existing Express, Prisma, Zod and Next.js architecture.
- [ ] Name/status, real counts, voting dates, shortcuts and recent activity are implemented without hardcoded statistics.
- [ ] No-competition, genuine-zero, loading, empty-activity, finance-unavailable and upstream-failure states are distinct and accessible.
- [ ] Financial data is read-only, precisely labelled and based exclusively on stored records; no artificial financial records or payment processing.
- [ ] Relevant tests, full existing regression suite, API/web TypeScript checks, lint and production builds pass on guarded disposable localhost databases.
- [ ] Preserve payment code, every database model and all migration history. No hosted data writes or payment-provider requests.
- [ ] After approval: branch feat/admin-05-dashboard-overview from current main, implement, run checks, push, and open a linked PR. Do not merge without approval.
