# ADMIN-04: competition and vote packages

Issue: https://github.com/ebukanathan/TalentHunt/issues/9

Administrators manage the selected competition at `/admin/competition` and its packages at `/admin/vote-packages`. Overview displays the current stored status and voting dates. Existing ADMIN-01 sessions, active-admin checks, exact-origin validation and CSRF protection guard all reads/writes through Express and the fixed-path Next.js facade. No schema migration, administrator registration, competition creation/deletion or payment-provider change is included.

## Selected competition and public visibility

Selection remains `PUBLIC_COMPETITION_SLUG`, or the deterministic newest competition when unset. Admin selection includes drafts; public selection hides drafts without falling back to an older competition. Draft contestant lists and package lists are empty, and draft competition/profile lookups return 404. Scheduled, open, closed and completed competitions can be browsed with active contestants. Only active NGN packages priced at least 5000 kobo with positive vote counts are exposed, and only when the selected competition is OPEN within its voting window. Checkout retains its independent existing eligibility checks.

Competition identity, slug, currency and package competition membership are server-owned and not editable here. A non-NGN competition/package fails safely rather than silently changing currency. Inactive packages remain visible to administrators and retain financial relations; no package deletion endpoint exists.

## Lifecycle and dates

| Current status | Allowed changes |
| --- | --- |
| DRAFT | SCHEDULED or OPEN |
| SCHEDULED | DRAFT or OPEN |
| OPEN | CLOSED |
| CLOSED | OPEN or COMPLETED |
| COMPLETED | No further status change |

Keeping the same status is allowed. Reopening CLOSED before completion is explicitly supported and audited. New scheduling requires both dates and a future opening. Opening or reopening requires both dates, opening at or before now, and closing after now. Opening must precede closing; the opening boundary is inclusive and closing is exclusive. Completed voting dates cannot change, although name/description corrections remain allowed. Existing legacy metadata-only edits preserve absent or expired windows; a new scheduling/opening action or a changed active window must meet the current rules.

Scheduling does not automatically change status to OPEN: the administrator must open voting explicitly. Date inputs are labelled Africa/Lagos (UTC+01:00), converted to UTC ISO timestamps, and validated again on the backend. Unchanged input values preserve stored seconds/milliseconds. Editing an unrelated field cannot silently truncate the voting window.

## REST API

All paths below start with `/api/v1/admin`; the browser uses the equivalent same-origin `/api/admin` facade.

| Method/path | Purpose |
| --- | --- |
| GET /competition | Current competition including updatedAt for stale-save detection |
| PATCH /competition | Edit name, description, status and voting dates |
| GET /vote-packages?page=1 | Current competition's active and inactive packages, 20 per page |
| POST /vote-packages | Create from name, voteCount, priceNgn and optional isActive |
| PATCH /vote-packages/:id | Edit the selected competition's package |

PATCH requests require `expectedUpdatedAt` from the latest GET response. Row locks, strict input allowlists, monotonically advancing updatedAt values and transactional audit writes protect against stale/concurrent saves. Stale settings return 409 and require a reload. No-op updates do not create misleading audit entries. An audit failure rolls the administrative write back.

Package price is a decimal string, for example `"50.01"`; the backend parses digits with BigInt and stores 5001 kobo. It never multiplies a binary floating-point naira value. Limits are NGN 50.00 through 21,474,836.47 inclusive, matching current checkout and PostgreSQL Int storage. At most two decimal places are accepted; numeric JSON prices, exponent notation, separators, negative amounts and overflows are rejected. Vote quantity must be an integer from 1 through 2,147,483,647. The client cannot set priceKobo, currency, competitionId or payment snapshot fields.

Existing Payment amountKobo, voteCount, currency, contact and attribution snapshots, VoteAllocation records and historical migrations are preserved. Package changes affect future selections only. This issue does not initialize or verify Paystack transactions.

## Verification

Run `powershell -NoProfile -File scripts/test-admin-images.ps1` from the repository root on Windows with PostgreSQL 18 installed. The shared full-admin harness now includes ADMIN-04, creates a new temporary cluster and fresh guarded databases, and never resets an existing database. New tests require `ADMIN_SETTINGS_TEST_DATABASE_URL` to be a fresh migrated localhost `talenthunt_settings_test[_suffix]` database. Run frontend tests/lint/typecheck/build separately; the real Next/Express/PostgreSQL flow is included in the harness.

Tests cover authorization, CSRF/origin, strict validation, exact prices, lifecycle/date boundaries, drafts, ownership, inactive packages, concurrent/stale writes, rollback on audit failure and unchanged financial history. Existing authentication, contestant, image, public API and Paystack regression cases remain part of the suite. Deployment should retain the separately documented ADMIN-03 image-cleanup schedule.
