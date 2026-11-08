# ADMIN-05 dashboard overview

Issue: [#41](https://github.com/ebukanathan/TalentHunt/issues/41). The protected `/admin` page loads `GET /api/v1/admin/overview` from Express. A fixed GET-only same-origin facade is available at `/api/admin/overview`.

The page checks the existing admin session on every read. Express independently enforces the existing active-admin/session checks, expiry and revocation. Responses are private/no-store and vary by Cookie. No arbitrary competition selector, sort, filter or upstream URL is accepted. Unknown query parameters return 400. Missing configured competition returns 404 with the established sanitized envelope. Query failures remain errors; they never produce zero statistics.

## Selection, counts and snapshot

The existing `PUBLIC_COMPETITION_SLUG` selection policy is reused, including drafts for administrators. When unset, the newest competition is chosen deterministically; a missing configured slug never falls back. Selection, competition fields, counts, financial read and activity run in one PostgreSQL RepeatableRead transaction.

The success envelope contains `competition` (ID, name, status, currency and voting dates), `counts` (`totalContestants`, `activeContestants`, `activePackages`), `financials` and `recentActivity`. All counts are selected-competition scoped. Active counts use `isActive=true`; active packages remain configured active even when voting is closed or scheduled. They do not imply purchase eligibility. A real empty competition produces zero counts; absence of a competition produces the separate no-competition state.

The UI displays voting dates in Africa/Lagos and “Not set” for absent dates. Management shortcuts link to contestant listing, registration, active filtering, competition settings and packages. Loading, missing competition, empty activity, financial unavailability and upstream error have separate accessible states. Retry performs a fresh page load.

## Recent changes

The feed returns at most ten known administrative change actions, ordered by `createdAt DESC, id DESC`. Competition changes match its ID; contestant and package changes are matched to existing entity ownership using PostgreSQL subqueries. Claimed competition IDs in audit JSON do not determine ownership. Image changes are included even though their legacy audit details omit a competition ID. Account/login actions, unknown actions, other competitions and dangling entities are excluded.

Only event ID, action, entity type/ID, actor email (or null for System) and timestamp are projected. Raw details, IP addresses, credentials and payment contacts are never loaded into the feed. The UI escapes text and supplies management links. This bounded preview does not complete the paginated audit-history explorer in #18. Overview reads do not create audit events.

## Financial states

The feature reads existing Payment records and never writes them or contacts Paystack. Known `th-test-` initialization references are excluded. Recorded paid totals require status PAID, NGN currency, positive stored `amountKobo`, and non-null `paidAt` and `providerTxnId`. Pending, failed, refunded and unsupported records cannot contribute to the paid amount. No revenue is inferred from package prices, votes or contestant counts.

- `state=unavailable` supplies `NO_PAYMENT_DATA`, `NO_RECORDED_PAID_DATA` or `UNSUPPORTED_CURRENCY`, with no invented amount/count values.
- `state=recorded` supplies NGN plus `paymentCount`, `paidCount` and `amountKobo` as exact decimal strings. `paymentCount` includes all non-test records for the selected competition; `paidCount` and amount include only the qualifying paid NGN records.

SQL aggregates are cast to text and money display uses BigInt, preserving integer kobo beyond JavaScript safe-number bounds. The UI labels these values “Recorded paid amount”; settlement and reconciled revenue remain unavailable. Stored fields alone do not claim new provider verification or paid-voting readiness.

## Verification and preservation

The completed check results are recorded in [ADMIN-05 verification](admin05-verification.md).

Run `powershell -NoProfile -File scripts/test-admin-images.ps1` for the full admin/API/Next/PostgreSQL regression harness. It now creates an additional fresh `talenthunt_overview_test_images` database and runs the overview cases. Standalone API overview tests require a fresh migrated localhost `ADMIN_OVERVIEW_TEST_DATABASE_URL` with database name `talenthunt_overview_test[_suffix]`; populated/hosted/production targets are refused.

New overview fixtures leave Payment, PaymentInitialization and VoteAllocation empty. Non-empty financial cases use read mocks, including a read-only CTE that shadows the Payment relation to exercise the actual PostgreSQL aggregation without inserting records. The pre-existing payment regression suite retains its own isolated fixtures. No hosted records or provider requests are needed.

Run frontend tests/lint/typecheck/build separately; heavy production builds should follow the dev HTTP integration on this Windows host. No new dependency, schema change or migration is required. Existing payment implementation, all database models and historical migration files remain preserved. Recurring ADMIN-03 cleanup scheduling and deployment-wide visual/mobile/keyboard acceptance remain independent follow-ups.
