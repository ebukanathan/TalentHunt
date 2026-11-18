# CAT-02: administrator-managed competition taxonomy

Issue [#63](https://github.com/ebukanathan/TalentHunt/issues/63). The user approved continuation after CAT-01 on 18 November 2026 (Africa/Lagos). CAT-01 PR #66 was approved and merged into its declared dependency branch (`test/public-website-verification`, merge `29596e2`); main and the earlier open PR stack remain unmerged. CAT-02 is a separate dependent feature branch, `feat/cat-02-admin-taxonomy`. Do not merge it without review approval.

See [executed checks and review limits](category-management-verification.md).

## Administration

The Categories navigation item opens `/admin/categories`. Admins create their own names/slugs and display order, open a category to manage its children, and open a child to edit it. Nothing seeds predefined business categories or subcategories. The list has active/inactive/all filters and deterministic server pagination; links retain the filter. Current parent inactivity is visible on the child list and editor. Loading, missing, invalid-filter, unavailable and saved states are distinct.

Names and slugs are unique under their parent, including inactive records. The database's normalized name key is the uniqueness authority; same-named children under different categories are valid. Slugs use lowercase letters, numbers and single hyphens. Identity, competition and parent ownership cannot be edited.

Deactivation is the MVP removal mechanism. There is no DELETE endpoint or deletion control. Detail views show contestant, child, payment, pending-payment and allocation counts before a change. A native confirmation precedes deactivation; the server rechecks actual state. Contestants, financial history, vote totals and child activation flags are preserved. A child can be prepared under an inactive parent; it remains effectively unavailable until its parent is active. Public discovery/ancestor enforcement arrives in CAT-04, and the complete category-aware rollout remains gated by CAT-03 through CAT-05; this PR alone is not that public release.

## Protected API

Paths are relative to `/api/v1/admin` and inherit active-admin sessions, Origin/JSON/CSRF mutation checks, private no-store responses and safe error envelopes. Next.js facades accept only these fixed paths and allowed verbs; they never accept arbitrary proxy destinations.

| Endpoint | Behavior |
| --- | --- |
| GET/POST `/categories` | Paginated list/create under the server-selected competition, including drafts |
| GET/PATCH `/categories/:categoryId` | Detail with impact counts / edit the selected competition's category |
| GET/POST `/categories/:categoryId/subcategories` | Parent-scoped list/create |
| GET/PATCH `/categories/:categoryId/subcategories/:subcategoryId` | Verify the complete ancestry, then detail/edit |

Create accepts `{name,slug,isActive?,sortOrder?}`. Patch accepts editable fields plus required `expectedRevision`; clients cannot set IDs, ownership, normalized keys or revision counters. Lists accept only `status=all|active|inactive`, positive `page` (maximum 100000), and `pageSize` (maximum 100, default 25). Detail reads reject query parameters. Unknown/repeated/coerced inputs fail strict validation. List ordering is sortOrder, database-normalized name and stable ID. New API projections omit internal nameKey.

Duplicate name/slug returns 409 TAXONOMY_EXISTS. Stale changes return 409 TAXONOMY_CHANGED. Missing, foreign-competition and mismatched-parent resources return the same 404 TAXONOMY_NOT_FOUND. No-op updates return the current record without new audit events. Error messages in browser mutations use a fixed allowlist rather than relay database/provider text.

## Transaction and history protection

Mutations lock Competition first, then Category and, when needed, Subcategory. This order serializes taxonomy changes with the existing publication and reservation competition locks and provides the order for future assignment writers. Revision checks occur after locks. Unique constraints resolve concurrent duplicate creates without extra audit entries.

Any non-no-op taxonomy change is blocked after resultsPublishedAt is set, including changes to names/order/activation and new groups. A reviewed correction is required to change published structures. No existing publication or visibility value is rewritten by taxonomy management.

Deactivating an active group is blocked with 409 TAXONOMY_PENDING_PAYMENTS when pending Payment rows reference its contestants or immutable scopes. Legacy anomalous payment competition fields do not hide affected rows: ownership is checked through assigned contestants and captured scopes. Paid/failed/refunded history can remain while a group is deactivated; rows and counters are never rewritten. Provider reconciliation is not implemented. Existing legacy-unassigned records cannot be inferred into a group. New purchase hierarchy eligibility and history-locked contestant assignment are CAT-03; no payment processing is resumed here.

Every committed create writes CATEGORY_CREATED or SUBCATEGORY_CREATED. Name/slug/order changes write CATEGORY_UPDATED/SUBCATEGORY_UPDATED; activation changes write CATEGORY_STATUS_CHANGED/SUBCATEGORY_STATUS_CHANGED. One request may produce both update and status events. Each includes actor, actual competition/entity, relevant parent, revision and before/after values. Audit failure rolls the data/revision change back. The dashboard activity feed verifies ownership using actual Category/Subcategory rows, not audit JSON, and retains its existing safe projection and bounded size. Three new database counts show categories, subcategories and pending contestant assignments; financial aggregation is unchanged.

## Verification and rollout

Run `powershell -NoProfile -File scripts/test-admin-images.ps1` from the worktree for guarded isolated migrations, API/test TypeScript, all API regressions (including taxonomy), real Next -> Express -> PostgreSQL flows and schema drift. The harness creates only disposable loopback databases, supplies an identity-only SITE_URL fixture for sitemap assertions, and stops its cluster. Focused API command: `npm run test:admin:taxonomy --workspace=apps/api`, requiring an empty migrated localhost `talenthunt_taxonomy_test[_suffix]` database through ADMIN_TAXONOMY_TEST_DATABASE_URL. No DATABASE_URL fallback or hosted test target is accepted.

For faster iteration, `powershell -NoProfile -File scripts/test-admin-images.ps1 -TaxonomyOnly` creates only the taxonomy and real-web test databases and runs those suites. The default still runs all API regressions. Run frontend tests, lint, generated-route TypeScript and production build separately; don't build while the dev integration server is running. Existing image/video/profile/public/visibility/payment-fake checks remain in the regression suites. No schema or historical migration changes are part of CAT-02.

Manual review instructions: check category list/detail/child editor at mobile and desktop widths, long names, empty lists, inactive parents and published read-only state. Use keyboard-only navigation through filters, paging, forms and native confirmation; check focus returns to the error summary after a rejected save. Use disposable fixtures for stale revisions, pending-selection locks and publication. Static rendering and HTTP checks do not claim interactive browser/screen-reader coverage.
