# CAT-03 contestant assignment and rollout

Issue #64, built on the approved CAT-02 PR #67 merge (`a6c78e1`) into `test/public-website-verification`. During implementation, separate PR #68 merged that dependency base into main as `4a94dc8`, with an identical Git tree. CAT-03 PR #69 therefore targets main for review; CAT-03 is not merged or deployed. Paystack work remains paused. CAT-04 and CAT-05 must complete public category filtering and scoped rankings before a coordinated release.

## Administrator workflow

Create categories and children in Categories. New contestant forms require a category and its dependent subcategory, loaded from authenticated database APIs with pagination. No production taxonomy is seeded. Inactive current selections remain visible for profile-only edits; switching the parent clears the child. Photographs and zero to two YouTube videos retain their existing workflows.

History-free contestants may move to another active matching group using their current assignment revision. Every Payment status, VoteAllocation, captured PaymentScope or nonzero vote total blocks an ordinary move. Published results also freeze membership. There is no force switch or general correction executor. A history-bearing move between real groups requires a separately designed and approved append-only correction workflow.

The private Pending assignments queue includes inactive legacy contestants. Open a contestant's review, inspect payment/allocation/scope counts and exact recorded votes, select an active group, provide a reason of 10–1000 characters and type the exact contestant number. Confirmation uses the reviewed history fingerprint and assignment revision; changed history requires a fresh review. Initial classification and its actor/reason/history audit commit atomically. It establishes new grouping without claiming unknown historical scope or changing historical payments, votes, allocations or media. Already-published global results require a separate archival/classification decision and are blocked here.

Category setup requires a separate review and the exact competition name. Every active contestant must have an active valid assignment; inactive legacy contestants may remain pending during expansion. Taxonomy, membership and assignment changes invalidate readiness and require another review. Setup does not publish results, apply the final schema contraction or enable payments.

## REST contracts

All paths are under `/api/v1/admin`; the Next facade uses `/api/admin`. Reuse active administrator sessions, no-store, strict bodies/queries, Origin and CSRF checks. The backend selects the competition; clients cannot override ownership.

| Endpoint | Contract |
| --- | --- |
| `GET /contestants?assignment=all\|pending\|assigned` | Existing pagination/status/search plus assignment filter; includes inactive records when requested. |
| `POST /contestants` | Existing profile/video fields plus required `categoryId`, `subcategoryId`; both must be active and share selected competition/parent. |
| `GET /contestants/:id` | Adds paired IDs, nested subcategory/category summaries, `assignmentRevision` and private `assignment` history/lock metadata to the existing detail envelope. |
| `PATCH /contestants/:id` | Assignment fields may be omitted for profile-only edits. If supplied, require both IDs and `expectedAssignmentRevision`. Reject legacy initial assignment, stale revisions and history-bearing moves. |
| `GET /contestants/:id/initial-assignment` | Legacy-only preview: competition, contestant and `history` containing counts, exact string `totalVotes`, `locked`, opaque `reviewToken`. |
| `POST /contestants/:id/initial-assignment` | `{categoryId, subcategoryId, expectedAssignmentRevision, expectedReviewToken, reason, confirmationNumber}`. Returns contestant; identical completed review may be retried without a duplicate audit. |
| `GET /competition/category-setup` | Competition, total/pending/invalid-active assignment counts and opaque `reviewToken`. |
| `POST /competition/confirm-category-setup` | `{competitionId, expectedReviewToken, confirmationName}`; returns confirmed competition. |

Invalid relationships return 400; missing/expired authentication 401; inactive-admin/CSRF failures 403; foreign/missing contestants 404; stale reviews, locked history, already-classified contestants and incomplete/published setup 409. Internal/provider messages are not forwarded to the UI. `CONTESTANT_INITIAL_ASSIGNED`, `CONTESTANT_ASSIGNMENT_CHANGED`, `CATEGORY_SETUP_CONFIRMED` and `CATEGORY_SETUP_INVALIDATED` audits are transactional; the overview exposes its safe projection only.

## Additive migration and financial boundary

`20261118180000_add_assignment_integrity` adds nullable `Competition.categoryIntegrityEnabledAt`, a PaymentScope contestant lookup index and future-write guards. It does not rewrite existing data or historical migrations. Category readiness can be cleared; once enabled, the integrity timestamp cannot be cleared or changed. This prevents readiness invalidation from reopening unscoped financial writes.

The existing initialization reservation now locks the competition before eligibility rows, validates active ancestry and reviewed readiness, and creates immutable PaymentScope in the same transaction as Payment. Unscoped legacy retries are quarantined before provider dispatch or reuse of a checkout URL. New allocations must match the paid purchase's contestant, competition and vote count; after integrity cutover they require its scope even when readiness is later invalidated. Composite foreign keys retain parent identity. Deferred triggers allow the atomic payment/snapshot transaction and reject missing scope at commit. No checkout, webhook, provider transport or allocation processor is added.

Use competition-first lock order across admin taxonomy, assignment and reservation writers. Old application writers must be drained before rollout. Keep payment routes disabled operationally while payment work remains paused. This branch does not deploy or change hosted configuration.

## Separately gated final contraction

`prisma/gated-migrations/category-assignment-required/migration.sql` is deliberately outside automatic migrations. It refuses execution unless the deployment session explicitly acknowledges `talenthunt.category_finalization = 'approved-and-writers-drained'`, then locks Contestant and verifies **every** contestant, including inactive records, has both IDs before setting both columns NOT NULL. It creates no holding groups and performs no backfill.

Before any hosted execution: review the exact target/backup, classify all pending contestants through the audited workflow, resolve published legacy results separately, drain old writers, complete CAT-04/CAT-05, verify rollback/lock timing on representative data and obtain explicit deployment approval. Promote the artifact into a newly reviewed normal Prisma migration and make the Prisma fields required in the same deployment change. Do not execute the artifact ad hoc against a hosted database or claim the current optional expansion schema is already contracted.

## Review checks

In a disposable local competition, create two categories with children; register and edit a contestant; switch parent and verify the child clears; preserve inactive current assignment during a profile edit; verify history prevents moving while videos still edit. Review an inactive legacy contestant, reject a mistyped number/stale history, confirm with a reason and inspect its audit. Invalidate setup through taxonomy changes and confirm it again. Verify session/CSRF failures do not mutate records. Keyboard, mobile and screen-reader execution must be recorded separately from HTTP/SSR tests.
