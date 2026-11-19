# CAT-04 public categories and contestant identity

Issue #65 implements the public-interface additions authorized on 19 November 2026. Its branch depends on CAT-03 PR #69. CAT-05 #32 must replace the retained flat leaderboard foundation before the combined category feature is released or merged. Paystack remains paused.

## Public experience

The existing dark/gold design system, responsive contestant grid, managed portrait/fallback component, page skeletons, competition status, buttons and performance-video player are reused. `/contestants` groups the contestants on each bounded page by category, then subcategory, and links each group to its complete scoped listing. Number/ID remain the API's roster order; votes never determine directory order. Category/subcategory navigation is database-driven and independently paginated so groups beyond the first page remain reachable. `/categories` provides the complete paginated category directory.

Stable category IDs identify `/categories/:categoryId` and `/categories/:categoryId/subcategories/:subcategoryId`; identical child names under different parents remain distinct. Category views offer all-subcategory and individual-subcategory filters. Page links preserve the selected category/subcategory through the route. Invalid or mismatched scope fails rather than showing an unfiltered fallback. Empty groups, out-of-range pages, unavailable data and missing competitions have explicit states.

Cards show name, photograph/fallback, number, category and subcategory. Profiles prominently show both labels, category breadcrumbs, an exact-group back link and a scoped leaderboard link. Package selection displays the same category path without adding checkout or payment submission. Zero, one and two YouTube videos retain their ordering, canonical IDs and privacy-enhanced lazy embeds.

## Backend contracts

All endpoints are under `/api/v1`, use the server-selected competition, preserve no-store envelopes and hide drafts. Taxonomy lists return `{competition, items, pagination}`; child lists also return `category`. Detail returns `{competition, category, subcategory?}`. Summaries contain only ID, competition ID, name, slug and sort order, plus parent category ID for children.

- `GET /categories?page=&pageSize=`: active categories, maximum 100 per page.
- `GET /categories/:categoryId`: active selected-competition category.
- `GET /categories/:categoryId/subcategories?page=&pageSize=`: active children of an active category.
- `GET /categories/:categoryId/subcategories/:subcategoryId`: validates the complete active ancestry.
- `GET /contestants?categoryId=&subcategoryId=`: retains the full-list shape and adds optional scope filters.
- `GET /contestant-cards?page=&pageSize=&categoryId=&subcategoryId=`: retains its bounded card shape and maximum 24 cards. Filtering precedes count and pagination.
- `GET /contestants/:id`: direct IDs require active contestant and active, valid assigned ancestors.

All public contestant projections now include safe `category` and `subcategory` summaries. A subcategory filter requires its category; malformed/repeated/unknown queries return 400 and unavailable ancestry returns 404. Public reads exclude inactive or unassigned contestants, including direct profile/selection/share URLs. Admin DTOs still support nullable legacy assignments and inactive current selections.

Public totals require reviewed category setup and the existing visibility policy; HIDDEN/RANK_ONLY omit them. Policy, scope, counts and records are read inside a repeatable-read transaction. No default taxonomy, automatic assignment, artificial votes, historical rewrite, dependency upgrade or migration is introduced. Profile metadata remains identity-only; scoped metadata and sitemap category paths expose no rankings or totals.

## Verification and integration gate

Twenty public HTTP/PostgreSQL checks passed on new guarded local databases: the existing core API contracts plus dynamic discovery, ancestry/filter/pagination isolation, repeated child names, inactive/unassigned exclusion, strict queries, exact totals, setup and all visibility modes, draft privacy and both performance videos. Prisma validation/generation, API build/test TypeScript and migration drift passed. All 63 frontend tests passed, including new grouping, exact-scope links, profile/selection context, media and invalid-response tests. Frontend lint and generated-route TypeScript passed.

The first production build stopped on the existing Next.js advisory check; the normal command then passed compilation, TypeScript and page generation on retry without changing dependencies or security settings. The combined gate subsequently passed on the dependent CAT-05 branch: 172 API checks, 67 frontend tests, the complete Next/Express/PostgreSQL integration, lint, production build, both production public HTTP suites and migration drift. See [scoped leaderboard verification](subcategory-leaderboards.md). Review and merge the dependent feature together; no merge is performed here. This file does not claim interactive browser/mobile/keyboard or screen-reader execution.

Review at 360px and desktop: category navigation wraps without horizontal overflow; long names and large totals fit; keyboard focus remains visible; filters and page links retain scope; photo fallbacks work; category/subcategory names are prominent on cards/profiles/selection; zero-video sections disappear; two videos remain in order. Check inactive ancestors through direct URLs and every HIDDEN/RANK_ONLY/LIVE response surface. Hosted data and the running stable app are not modified by these isolated checks.
