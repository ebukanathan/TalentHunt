# Proposed TalentHunt backlog

No GitHub changes have been executed by --plan.

| Key | Phase | Priority | Status | Dependencies | Issue |
| --- | --- | --- | --- | --- | --- |
| F01 | 1 | P1 | Done | None | Create workspace, Next.js starter and Express health scaffold |
| F02 | 1 | P1 | Done | None | Define initial Prisma models and verify initial database migration |
| F03 | 1 | P1 | Next | F02 | Implement repeatable development database seeding |
| F04 | 1 | P1 | Backlog | F01, F02 | Publish a reproducible source and environment baseline |
| F05 | 1 | P1 | Backlog | F02 | Add API configuration, Prisma lifecycle and safe error handling |
| C01 | 2 | P1 | Backlog | F03, F05, A01 | Implement protected competition lifecycle and vote-package management |
| C02 | 2 | P1 | Backlog | C01 | Implement protected contestant management and cross-competition guards |
| C03 | 2 | P1 | Backlog | C02 | Build public competition pages, contestant profiles and leaderboard |
| E01 | 3 | P1 | Backlog | F05 | Send verification codes with expiry and abuse controls |
| E02 | 3 | P0 | Backlog | E01 | Verify email and atomically consume checkout authorization |
| E03 | 3 | P1 | Backlog | E02, C03 | Build the voter email-verification flow |
| P01 | 4 | P0 | Backlog | E02, C02 | Initialize Paystack checkout using server-owned payment snapshots |
| P02 | 4 | P0 | Backlog | P01 | Authenticate Paystack webhooks and verify payment facts |
| P03 | 4 | P0 | Backlog | P02 | Allocate paid votes exactly once under concurrent delivery |
| P04 | 4 | P1 | Backlog | P03, E03 | Build checkout return, payment status and voter receipt screens |
| P05 | 4 | P0 | Backlog | P03 | Reconcile payments and implement auditable refund/vote-reversal handling |
| A01 | 5 | P0 | Backlog | F05 | Implement administrator authentication and protected API access |
| A02 | 5 | P1 | Backlog | A01, C02 | Build admin management screens and audit trail |
| A03 | 5 | P1 | Backlog | A01, P05 | Build admin payment, vote and reconciliation reporting |
| T01 | 6 | P0 | Backlog | P03, P05, E02, A01 | Establish security and payment-integrity regression tests |
| T02 | 6 | P1 | Backlog | F04 | Add pull-request CI checks and migration validation |
| T03 | 6 | P0 | Backlog | T02, P04, A02 | Deploy staging with separated credentials and controlled migrations |
| T04 | 6 | P0 | Backlog | T03, P05 | Prove database recovery and add monitoring/runbooks |
| T05 | 6 | P0 | Backlog | T01, T03, T04, A03 | Complete release rehearsal and approve paid-voting launch |

# F01: Create workspace, Next.js starter and Express health scaffold

Record the narrowly scoped scaffold already present locally. This does not certify a production build or any voting feature.

**Phase:** Project Foundation

**Priority:** P1

**Initial status:** Done

**Labels:** area:api, area:web

## Acceptance criteria

- [x] Root npm workspaces contain apps/web and apps/api with development commands.
- [x] Express health route returns HTTP 200 and status ok.
- [x] API TypeScript check and frontend lint pass.

## Dependencies

- None.

## Evidence and verification

- package.json defines both workspaces and dev:web/dev:api. apps/web/src/app/page.tsx is the generated starter; apps/api/src/app.ts exposes /api/v1/health.
- 2026-10-21: tsc -p apps/api/tsconfig.json --noEmit and npm run lint --workspace=apps/web exited 0; a live ephemeral-port health request returned 200/status ok.
- Local source is untracked and GitHub is empty. Publishing the source is F04.

**Review baseline:** 21 October 2026 (Africa/Lagos). Repository review is local; source publication is tracked by F04.

---

# F02: Define initial Prisma models and verify initial database migration

Record the existing initial data model and applied migration. Domain and payment invariants remain separate implementation work.

**Phase:** Project Foundation

**Priority:** P1

**Initial status:** Done

**Labels:** area:database

## Acceptance criteria

- [x] Eight domain models and CompetitionStatus/PaymentStatus enums exist in schema and initial SQL migration.
- [x] Prisma validates the schema and migration history is current in the configured database.
- [x] A read-only live database comparison finds no difference from the Prisma data model.

## Dependencies

- None.

## Evidence and verification

- prisma/schema.prisma and prisma/migrations/20261021044148_init/migration.sql define Competition, Contestant, VotePackage, ContactVerification, Payment, VoteAllocation, AdminUser and AuditLog.
- 2026-10-21: prisma validate exited 0. prisma migrate status exited 0: one migration, database schema up to date.
- 2026-10-21: prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code exited 0: No difference detected.
- Checks establish the configured database state at review time, not production readiness, backups or restored data reliability.

**Review baseline:** 21 October 2026 (Africa/Lagos). Repository review is local; source publication is tracked by F04.

---

# F03: Implement repeatable development database seeding

Make database seeding the next development task. Create fictional fixtures for competition and voter development without generating paid votes or unsafe credentials.

**Phase:** Project Foundation

**Priority:** P1

**Initial status:** Next

**Labels:** area:database

## Acceptance criteria

- [ ] Add prisma/seed.ts and configure the Prisma 6.19 seed command with an explicitly resolvable TypeScript runner.
- [ ] Seed a fictional competition, contestants and positive integer-kobo vote packages with stable identifiers; a second run produces no duplicates.
- [ ] Require an explicit development/test database target and refuse production or ambiguous targets. Perform no resets or truncation.
- [ ] Use no real contacts, real payments, allocated votes or hard-coded admin passwords. Document commands and prerequisites.
- [ ] On an isolated development database run twice and verify counts, relations, zero vote totals and clean disconnection on success/failure.

## Dependencies

- Depends on F02.

## Evidence and verification

- No seed file or migrations.seed setting exists in the reviewed tree. F02 migration prerequisites are verified.

**Review baseline:** 21 October 2026 (Africa/Lagos). Repository review is local; source publication is tracked by F04.

---

# F04: Publish a reproducible source and environment baseline

Local Git has no commits or remote; the existing public GitHub repository is empty. Establish a safe source baseline and reproducible setup.

**Phase:** Project Foundation

**Priority:** P1

**Initial status:** Backlog

**Labels:** area:delivery, documentation

## Acceptance criteria

- [ ] Review ignore rules for .env variants, dependencies, build outputs and local artifacts; add a secret-free .env.example and root README.
- [ ] Document npm ci, app commands, Prisma generation, migration/seed commands, runtime requirements and runtime versus migration database URLs.
- [ ] Review staged content for secrets, make the initial commit, configure the intended remote and push a default branch.
- [ ] Verify a clean checkout installs, typechecks, lints and builds both apps; record/fix Next.js font or network requirements.
- [ ] Document web -> Express -> Prisma/PostgreSQL ownership; browser code receives no database or payment provider secret.

## Dependencies

- Depends on F01.
- Depends on F02.

## Evidence and verification

- git log reports no commits; git remote -v is empty; all application files are untracked. GitHub reports ebukanathan/TalentHunt is public and empty.
- The project-management setup itself will not commit, push or change repository visibility.

**Review baseline:** 21 October 2026 (Africa/Lagos). Repository review is local; source publication is tracked by F04.

---

# F05: Add API configuration, Prisma lifecycle and safe error handling

Build a small service foundation before feature routes. Current middleware is Helmet, localhost CORS and JSON parsing, with a health endpoint only.

**Phase:** Project Foundation

**Priority:** P1

**Initial status:** Backlog

**Labels:** area:api, area:security

## Acceptance criteria

- [ ] Share one appropriately managed Prisma client, validate server configuration and implement graceful HTTP/database shutdown.
- [ ] Add validated input, consistent sanitized errors, request IDs, structured logs and meaningful readiness checks.
- [ ] Configure explicit frontend origins and body limits; reserve a webhook route that retains original signed bytes before general JSON parsing.
- [ ] Verify bad input, missing configuration, unavailable database and shutdown without exposing secrets or unnecessary personal data.

## Dependencies

- Depends on F02.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 21 October 2026 (Africa/Lagos). Repository review is local; source publication is tracked by F04.

---

# C01: Implement protected competition lifecycle and vote-package management

Implement authorized competition/package services. Existing schema fields do not establish business rules or working endpoints.

**Phase:** Competition and Contestant Management

**Priority:** P1

**Initial status:** Backlog

**Labels:** area:api, area:database

## Acceptance criteria

- [ ] Validate DRAFT/SCHEDULED/OPEN/CLOSED/COMPLETED transitions, UTC windows and opens-before-closes.
- [ ] Enforce positive integer priceKobo/voteCount, supported currency, package ownership and slug uniqueness; add appropriate database checks via reviewed migrations.
- [ ] Authorize all mutations, write audit events and preserve existing payment snapshots after package edits.
- [ ] Test forbidden access, invalid transitions, duplicate slugs, negative values, closed windows and deactivation.

## Dependencies

- Depends on F03.
- Depends on F05.
- Depends on A01.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 21 October 2026 (Africa/Lagos). Repository review is local; source publication is tracked by F04.

---

# C02: Implement protected contestant management and cross-competition guards

Provide contestant editing and deactivation with integrity rules preventing attribution to another competition.

**Phase:** Competition and Contestant Management

**Priority:** P1

**Initial status:** Backlog

**Labels:** area:api, area:database

## Acceptance criteria

- [ ] Implement protected create/update/list/deactivate endpoints with pagination and validated contestant fields/image URLs.
- [ ] Enforce contestant number/slug uniqueness per competition and consistent competition membership of contestant, package and payment; state which invariants the database enforces.
- [ ] Preserve referenced history and reject edits that corrupt historical attribution.
- [ ] Test cross-competition references, inactive contestants, duplicate identifiers and unauthorized mutation.

## Dependencies

- Depends on C01.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 21 October 2026 (Africa/Lagos). Repository review is local; source publication is tracked by F04.

---

# C03: Build public competition pages, contestant profiles and leaderboard

Replace the generated homepage with read-only public competition and contestant views.

**Phase:** Competition and Contestant Management

**Priority:** P1

**Initial status:** Backlog

**Labels:** area:web, area:api

## Acceptance criteria

- [ ] Show competition state, contestants, profiles and active packages with loading, empty, not-found and error states.
- [ ] Define tie ordering/leaderboard visibility and pagination; serialize BigInt vote totals safely as decimal strings.
- [ ] Show eligibility/voting-window state; enforce it again at checkout on the server.
- [ ] Check responsive layout and keyboard access; public responses expose no voter contact, payment details or admin-only fields.

## Dependencies

- Depends on C02.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 21 October 2026 (Africa/Lagos). Repository review is local; source publication is tracked by F04.

---

# E01: Send verification codes with expiry and abuse controls

Implement transactional email delivery and code issuance. ContactVerification currently provides a data model only.

**Phase:** Email Verification

**Priority:** P1

**Initial status:** Backlog

**Labels:** area:api, area:security

## Acceptance criteria

- [ ] Choose/configure an email provider and development fake with documented environment variables.
- [ ] Generate cryptographically random codes, store only a keyed hash suitable for short OTPs, and enforce expiry, resend cooldown and per-address/per-IP limits.
- [ ] Invalidate superseded challenges, give generic responses and exclude codes/personal data from logs.
- [ ] Test provider failure, resend/concurrent issuance, throttling and expiry.

## Dependencies

- Depends on F05.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 21 October 2026 (Africa/Lagos). Repository review is local; source publication is tracked by F04.

---

# E02: Verify email and atomically consume checkout authorization

Bind verification to a short-lived single-use checkout authorization. Nullable Payment.verificationId does not enforce verified email.

**Phase:** Email Verification

**Priority:** P0

**Initial status:** Backlog

**Labels:** area:api, area:security

## Acceptance criteria

- [ ] Enforce expiration/attempt limits and safe hash comparison; return a scoped opaque authorization after successful verification.
- [ ] Bind authorization to server-side normalized email/challenge state; client fields cannot assert verification.
- [ ] Consume authorization atomically with local payment creation and document retry behavior after provider initialization failures.
- [ ] Test brute force, replay, expired codes, email substitution and concurrent consumption.

## Dependencies

- Depends on E01.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 21 October 2026 (Africa/Lagos). Repository review is local; source publication is tracked by F04.

---

# E03: Build the voter email-verification flow

Add email and code entry before checkout while retaining the selected contestant/package.

**Phase:** Email Verification

**Priority:** P1

**Initial status:** Backlog

**Labels:** area:web

## Acceptance criteria

- [ ] Support code entry, resend countdown, expiry, edit-email and recoverable delivery errors.
- [ ] Use accessible labels/focus and display server errors; client validation never substitutes for server verification.
- [ ] Retain voting selection without exposing authorization in URLs/analytics; recover gracefully from expired authorization.

## Dependencies

- Depends on E02.
- Depends on C03.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 21 October 2026 (Africa/Lagos). Repository review is local; source publication is tracked by F04.

---

# P01: Initialize Paystack checkout using server-owned payment snapshots

Create local pending payments and hosted checkout from trusted server records rather than client prices or vote quantities.

**Phase:** Payments and Vote Allocation

**Priority:** P0

**Initial status:** Backlog

**Labels:** area:payments, area:api

## Acceptance criteria

- [ ] Recheck competition window, active contestant/package, membership and verified-email authorization during payment creation.
- [ ] Generate a unique reference and persist immutable amountKobo, currency, voteCount and attribution before provider interaction.
- [ ] Use Paystack test mode and backend-only secrets; validate checkout/callback URLs and return only necessary checkout data.
- [ ] Define idempotent submission/retry handling for provider timeouts without inconsistent references or duplicate authorization consumption.
- [ ] Test amount tampering, cross-competition selection, package edits, repeated submission and initialization failure.

## Dependencies

- Depends on E02.
- Depends on C02.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 21 October 2026 (Africa/Lagos). Repository review is local; source publication is tracked by F04.

---

# P02: Authenticate Paystack webhooks and verify payment facts

Accept provider signals only after authenticity and transaction checks. A browser redirect cannot prove payment.

**Phase:** Payments and Vote Allocation

**Priority:** P0

**Initial status:** Backlog

**Labels:** area:payments, area:security

## Acceptance criteria

- [ ] Preserve the signed webhook payload and verify x-paystack-signature using the documented HMAC-SHA512 scheme and safe comparison.
- [ ] For supported success events verify server-side provider facts and match status, reference, transaction ID, amount and currency against immutable local records.
- [ ] Reject/quarantine mismatches and unknown references without votes; separate test/live configuration and keep secrets/personal payloads out of logs.
- [ ] Acknowledge only after durable processing or durable handoff; verify invalid signatures, wrong amounts/currency, provider failure and transient retry behavior.

## Dependencies

- Depends on P01.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 21 October 2026 (Africa/Lagos). Repository review is local; source publication is tracked by F04.

## References

- https://paystack.com/docs/payments/webhooks/
- https://paystack.com/docs/payments/verify-payments/

---

# P03: Allocate paid votes exactly once under concurrent delivery

Finalize payments and allocate votes atomically. Existing uniqueness constraints alone do not prove safe counter updates.

**Phase:** Payments and Vote Allocation

**Priority:** P0

**Initial status:** Backlog

**Labels:** area:payments, area:database

## Acceptance criteria

- [ ] Commit payment PAID, one allocation and an atomic contestant totalVotes increment in one database transaction using conditional transitions/locking.
- [ ] Use one idempotent finalizer for webhooks, status refresh and reconciliation; enforce unique payment/provider references.
- [ ] Match allocation contestant/vote count to the payment snapshot and document policy for confirmation arriving after voting closes.
- [ ] Run PostgreSQL concurrency and failure-injection tests: duplicate callbacks and status/webhook races produce one allocation/increment, with full rollback on failure.

## Dependencies

- Depends on P02.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 21 October 2026 (Africa/Lagos). Repository review is local; source publication is tracked by F04.

---

# P04: Build checkout return, payment status and voter receipt screens

Complete the voter journey using trusted server payment/allocation state.

**Phase:** Payments and Vote Allocation

**Priority:** P1

**Initial status:** Backlog

**Labels:** area:web, area:payments

## Acceptance criteria

- [ ] Support hosted checkout, bounded status polling, reload recovery and pending/paid/failed/cancelled retry states.
- [ ] Show paid only after verified payment and allocation; redirect parameters cannot grant votes.
- [ ] Protect status/receipt access using a scoped unguessable token or equivalent authorization; avoid email/payment leaks through enumerable IDs.
- [ ] Verify successful, failed, abandoned, delayed-webhook and return-before-webhook journeys in test mode.

## Dependencies

- Depends on P03.
- Depends on E03.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 21 October 2026 (Africa/Lagos). Repository review is local; source publication is tracked by F04.

---

# P05: Reconcile payments and implement auditable refund/vote-reversal handling

Recover from missed events and define refunds/disputes before taking real money. REFUNDED status currently has no reversal ledger.

**Phase:** Payments and Vote Allocation

**Priority:** P0

**Initial status:** Backlog

**Labels:** area:payments, area:database

## Acceptance criteria

- [ ] Provide bounded retryable reconciliation using the shared idempotent finalizer for pending/inconsistent payments.
- [ ] Document late-payment, refund, partial-refund and dispute policy; unsupported cases have a safe documented manual process.
- [ ] Add immutable uniquely keyed reversal records through a reviewed migration when votes reverse; preserve original allocations and prevent repeated or negative reversals.
- [ ] Compare counters to allocations less applicable reversals, alert on mismatch and audit repair/refund operations.
- [ ] Test repeated refunds, missing callbacks and interrupted/retried reconciliation; document provider/dashboard recovery.

## Dependencies

- Depends on P03.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 21 October 2026 (Africa/Lagos). Repository review is local; source publication is tracked by F04.

---

# A01: Implement administrator authentication and protected API access

Implement minimal admin security before management endpoints. Pull this prerequisite forward before C01 despite its phase grouping.

**Phase:** Admin Dashboard

**Priority:** P0

**Initial status:** Backlog

**Labels:** area:security, area:api

## Acceptance criteria

- [ ] Document the auth choice: securely hashed AdminUser credentials and one-time bootstrap without default passwords, or an explicit migration to Supabase Auth.
- [ ] Use expiring revocable sessions and secure cookies; protect cookie-based mutations from CSRF and validate allowed origins.
- [ ] Apply shared API authorization, inactive-admin checks and login throttling; hiding frontend pages is insufficient.
- [ ] Test unauthorized access, logout/expiry, inactive users and brute-force limits; redact credentials.

## Dependencies

- Depends on F05.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 21 October 2026 (Africa/Lagos). Repository review is local; source publication is tracked by F04.

---

# A02: Build admin management screens and audit trail

Provide a small authenticated interface for operating competitions, contestants and packages.

**Phase:** Admin Dashboard

**Priority:** P1

**Initial status:** Backlog

**Labels:** area:web, area:api

## Acceptance criteria

- [ ] Support login/logout and validated management forms with useful server errors.
- [ ] Confirm lifecycle/destructive operations and prevent unsafe edits to referenced history.
- [ ] Persist actor/action/entity and sanitized change details; provide a protected paginated audit view.
- [ ] Verify each management journey on desktop/mobile and reject direct unauthorized API access.

## Dependencies

- Depends on A01.
- Depends on C02.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 21 October 2026 (Africa/Lagos). Repository review is local; source publication is tracked by F04.

---

# A03: Build admin payment, vote and reconciliation reporting

Let the solo operator inspect and resolve discrepancies without manually editing PostgreSQL.

**Phase:** Admin Dashboard

**Priority:** P1

**Initial status:** Backlog

**Labels:** area:web, area:payments

## Acceptance criteria

- [ ] Provide paginated filters by competition, state, date and reference; distinguish gross/refunded/net money and vote totals.
- [ ] Show payment/allocation/reversal history and discrepancies; authorize and audit retry/repair actions.
- [ ] Restrict voter contact access and exclude secrets; protect CSV against formula injection if exporting.
- [ ] Verify integer-minor-unit reporting against known paid/failed/refunded fixtures and ledger totals.

## Dependencies

- Depends on A01.
- Depends on P05.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 21 October 2026 (Africa/Lagos). Repository review is local; source publication is tracked by F04.

---

# T01: Establish security and payment-integrity regression tests

Establish an isolated integration harness and cross-feature regression suite. Feature-specific acceptance tests belong in each implementation.

**Phase:** Testing, CI/CD and Deployment

**Priority:** P0

**Initial status:** Backlog

**Labels:** area:quality, area:payments

## Acceptance criteria

- [ ] Apply migrations and deterministic fixtures to isolated PostgreSQL; tests refuse production targets.
- [ ] Cover verification abuse/replay, authorization, amount/membership tampering, duplicate/out-of-order events, concurrency, rollback and refunds.
- [ ] Mock provider boundaries deterministically and document a separate sandbox smoke path.
- [ ] Replace failing placeholder test scripts and prove breaking idempotency or authorization fails the relevant tests.

## Dependencies

- Depends on P03.
- Depends on P05.
- Depends on E02.
- Depends on A01.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 21 October 2026 (Africa/Lagos). Repository review is local; source publication is tracked by F04.

---

# T02: Add pull-request CI checks and migration validation

Start CI early and extend it as tests arrive. Root/API test scripts currently fail as placeholders and no workflows exist.

**Phase:** Testing, CI/CD and Deployment

**Priority:** P1

**Initial status:** Backlog

**Labels:** area:delivery, area:quality

## Acceptance criteria

- [ ] Configure GitHub Actions with supported pinned runtime, npm ci, Prisma generation/validation, API typecheck, web lint and production builds.
- [ ] Apply migrations to disposable PostgreSQL and run implemented tests; PR jobs have no production/provider-live credentials.
- [ ] Use least-privilege permissions, safe caching and clear failure output.
- [ ] Demonstrate default-branch and PR runs; document required checks and available branch-protection capabilities.

## Dependencies

- Depends on F04.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 21 October 2026 (Africa/Lagos). Repository review is local; source publication is tracked by F04.

---

# T03: Deploy staging with separated credentials and controlled migrations

Deploy the web/API and Supabase PostgreSQL to staging with separate data and Paystack test keys.

**Phase:** Testing, CI/CD and Deployment

**Priority:** P0

**Initial status:** Backlog

**Labels:** area:delivery, area:database, area:security

## Acceptance criteria

- [ ] Choose/document hosts, region and settings with isolated development/staging/production credentials.
- [ ] Validate runtime pooling versus migration connections, TLS and connection limits; secure exposed Supabase tables via appropriate grants/RLS and server-only privileged keys.
- [ ] Run prisma migrate deploy in a controlled release step; never migrate dev, reset or demo-seed production.
- [ ] Configure HTTPS, origins, readiness and webhook URL; pass a complete verification/payment/allocation staging journey.
- [ ] Document deploy/rollback order and backward-compatible migrations; migration failure blocks release.

## Dependencies

- Depends on T02.
- Depends on P04.
- Depends on A02.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 21 October 2026 (Africa/Lagos). Repository review is local; source publication is tracked by F04.

---

# T04: Prove database recovery and add monitoring/runbooks

Establish recoverability and visibility. An applied migration is not proof of reliable backups.

**Phase:** Testing, CI/CD and Deployment

**Priority:** P0

**Initial status:** Backlog

**Labels:** area:delivery, area:database

## Acceptance criteria

- [ ] Verify actual Supabase plan backup/retention/restore capabilities, define RPO/RTO and time an isolated restore rehearsal.
- [ ] After restore verify migration state, relations and payment/allocation/reversal consistency; save evidence and operator steps.
- [ ] Alert on availability/errors, old pending payments, webhook failures, reconciliation mismatches and connection exhaustion.
- [ ] Document privacy/log retention and recovery for provider outage, key compromise, migration failure and unavailable database.

## Dependencies

- Depends on T03.
- Depends on P05.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 21 October 2026 (Africa/Lagos). Repository review is local; source publication is tracked by F04.

---

# T05: Complete release rehearsal and approve paid-voting launch

Use an evidence-based go/no-go gate before real paid traffic.

**Phase:** Testing, CI/CD and Deployment

**Priority:** P0

**Initial status:** Backlog

**Labels:** area:quality, area:delivery, area:security

## Acceptance criteria

- [ ] Rehearse mobile/desktop verification, payment success/failure/abandonment, delayed events and admin operations.
- [ ] Exercise expected peak traffic, duplicate events, closing boundaries and database/provider failures; record acceptable limits.
- [ ] Review dependency/secret scans, authorization, CORS/CSRF, Supabase exposure and privacy/payment/refund disclosures.
- [ ] Verify production migration, backups, TLS, live webhook/provider settings and monitoring; complete a controlled live payment/reconciliation check with approved refund handling.
- [ ] Record owner go/no-go and rollback evidence. Unresolved critical payment/security risks block launch.

## Dependencies

- Depends on T01.
- Depends on T03.
- Depends on T04.
- Depends on A03.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 21 October 2026 (Africa/Lagos). Repository review is local; source publication is tracked by F04.
