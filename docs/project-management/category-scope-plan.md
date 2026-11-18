# Dynamic competition categories and subcategories

Prepared 18 November 2026 (Africa/Lagos). **Design and starting CAT-01 approved by the user on 18 November 2026.** CAT-01 is implemented on `feat/cat-01-category-schema`; verification/review gates apply. Later CAT issues remain Backlog. See the [CAT-01 migration runbook](../database/category-hierarchy.md).

## Inspection and baseline

- The open checkout is the older ADMIN-05 branch with unrelated uncommitted login, timeout and date-picker fixes. Preserve it.
- GitHub main is `fac86b2`: ADMIN-05 #41 / PR #45 and contestant videos #46 / PR #47 are merged. The earlier session recap based only on the open checkout was incomplete.
- Visibility/publication is implemented in open PR #48 (`a3b4ed0`); public refinements are stacked in open PRs #54-#61, ending at `8082369`. Inspected their schema, public/admin services, routes, validation, pages, test structure and documentation. These are foundations under review, not approved category support or merged delivery.
- Current models have Competition -> Contestant, competition-wide packages, Payment and VoteAllocation. Videos are separate ordered ContestantVideo records constrained to zero to two. The visibility branch adds competition-wide LIVE/RANK_ONLY/HIDDEN and confirmed result publication, but ranks the entire competition.
- Read `apps/web/AGENTS.md` in the open and relevant worktree checkouts. Before future Next.js edits, read the installed version's relevant local guides as instructed there.
- Existing category issues already map to #62, #63, #64, #65 and #32. Reuse them; do not duplicate or reopen historical initial-schema issue #2.

## Database relationship design

Competition -> many Categories -> many Subcategories -> many Contestants. A contestant has one Subcategory in the final MVP; category and competition are validated ancestors, not independent memberships. All business taxonomy is created by authenticated administrators. No example names, default business groups or placeholder categories are seeded.

| Model | Proposed fields and relationships |
| --- | --- |
| Category | `id`, `competitionId`, `name`, database-maintained normalized `nameKey`, `slug`, `isActive`, `sortOrder`, `revision`, `createdAt`, `updatedAt`; Competition FK; child Subcategories |
| Subcategory | Same identity, name, status, order, revision and timestamp fields; `competitionId`, `categoryId`; composite Category FK |
| Contestant | Retain existing fields, videos and relationships; add `categoryId`, `subcategoryId`, assignment revision; composite Subcategory FK |
| Competition | Add nullable `categorySetupCompletedAt` as an audited rollout gate; retain visibility, lifecycle and publication fields and their existing defaults/values |
| PaymentScope | Add immutable, optional one-to-one companion to Payment: `paymentId`, `competitionId`, `categoryId`, `subcategoryId`, `contestantId`, `packageId`, `createdAt`; existing payments remain explicitly legacy-unscoped |

Category uniqueness: `(competitionId, nameKey)` and `(competitionId, slug)`. Subcategory uniqueness: `(competitionId, categoryId, nameKey)` and `(competitionId, categoryId, slug)`. Normalize trimming, repeated whitespace and case consistently in the database and API; retain the administrator's display capitalization. Inactive records reserve their names/slugs. Identical child names under different parents are valid. Names can change; stable IDs and explicitly managed slugs preserve links.

Add candidate keys for composite FKs:

- Category `(competitionId, id)`.
- Subcategory `(competitionId, categoryId, id)` references Category `(competitionId, id)` through `(competitionId, categoryId)`.
- Contestant `(competitionId, categoryId, subcategoryId)` references Subcategory `(competitionId, categoryId, id)`. Keep competition-wide contestant number/slug uniqueness.
- PaymentScope matches Payment's `(id, competitionId, contestantId, packageId)`, Contestant's `(competitionId, categoryId, subcategoryId, id)` and VotePackage's `(competitionId, id)`. Add corresponding unique candidate keys. Referential updates/deletes are restrictive, never cascades that reinterpret scope.

Indexes: Category `(competitionId, isActive, sortOrder, id)`; Subcategory `(competitionId, categoryId, isActive, sortOrder, id)`; Contestant `(competitionId, categoryId, subcategoryId, isActive, totalVotes DESC, number, id)` plus assignment/history lookup indexes. Keep existing useful indexes until query plans justify removal.

Category competition ownership and subcategory parent ownership are immutable. No physical-delete endpoints in the MVP; use activation/deactivation. Parent inactivity suppresses public children without rewriting child activation flags or contestant records. Protect taxonomy with historical scope references and block deactivation that would alter published results or invalidate unresolved pending selections.

All taxonomy mutations and assignment changes write AuditLog transactionally, with actor, competition, entity, before/after values, revision and reason where required. The overview feed resolves category/subcategory ownership from actual records and exposes only its existing safe projection.

## Migration and assignment strategy

This revises the earlier GitHub proposal for automatic internal holding groups. **Do not invent category assignments.** Use a staged additive migration and explicit admin classification.

1. Preflight on isolated representative fixtures: counts, existing relationships, null assignments, financial/vote values, published legacy results, uniqueness collisions and lock duration. A later hosted run needs its own reviewed target and rollout plan.
2. CAT-01 expansion: create empty taxonomy tables and PaymentScope, add nullable contestant category/subcategory columns and setup gate, indexes and composite FKs. Require both assignment columns null or both non-null with a CHECK. Do not populate taxonomy or rewrite contestants, totals, videos, payments, allocations or old migrations.
3. CAT-02: admins create the actual database-backed taxonomy. CAT-03: all new contestants require an active matching category/subcategory. Legacy contestants appear in a private Pending assignment queue.
4. Admin explicitly previews and confirms initial assignment, including inactive contestants. A batch mapping tool may use exact contestant IDs and target IDs with dry-run output; no guessing from names, numbers or packages. Require current revision, reason, history summary, typed confirmation for history-bearing classification and before/after AuditLog. Apply in bounded restart-safe transactions; stale or invalid mappings fail. Existing money/votes stay unchanged. Classification establishes the new grouping; it does not claim to reconstruct unknown historical categories.
5. Serialize classification against payment reservation, deactivation and publication. Unscoped legacy payment retries must not adopt a newly assigned scope or dispatch to a provider automatically. Quarantine for separate reconciliation.
6. Complete setup only after reviewed assignments are valid and all active contestants have eligible parents. The coordinated category release excludes unassigned/inactive-parent records from public discovery, direct profiles, ranking and purchase eligibility; no global ranking fallback. Until setup confirmation, public ranks and totals remain unavailable even if the stored visibility is LIVE. No old API writer/reader may remain serving category-aware traffic and bypass these gates.
7. CAT-03 supplies a separate final constraint migration after **every** existing contestant, including inactive/archived records, is assigned and old writers are drained. Set category/subcategory NOT NULL. If mappings are unavailable, stop at the documented transition; do not fabricate groups or claim the exact-one MVP invariant is complete. Rehearse the expansion/classification/finalization order rather than deploying all pending migrations blindly.

Already-published global results are a special migration blocker: preserve the timestamp, visibility and historical evidence; do not automatically reinterpret or republish those standings as category results. A reviewed archival/classification decision is required for those competitions before enabling the new result views. No destructive rollback; recover with a reviewed forward fix or restore procedure.

## Updated API contracts

Keep `/api/v1`, the selected-competition policy, existing success/error envelopes, decimal-string vote totals and no-store responses. Admin APIs include drafts; public APIs preserve draft privacy. Admin mutations reuse active sessions, Origin/CSRF/JSON validation and fixed-path Next facades. Query strings, IDs and bodies are strict; clients cannot choose another competition or override visibility.

| Endpoint | Contract |
| --- | --- |
| `GET/POST /admin/categories` | Paginated list with `status=all|active|inactive`; create `{name, slug, isActive?, sortOrder?}`. Server supplies competition. |
| `GET/PATCH /admin/categories/:categoryId` | Detail and rename/activation/order changes; PATCH requires `expectedRevision`. No reparenting or DELETE. |
| `GET/POST /admin/categories/:categoryId/subcategories` | List/create children of that category; same editable fields and status filter. |
| `GET/PATCH /admin/categories/:categoryId/subcategories/:subcategoryId` | Detail and edit with expected revision; verify the full ancestry. |
| Existing `POST/PATCH /admin/contestants` and `/:id` | Creation requires categoryId + subcategoryId. PATCH validates a complete resulting pair and revision; may omit unchanged assignment fields for ordinary profile edits. Preserve images and ordered videos. |
| `POST /admin/contestants/:id/initial-assignment` | Explicit legacy-only classification: target IDs, expected revision, reason and history confirmation; never a general force-move endpoint. |
| `POST /admin/competition/confirm-category-setup` | Audited explicit setup completion with expected competition revision and reviewed assignment state. |
| `GET /categories`, `GET /categories/:categoryId` | Active categories for the selected public competition; include IDs, display names, slugs and order, no ranking aggregates. |
| `GET /categories/:categoryId/subcategories`, `GET /categories/:categoryId/subcategories/:subcategoryId` | Active children only when the parent is active and belongs to the selected competition. |
| `GET /contestants`, `GET /contestant-cards` | Optional categoryId; optional subcategoryId requires categoryId. Validate ancestry, filter before count/pagination, include safe category/subcategory summaries. Unfiltered roster order remains contestant number/ID, never overall vote order. Preserve the existing full-list versus bounded-card response shapes. |
| `GET /contestants/:id` | Keep existing ID URLs; add the full category path; enforce assignment and active-parent checks even through direct IDs. Preserve 0-2 ordered videos. |
| `GET /leaderboard`, `GET /admin/leaderboard` | Require categoryId AND subcategoryId; retain page/pageSize. Return scope summaries, competition, visibility, publication/state, scoped rows and pagination. Missing scope is 400; invalid/mismatched scope is 404. |

All table paths above are relative to `/api/v1`. Public discovery/filtering excludes inactive/unassigned records. Admin lists include inactive/current assignments for management; private standings mark excluded contestants and give them no rank.

Common failures: 400 invalid input/missing scope, 401 missing/expired session, 403 inactive admin/invalid mutation origin or CSRF, 404 invalid or unavailable selected scope, 409 duplicate name/slug, stale revision, history-locked assignment, unsafe publication change or incomplete setup. No silent fallback to an unfiltered endpoint on failure.

## Assignment and future financial integrity

Ordinary subcategory reassignment is allowed only with **no Payment of any status**, no VoteAllocation, zero totalVotes, no scoped history and no published-result lock. Check within the same transaction and lock order as financial scope reservation. Otherwise return 409; no force boolean. Actual moves of history-bearing contestants between real subcategories remain blocked in the MVP. A later correction executor needs separately approved append-only attribution/reversal semantics and its own audited confirmation workflow. Initial legacy classification is explicitly separate.

CAT-01 creates the empty PaymentScope structure. CAT-03 adds only the hierarchy integrity boundary to the existing reservation path: derive scope server-side, check setup/active ancestry and matching competition-wide package, lock eligibility rows, and capture PaymentScope in the same transaction as a new Payment. Do not add checkout, webhooks, finalization, emails, allocation processing or real provider calls.

Add database guards for new writes: require a PaymentScope at transaction commit after cutover; make snapshots immutable; reject a new VoteAllocation unless payment/contestant/competition/scope and recorded voteCount agree. Use composite FKs where possible and deferred constraint triggers only for invariants FKs cannot express, documented in additive migrations. Existing Payment/VoteAllocation contents are not rewritten or given invented scopes. Legacy-unscoped allocations require a separately reviewed reconciliation path before payment development resumes. Test all guards with local fixtures/provider fakes only.

## Public/admin UI and leaderboard behavior

- Admin Categories screen: create/edit category; view/manage children; activate/deactivate with impact information and stale-edit errors. No preset taxonomy. Add dashboard counts for categories, subcategories and pending assignments, plus safe audit activity.
- Contestant forms: database-populated category selector; dependent subcategory selector clears/reloads on category change. Explain empty states and history locks; show inactive current assignments so unrelated profile edits remain possible. Preserve portrait uploads and zero/one/two YouTube-video editing.
- Public `/categories`, `/categories/[categoryId]`, `/categories/[categoryId]/subcategories/[subcategoryId]`: dynamic navigation and scoped rosters with URL-preserved filters/pagination. Use stable scoped IDs to avoid ambiguous duplicate names. Profiles show competition/category/subcategory breadcrumbs and a link to their own leaderboard. `/leaderboard` without a chosen group is a chooser.
- Rank only within `(competitionId, categoryId, subcategoryId)`. Scope counts, eligibility, hasVotes and ranking inputs before pagination. Exact BigInt totals; shared ranks 1,1,3; number/ID only break display ties. A zero-vote group remains NO_VOTES even if another group has votes. No overall rank or overall winner.
- Retain competition-wide visibility: LIVE exposes scoped ranks and exact totals; RANK_ONLY exposes ranks and omits totals from every public endpoint; HIDDEN exposes neither. Policy, setup and data are read in one consistent snapshot. Preserve no-store, metadata/OG/sitemap privacy and sanitized public projections.
- Retain the separate confirmed competition-wide Publish Results action: publish independent subcategory tables together, never an aggregate table. Confirmation lists affected groups and validates setup, revisions, completion and eligible votes. Empty/all-zero groups have no winner. Block structural, activation and membership changes that alter published standings; preserve existing post-publication visibility locks.

## Risks and affected functionality

The schema contract affects Prisma generation, seeds/fixtures, admin CRUD/settings/overview/audit projection, image/profile/video editing, public DTOs/loaders/cards/pagination, profile/vote-preview links, metadata/discovery and leaderboard/publication SQL. Seed behavior must not introduce predefined business taxonomy; tests create their own isolated example groups.

Principal risks are ambiguous legacy classification, old writers bypassing assignment rules, cached/serialized hidden totals, reassignment/reservation races, deactivation changing published results, and stacked unmerged PR dependencies. Drain old instances and coordinate the complete API/web cutover; expansion alone is not a category-aware release. Measure index/constraint lock time on representative fixtures and preserve source migration checksums. Historical finance remains legacy-unscoped rather than falsely attributed.

Do not merge PR #48's flat ranking as acceptance of this scope. Preserve its privacy and publication foundation and the public/video work in a reviewed integration base. CAT-01 can be prepared on a dependent feature branch; subsequent CAT branches depend on their predecessor until merges are individually approved. Never silently merge or overwrite the open checkout/worktrees.

## Implementation sequence and verification

| Order | Existing issue | Proposed branch | Scope |
| --- | --- | --- | --- |
| CAT-01 | #62 | `feat/cat-01-category-schema` | Expansion schema, candidate keys/FKs/indexes, empty PaymentScope, migration/assignment runbook and legacy-upgrade tests |
| CAT-02 | #63 | `feat/cat-02-admin-taxonomy` | Authenticated dynamic management, deactivation, AuditLog and overview integration |
| CAT-03 | #64 | `feat/cat-03-contestant-assignment` | Dependent selectors, initial classification, history locks, setup confirmation, scope integrity and separately gated final NOT NULL migration |
| CAT-04 | #65 | `feat/cat-04-public-categories` | Dynamic discovery/navigation, scoped filtering/cards/profiles and safe metadata |
| CAT-05 | #32 | `feat/cat-05-scoped-leaderboards` | Scoped public/admin rankings, visibility redaction, publication and isolation |

Project workstream remains `0. Categories and subcategories`, all five P0. CAT-01 is In Progress following approval; CAT-02 through CAT-05 are Backlog with dependencies. Existing open review PRs remain open and are not marked complete. Payment-dependent issues stay Backlog in their Paused workstream.

Implement one issue at a time, run its checks, open a linked PR with scope/dependency/verification evidence, then stop at the review gate before proceeding to the next implementation issue. Never merge without approval. User approval authorizes CAT-01 implementation and disposable local migration tests; it does not authorize a hosted migration or resumed payment processing.

Tests by issue include normalized/case/whitespace and concurrent uniqueness; duplicate child names under different parents; all composite relationships and restrictive deletion; assignment/null-transition/history locks and legacy classification; authorization/inactive admin/CSRF; audit rollback and stale revisions; deactivation/reactivation; same-named subcategory isolation across parents and competitions; exact totals/ties/pagination/all-zero groups; HIDDEN/RANK_ONLY/LIVE and every publication/setup state; reservation/reassignment/deactivation/publication races; zero/one/two videos; public HTML/RSC/API/metadata leakage. Verify upgrades preserve financial values, contestant IDs/totals/media and historical migration checksums. Use fresh guarded local PostgreSQL fixtures, Prisma 6.19-compatible migration tooling, drift checks, relevant API/web/seed tests, typechecks, lint, builds and real Next -> Express -> PostgreSQL integration. Record executed browser/mobile/keyboard checks separately from automated evidence.

## Reference constraints

The staged migration proposal follows [Prisma 6 migration customization and expand/contract guidance](https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/customizing-migrations). Composite foreign keys and restrictive deletion implement same-parent integrity rather than relying on cross-table CHECK expressions; see [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html).
