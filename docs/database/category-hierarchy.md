# CAT-01: category hierarchy expansion and rollout

Issue [#62](https://github.com/ebukanathan/TalentHunt/issues/62). Design and starting CAT-01 approved 18 November 2026 (Africa/Lagos). Branch `feat/cat-01-category-schema` depends on `test/public-website-verification` (`8082369`, PR #61), including the unmerged visibility/public-refinement foundation and main's merged video feature. Do not merge the stack automatically. The [approved design](../project-management/category-scope-plan.md) describes subsequent CAT issues.

See [executed checks and review limits](category-hierarchy-verification.md).

## What this migration establishes

`20261118120000_add_category_hierarchy` is expansion only. It creates empty Category, Subcategory and PaymentScope tables, adds nullable Contestant.categoryId/subcategoryId, assignmentRevision (default 1), and nullable Competition.categorySetupCompletedAt. No default business groups, inferred assignments, audit events, votes or financial snapshots are inserted. Existing writers may continue creating temporarily unassigned contestants. **This PR is not the category-aware public release.**

Category belongs to Competition. Subcategory carries competitionId and categoryId with a composite FK to that Category. Contestant's composite FK uses competitionId/categoryId/subcategoryId; a CHECK requires the category/subcategory pair to be either both null or both set. Final mandatory assignments belong to a separately gated CAT-03 migration.

Category names/slugs are unique within a competition. Subcategory names/slugs are unique within their category. The database computes nameKey with lower-case, trimmed, collapsed POSIX whitespace; display names are retained, accents remain distinct, and lower-case behavior follows database collation. A supplied nameKey cannot bypass normalization. The fields are limited to 120 characters; blank normalized names, invalid lowercase-hyphen slugs, negative sortOrder and non-positive revisions fail. Inactive records retain their namespace. Identical child names under different parents/competitions are valid. Future validation must use the database as the uniqueness authority rather than assuming JavaScript's Unicode case rules are identical.

Normalization/ownership triggers also protect IDs and parent ownership and increment taxonomy revision for actual changes to name/slug/isActive/sortOrder; key-only or no-op updates cannot forge the revision. Expected-revision checks and AuditLog belong to the CAT-02 authenticated service. There are no taxonomy API endpoints in this issue.

All new FKs use RESTRICT for updates and deletes. PaymentScope's one-to-one compound relation is explicitly unique as required by Prisma 6.19. It matches the Payment's competition/contestant/package, the Contestant's full assignment and the package's competition. UPDATE, DELETE and TRUNCATE of scope records are rejected. A captured scope prevents moving that contestant's membership or changing the payment's identity. Monetary/status updates remain possible. Existing payments have no scope created for them.

This does not yet require a scope on new payments or enforce category availability, history locks, allocation attribution or setup visibility. Those guards must arrive atomically with compatible writers in CAT-03; no payment/provider implementation is changed here. Existing allocation/payment rows and legacy cross-record anomalies are preserved, not silently repaired. When payment work resumes, unscoped history/retries need a separately reviewed reconciliation path.

## Preflight before any later hosted deployment

The current approval covers code and disposable local tests, not hosted application of this migration. A deployment review must identify the exact target, backups/restore procedure, deployed code versions and publication state.

1. Verify historical migration checksums and resolve drift before applying anything. Keep all six earlier migration files intact.
2. Record table counts and exports/checksums for contestants, videos, payments, initializations, allocations, packages, audit entries and publication settings. Inspect legacy payment/contestant/package inconsistencies without editing them. This expansion does not validate old payment relationships anew.
3. Measure DDL and index time against representative data and inspect active transactions/locks. The migration is a single transaction with lock_timeout=5s and statement_timeout=120s; a lock/timeout error rolls back its DDL instead of leaving half of this schema installed. Investigate and follow Prisma's failed-migration recovery procedure before retrying; do not automatically mark a failed migration successful.
4. Confirm no incompatible future finalization migrations are queued. `migrate deploy` applies all pending migrations; do not blindly run it after CAT-03 introduces the contract stage.
5. Preserve already-published global result records. Record their original scope and agree an archival/classification approach before enabling category results. A null setup gate alone does not hide results from an older API that ignores it.

Example read-only pending-assignment preflight after expansion:

```sql
SELECT c."competitionId", c."isActive", count(*) AS unassigned
FROM "Contestant" c
WHERE c."subcategoryId" IS NULL
GROUP BY c."competitionId", c."isActive"
ORDER BY c."competitionId", c."isActive";

SELECT id, slug, status, "leaderboardVisibility", "resultsPublishedAt",
       "categorySetupCompletedAt"
FROM "Competition"
ORDER BY id;
```

## Explicit classification and finalization (CAT-02/CAT-03)

1. Deploy authenticated taxonomy management. Admins create the real categories/subcategories; never infer them from demo names, contestant numbers, biographies or packages.
2. Deploy assignment-aware writers and a private pending queue. New contestants require active matching ancestors. Unrelated profile/media edits can retain an existing inactive assignment.
3. Preview explicit mappings using exact contestant/target IDs and current revisions. Show history counts and recorded votes, require a reason and appropriate typed confirmation, and write before/after AuditLog in the same bounded transaction as initial classification. Dry runs make no changes; committed mappings are restart-safe. The classification workflow is not permission to transfer history-bearing contestants between real groups.
4. Serialize classification against scope reservation, deactivation and publication. Any payment status, allocation or recorded votes blocks ordinary reassignment. Keep history-bearing transfers blocked pending a separately approved append-only correction workflow. No forced move or rewriting old payment/total fields.
5. Enable category setup only after reviewed active assignments and ancestry are valid. Coordinate CAT-04/CAT-05 API/web rollout, draining old readers/writers: unassigned records are not public/rankable/purchasable, setup-incomplete results expose no ranks/totals, and no flat leaderboard fallback exists. Preserve competition-wide LIVE/RANK_ONLY/HIDDEN and confirmed publication.
6. Only after **all** contestants, including inactive/archived records, have approved assignments, review the separate final NOT NULL migration. If any mappings are unavailable, remain in transition and do not claim exact-one MVP completion. Do not add automatic placeholder groups to unblock deployment.

## Recovery

An unapplied/failed transaction leaves existing rows unchanged; diagnose its migration status before retry. After successful expansion, keep the additive schema while addressing an application issue. Do not drop hierarchy tables/columns as an automatic rollback: later code may have created taxonomy or captured immutable scopes. Use a reviewed forward migration or the approved restore procedure. No reset, truncate, destructive migration-history edits or financial backfill is part of the runbook.

## Verification

From this worktree, after `npm ci`:

```powershell
powershell -NoProfile -File scripts/test-category-schema.ps1
# Also run the existing real Next/Express/PostgreSQL regression on a fresh DB:
powershell -NoProfile -File scripts/test-category-schema.ps1 -IncludeWebRegression
```

The harness creates its own temporary loopback-only PostgreSQL cluster and fresh constraint, upgrade and seed-regression databases, validates/generates Prisma, applies all migrations to the fresh target, typechecks the test/seed code, runs real constraints and legacy-upgrade checks, checks schema drift on both category targets, runs existing seed integration against the expanded schema, and stops the cluster in finally. It retains disposable files for diagnosis and restores the caller's environment. No inherited DATABASE_URL is used as a test target.

The optional web regression uses another fresh guarded database and sets an identity-only HTTPS SITE_URL fixture, because the inherited sitemap test expects configured discovery. That fixture origin is never contacted. Actual Next/API servers bind to loopback. Run production builds only after the integration server has stopped. Clean-checkout standalone web typechecking requires Next route types generated by dev/build/typegen first.

The focused test requires CATEGORY_SCHEMA_TEST_DATABASE_URL (`talenthunt_category_test_fresh[_suffix]`, already migrated and empty) and CATEGORY_UPGRADE_TEST_DATABASE_URL (`talenthunt_category_test_upgrade[_suffix]`, no public tables). It refuses production, hosted/routed/query-overridden and populated targets. The upgrade test first deploys unchanged historical migrations from a temporary copy, inserts isolated synthetic legacy fixtures, snapshots every old field as exact JSON text (no JavaScript numeric rounding), deploys this migration, compares fields and historical checksums, then repeats deploy to establish no-op behavior. Zero/one/two-video, active/inactive/zero/large-total, hidden/published, all payment statuses, initialization, allocation and a legacy cross-competition payment anomaly are represented. Anomalies remain unchanged and unscoped for review. Synthetic financial fixtures exist only in the disposable tests.

PostgreSQL 18 reports restrictive referential-action failures as SQLSTATE 23001, which Prisma 6.19 may wrap as an unknown request error rather than P2003. Database tests assert SQLSTATE through raw execution for these cases. CAT-02/CAT-03 services must preflight and translate protected-operation conflicts deliberately; do not rely exclusively on catching P2003 for a useful admin error.

Database tests exercise normalized/concurrent uniqueness, same-named children, composite identity failures, paired-null assignments, invalid values, ownership immutability, restrictive deletion, activation without cascades, scope identity/immutability, and custom CHECK/trigger presence. Prisma drift checks do not prove trigger/CHECK behavior; those require the direct database tests. Authorization, scoped visibility and leaderboard isolation are tested in their later implementation issues rather than claimed here.

Run the existing API/web/seed regressions and real Next -> Express -> PostgreSQL harness on the expanded schema before PR delivery. This PR does not add UI, so browser/mobile interaction coverage is not a CAT-01 change.
