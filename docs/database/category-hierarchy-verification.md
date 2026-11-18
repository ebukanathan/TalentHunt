# CAT-01 verification

18 November 2026 (Africa/Lagos), issue [#62](https://github.com/ebukanathan/TalentHunt/issues/62), branch `feat/cat-01-category-schema`, base `8082369` (`test/public-website-verification`, PR #61). The user approved the design and starting CAT-01 before implementation. Merge and hosted migration remain separate review gates.

## Executed checks

- 13/13 real PostgreSQL category schema/upgrade tests passed with no skips. Coverage includes concurrent normalized uniqueness; same child names under different parents and competitions; invalid names/slugs/order/paired assignments; immutable parent ownership; restrictive deletion; inactive namespace retention without cascades; compound PaymentScope identity; snapshot UPDATE/DELETE/TRUNCATE rejection; and blocked scoped contestant reassignment/unassignment.
- A real upgrade deployed the six unchanged historical migrations first, populated disposable legacy fixtures, then deployed CAT-01. Exact JSON-text comparison preserved every old field, including BigInt values beyond Number.MAX_SAFE_INTEGER. Fixtures represent active/inactive/unassigned/zero-vote contestants, zero/one/two videos, published LIVE and draft HIDDEN competitions, all payment statuses, an UNKNOWN initialization, an allocation, an audit event and a legacy cross-competition payment anomaly. No taxonomy, inferred assignment or historical scope was generated. Repeated deploy was a no-op; historical migration checksums matched.
- Prisma schema validation/client generation passed. No schema drift was detected on fresh, upgraded and real-web-integration databases. Direct tests additionally checked custom SQL guards that Prisma drift does not cover.
- 130/130 existing API tests passed, including public reads, auth, management/images/settings/overview, videos, leaderboard visibility/publication and local-provider-fake regressions.
- 50/50 frontend tests, 5/5 seed unit tests and 6/6 seed integration checks passed.
- API build, API/test TypeScript, category/seed TypeScript, frontend lint and frontend TypeScript passed. The clean worktree needed Next-generated route types before its standalone web typecheck; existing dev integration generated those types. No application change was needed.
- The frontend production build completed with exit code 0, including compilation, TypeScript, page generation and route output. Next's existing advisory initially stopped the command; an ordinary identical retry within its retry window succeeded with the warning retained and no dependency/security-setting changes.
- Real Next -> Express -> PostgreSQL integration passed for public selection/discovery, inactive indexing, hidden/rank-only/live HTML/RSC, confirmed publication, videos, auth, CRUD, images, settings/packages, overview, session expiry and upstream outage. The initial run passed all API regressions then found the existing sitemap fixture's SITE_URL dependency. The category harness now supplies an explicit identity-only test origin for its optional web run; the final fresh-database run passed.

The focused harness used only new guarded loopback PostgreSQL databases and stopped its cluster in finally. Seed CLI checks ran before Next compilation. Tests never reset, truncate or delete an existing database; the scope-TRUNCATE assertion targeted only the new disposable fixture. No hosted schema, competition, storage or provider was contacted or modified.

## Review limits

Only the additive schema, new migration, tests/harness, root test command/typecheck inclusion and planning/runbook documentation change from the integration base. All six earlier migrations and application API/web/media/payment source files remain unchanged. Existing finance stays legacy-unscoped. Null assignment is an intentional transition, not final exact-one acceptance. CAT-02 through CAT-05 remain Backlog.

The existing Next.js 16.4.2 advisory appeared during dev/build checks; framework upgrade remains tracked separately in #53. A successful build retry does not patch the framework. No interactive browser, mobile, keyboard or screen-reader execution is claimed for this database-only issue.

See the [migration, classification, cutover and recovery runbook](category-hierarchy.md). The complete public rollout and separately gated NOT NULL stage require the later issues and reviewed assignments, including a decision for already-published global results.
