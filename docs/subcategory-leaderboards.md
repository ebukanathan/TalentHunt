# CAT-05 independent subcategory leaderboards

Issue #32 completes the 19 November public-interface request on `feat/cat-05-scoped-leaderboards`, based on CAT-04 PR #70. Review CAT-03 PR #69, CAT-04 PR #70 and CAT-05 in dependency order. No merge, hosted migration, historical rewrite or Paystack development is authorized by this delivery.

## Ranking and discovery contracts

`GET /api/v1/leaderboard` and authenticated `GET /api/v1/admin/leaderboard` now require `categoryId` and `subcategoryId`; existing `page`/`pageSize` bounds remain. Missing scope returns 400; foreign or mismatched ancestry returns 404. Administrator authentication runs before private query validation. The response contains safe competition/category/subcategory summaries, `setupReady`, visibility, publication timestamp, state, scoped rows and pagination. Each row includes all three scope IDs. Frontend validation rejects mixed scopes and inconsistent privacy or pagination contracts.

Scope, active eligibility, counts and positive-vote detection are applied before the SQL ranking window and pagination, inside a repeatable-read transaction. Exact BigInt vote strings remain intact. Ties share ranks 1,1,3; contestant number/ID only determine display order. Inactive contestants or ancestors never affect public counts or ranks. Private standings may inspect inactive groups and mark excluded rows without ranks. No endpoint falls back to an overall table.

Public states are `SETUP_REQUIRED`, `HIDDEN`, `EMPTY`, `NO_VOTES`, `PROVISIONAL` and `FINAL`. Setup must be explicitly reviewed. A group without votes has no public ranked rows even if another group has votes. LIVE exposes scoped ranks/totals, RANK_ONLY omits totals, and HIDDEN omits rows/ranks/totals. Existing explicit final publication still releases full results. Legacy publication timestamps without category setup are preserved and suppressed rather than interpreted as category results.

`/leaderboard` and `/admin/leaderboard` without a complete group show a dynamic category/subcategory chooser. Public choices contain active records only; private choices label inactive records. Scoped table pagination retains both IDs. Category directories, cards and profiles from CAT-04 link to the appropriate independent group. Existing dark/gold styling, responsive grids, skeletons, empty/error states and focus styles are reused.

## Reviewed publication

Authenticated `GET /api/v1/admin/competition/publication-preview` returns the current managed competition, eligible group summaries, active contestant counts, group vote-presence flags, pending/invalid assignment counts, readiness and an opaque `reviewToken`. It returns no overall winner.

`POST /api/v1/admin/competition/publish-results` retains CSRF/origin checks and exact competition ID/name/version confirmation and additionally requires `expectedReviewToken`. Confirmation requires COMPLETED status, reviewed setup, valid active memberships and at least one voting group. The screen lists every affected group; empty/zero-vote groups acquire no winner. Structural, assignment or vote changes make a prior review stale (409). Competition and contestant locks serialize confirmation with existing assignment/taxonomy/financial boundaries. Audit failure rolls the transaction back; repeating a successfully confirmed token is idempotent. `RESULTS_PUBLISHED` records mode `SUBCATEGORY`, reviewed scope IDs/counts/vote flags and token. Existing post-publication mutation and visibility locks remain.

Legacy global publication cannot be silently republished through this flow. A separate reviewed legacy-publication decision remains necessary. No historical timestamp, payment, vote allocation, media or migration is changed by CAT-04/CAT-05.

## Verification

Focused real HTTP/PostgreSQL leaderboard suites pass 21 checks, including cross-parent same-name isolation, ties/pagination, zero-vote isolation, active/inactive exclusions, permission/visibility enforcement across public surfaces, setup/legacy handling, stale reviews, audit rollback and concurrent idempotent publication. All 67 frontend tests pass, covering grouped navigation, scoped profile/selection context, 0–2 videos, chooser/table privacy and scoped publication.

The complete real Next.js → Express → PostgreSQL integration passed on a guarded fresh local database: authenticated taxonomy/classification/setup, contestant CRUD and images, two same-named child groups, public grouping/filtering, profile labels/back-links, zero/one/two videos, scoped package selection, zero-vote isolation, HIDDEN/RANK_ONLY/LIVE privacy in HTML/RSC, scoped publication, post-publication locks, overview, login/logout/expiry and upstream outage. Prisma schema validation, client generation, API build/test TypeScript and migration drift passed. The existing taxonomy publication race fixture was updated for reviewed confirmation and all 13 taxonomy checks passed. React streaming-comment handling was corrected in a profile assertion; no application behavior was loosened to satisfy it.

Automated HTTP and source checks do not constitute interactive browser/mobile/keyboard or screen-reader verification. Before release, manually review narrow/desktop wrapping, keyboard focus and group selection, portrait fallback, profile back-links, both videos and HIDDEN/RANK_ONLY/LIVE navigation. The separate framework security follow-up #53 remains a release prerequisite; dependencies and security settings are unchanged here.

Final full API run: **172 passed, zero failed/skipped**, using the complete disposable database harness with `-ApiOnly`. All 67 frontend tests pass. This full rerun includes existing provider-fake and legacy-history regressions without contacting Paystack. No schema or historical migration changes are introduced; source dependency versions and lockfile are unchanged.

Production verification: frontend lint passed with no findings; the complete production web build passed compilation, TypeScript and page generation on an identical normal retry after the existing framework advisory. Both production HTTP suites passed with loopback fixtures: all visibility modes and bot/HTML/RSC privacy, bounded paging, managed image restrictions, 0?2 videos, sharing PNG, uncached robots/sitemap, package/window states, scoped zero-vote/final results and unavailable/draft/inactive cases. No dependencies or security settings were changed.
