# Proposed TalentHunt backlog

No GitHub changes have been executed by --plan.

| Key | Phase | Priority | Status | Dependencies | Issue |
| --- | --- | --- | --- | --- | --- |
| F01 | 1 | P1 | Done | None | Create workspace, Next.js starter and Express health scaffold |
| F02 | 1 | P1 | Done | None | Define initial Prisma models and verify initial database migration |
| F03 | 1 | P1 | Done | F02 | Implement repeatable development database seeding |
| F04 | 1 | P1 | Backlog | F01, F02 | Publish a reproducible source and environment baseline |
| F05 | 1 | P1 | Backlog | F02 | Add API configuration, Prisma lifecycle and safe error handling |
| ADMIN-04 | 5 | P1 | Backlog | ADMIN-01, ADMIN-02, ADMIN-03, F03 | Competition configuration and vote-package management |
| ADMIN-02 | 5 | P1 | Backlog | ADMIN-01, F03 | Contestant CRUD - name, contestant number, bio, image reference, active status |
| C03 | 2 | P1 | Backlog | None | Build public competition pages, contestant profiles and leaderboard |
| E01 | 3 | P1 | Backlog | E02, P03, F05 | Deliver transactional voting confirmations with safe retries |
| E02 | 3 | P0 | Backlog | F02 | Prepare history-preserving checkout email and confirmation schema |
| E03 | 3 | P1 | Backlog | P01 | Build required-email checkout without OTP or verification links |
| P01 | 4 | P0 | Done | F02, F03 | PAY-01: Paystack test configuration and payment initialization |
| P02 | 4 | P0 | Backlog | P01 | Authenticate Paystack webhooks and verify payment facts |
| P03 | 4 | P0 | Backlog | P02, E02 | Allocate paid votes exactly once under concurrent delivery |
| P04 | 4 | P1 | Backlog | P03, E03 | Build checkout return, payment status and voter receipt screens |
| P05 | 4 | P0 | Backlog | P03 | Reconcile payments and implement auditable refund/vote-reversal handling |
| ADMIN-01 | 5 | P0 | In Progress | F02 | Admin authentication and protected dashboard layout |
| A02 | 5 | P1 | Backlog | ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04 | Build admin management screens and audit trail |
| A03 | 5 | P1 | Backlog | ADMIN-01, P05 | Build admin payment, vote and reconciliation reporting |
| T01 | 6 | P0 | Backlog | P03, P05, E01, E03, ADMIN-01 | Establish security and payment-integrity regression tests |
| T02 | 6 | P1 | Backlog | F04 | Add pull-request CI checks and migration validation |
| T03 | 6 | P0 | Backlog | T02, P04, A02, E01 | Deploy staging with separated credentials and controlled migrations |
| T04 | 6 | P0 | Backlog | T03, P05 | Prove database recovery and add monitoring/runbooks |
| T05 | 6 | P0 | Backlog | T01, T03, T04, A03 | Complete release rehearsal and approve paid-voting launch |
| ADMIN-03 | 5 | P1 | Backlog | ADMIN-01, ADMIN-02 | Secure contestant image upload using Supabase Storage |

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

**Review baseline:** 2026-10-27 (Africa/Lagos). See roadmap.md for current scope and preserved historical evidence.

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

**Review baseline:** 2026-10-27 (Africa/Lagos). See roadmap.md for current scope and preserved historical evidence.

---

# F03: Implement repeatable development database seeding

Make database seeding the next development task. Create fictional fixtures for competition and voter development without generating paid votes or unsafe credentials.

**Phase:** Project Foundation

**Priority:** P1

**Initial status:** Done

**Labels:** area:database

## Acceptance criteria

- [x] Add prisma/seed.ts and configure the Prisma 6.19 seed command with an explicitly resolvable TypeScript runner.
- [x] Seed a fictional competition, contestants and positive integer-kobo vote packages with stable identifiers; a second run produces no duplicates.
- [x] Require an explicit development/test database target and refuse production or ambiguous targets. Perform no resets or truncation.
- [x] Use no real contacts, real payments, allocated votes or hard-coded admin passwords. Document commands and prerequisites.
- [x] On an isolated development database run twice and verify counts, relations, zero vote totals and clean disconnection on success/failure.

## Dependencies

- Depends on F02.

## Evidence and verification

- No seed file or migrations.seed setting exists in the reviewed tree. F02 migration prerequisites are verified.

**Review baseline:** 2026-10-27 (Africa/Lagos). See roadmap.md for current scope and preserved historical evidence.

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

**Review baseline:** 2026-10-27 (Africa/Lagos). See roadmap.md for current scope and preserved historical evidence.

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

**Review baseline:** 2026-10-27 (Africa/Lagos). See roadmap.md for current scope and preserved historical evidence.

---

# ADMIN-04: Competition configuration and vote-package management

Reuse Competition and VotePackage for protected administrator configuration and forms after the initial admin foundation and contestant/image sequence. Backlog only; no Paystack changes.

**Phase:** Admin Dashboard

**Priority:** P1

**Initial status:** Backlog

**Labels:** area:api, area:web, area:database, area:security

## Acceptance criteria

- [ ] Provide protected Express endpoints and accessible Next.js forms for competition name/slug/description/status/voting dates and package name/voteCount/priceKobo/currency/active status.
- [ ] Use ADMIN-01 session/active-admin/CSRF protection for all writes, strict Zod validation and transactional AuditLog events.
- [ ] Validate lifecycle transitions, UTC boundaries, opening before closing, supported currency, per-competition ownership/uniqueness and positive integer kobo/vote quantities compatible with current checkout rules.
- [ ] Preserve immutable historical Payment money/vote/contact/attribution snapshots, original allocations and migration history when configuration/packages change; refuse history-breaking deletion or reassignment.
- [ ] Test unauthenticated/CSRF failures, invalid lifecycle/date/money inputs, duplicate slugs, package ownership, deactivation, audit entries and end-to-end management forms. Do not initialize/verify Paystack transactions in this issue.

## Dependencies

- Depends on ADMIN-01.
- Depends on ADMIN-02.
- Depends on ADMIN-03.
- Depends on F03.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 2026-10-27 (Africa/Lagos). See roadmap.md for current scope and preserved historical evidence.

---

# ADMIN-02: Contestant CRUD - name, contestant number, bio, image reference, active status

Reuse Contestant and existing public views for protected administrator CRUD in Express and Next.js. This issue is Backlog and cannot start until ADMIN-01 has been reviewed.

**Phase:** Admin Dashboard

**Priority:** P1

**Initial status:** Backlog

**Labels:** area:api, area:web, area:database, area:security

## Acceptance criteria

- [ ] Provide protected paginated list/create/read/update/delete-or-deactivate endpoints and accessible management forms for name, contestant number, bio, managed image reference and active status.
- [ ] Use ADMIN-01 server-side session/active-admin/CSRF guards on every write, strict validation and AuditLog records in the same database transaction.
- [ ] Preserve competition membership and number/slug uniqueness within a competition; derive safe slugs/identifiers and bound/escape text without HTML execution.
- [ ] Use validated managed image references only; file upload/replacement/storage authorization belongs to ADMIN-03. Support no-image fallbacks while upload work is pending. Store no file bytes in PostgreSQL.
- [ ] Preserve payment/vote history; prevent historical attribution changes and refuse hard deletion of referenced records in favor of deactivation. Do not rewrite payment snapshots.
- [ ] Test unauthenticated/CSRF rejection, invalid fields, duplicates, cross-competition references, inactive records, history-safe deletion, audit entries and responsive/keyboard form behavior. No Paystack expansion.

## Dependencies

- Depends on ADMIN-01.
- Depends on F03.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 2026-10-27 (Africa/Lagos). See roadmap.md for current scope and preserved historical evidence.

---

# C03: Build public competition pages, contestant profiles and leaderboard

Stage 3 public pages use the completed public read API (#27). Deliver #29 homepage/list/shared UI, #30 contestant detail, #31 package selection and #32 leaderboard. Administrator CRUD is not a prerequisite for public reads. Checkout collects required email without verification in E03/P01; Stage 3 remains selection-only.

**Phase:** Competition and Contestant Management

**Priority:** P1

**Initial status:** Backlog

**Labels:** area:web, area:api

## Acceptance criteria

- [ ] #29 Homepage, active contestants listing and shared UI/API foundation
- [ ] #30 Contestant detail page
- [ ] #31 Vote package selection and purchase summary
- [ ] #32 Leaderboard with exact totals, tie rules and pagination
- [ ] Competition, contestant, profile, package-selection and leaderboard pages have loading, empty, not-found and error states.
- [ ] Voting eligibility/status and date windows are displayed honestly; no false payment-success flow.
- [ ] Mobile, keyboard and focus behavior are verified; public views expose no private contact/payment/admin data.
- [ ] Each implementation issue has a feature branch, checks and linked PR; no automatic merge to main.

## Dependencies

- Depends on https://github.com/ebukanathan/TalentHunt/issues/27.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 2026-10-27 (Africa/Lagos). See roadmap.md for current scope and preserved historical evidence.

---

# E01: Deliver transactional voting confirmations with safe retries

Replace OTP delivery with one combined payment receipt and successful voting confirmation after verified payment and committed allocation. Proposed provider: Resend behind an adapter and deterministic development fake. Delivery is independent of payment/vote state.

**Phase:** Checkout Email and Transactional Confirmations

**Priority:** P1

**Initial status:** Backlog

**Labels:** area:api, area:delivery, area:security

## Acceptance criteria

- [ ] Configure a reliable transactional provider, verified sender domain, SPF/DKIM/DMARC, separate secrets, sanitized logs and local fake; send no OTP, verification link or marketing.
- [ ] Consume only committed TransactionEmail intents created by P03. Receipt content uses immutable contact/payment/contestant/vote snapshots and a pinned payload/template; no bearer receipt token or card/bank secrets in email.
- [ ] Claim rows atomically with leases and ownership checks. Send outside database transactions using the same provider idempotency key and immutable body on every attempt; store provider message ID and distinguish accepted from delivered.
- [ ] Use bounded exponential backoff/jitter and Retry-After for transient failures. Resend deduplicates for 24 hours: persist first attempt and a conservative deadline (for example 23 hours); ambiguous outcomes after it require reconciliation, never blind resend/new key.
- [ ] Authenticate and deduplicate provider delivery events, reconcile events arriving before acknowledgement, handle reorder/replay, stop automatic resend on hard bounce/complaint and expose sanitized retry/dead-letter diagnostics to authorized support.
- [ ] Provider outage/failure affects only delivery metadata, never checkout authorization, payment verification, allocated votes or a new charge. Admin retry is audited and reuses the same intent; no public arbitrary-address resend.
- [ ] Test two workers, lease expiry, rate limits, timeout/crash before and after provider acceptance, duplicate finalizer/webhook events, expired dedupe window, already accepted/delivered rows and permanent delivery failure without duplicate confirmation submission.

## Dependencies

- Depends on E02.
- Depends on P03.
- Depends on F05.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 2026-10-27 (Africa/Lagos). See roadmap.md for current scope and preserved historical evidence.

## References

- https://resend.com/docs/dashboard/emails/idempotency-keys
- https://resend.com/docs/webhooks/verify-webhooks-requests
- https://resend.com/docs/dashboard/domains/introduction

---

# E02: Prepare history-preserving checkout email and confirmation schema

Next proposed issue for the confirmed no-verification decision. Review the Paystack/API/schema proposal before implementation. Keep Payment.contactEmail required; remove obsolete verification objects only when safe and add an empty durable confirmation outbox.

**Phase:** Checkout Email and Transactional Confirmations

**Priority:** P0

**Initial status:** Backlog

**Labels:** area:database, area:api, area:security

## Acceptance criteria

- [ ] Review docs/product/paid-voting-requirements.md and docs/api/checkout-and-confirmations.md before implementation; keep solo WIP one and do not interrupt #29.
- [ ] Inventory runtime/deployed consumers, Prisma clients, seed integration counts and external dependencies on ContactVerification/Payment.verificationId; no voter OTP/link flow will be built.
- [ ] Keep Payment.contactEmail and all historical payment/allocation values unchanged. Preserve every historical migration file/checksum; use only new reviewed forward migrations, never reset/db push/reseed.
- [ ] Before legacy removal, assert under suitable locks that ContactVerification is empty and Payment.verificationId has no non-null values. The current development read-only check found zero in both on 2026-10-24; repeat on each target.
- [ ] If any intended environment has historical rows/links or active dependencies, retain deprecated legacy fields/table and use one consistent additive migration history everywhere. Never clear links, delete data or vary SQL under the same migration name to make removal pass.
- [ ] Add empty TransactionEmail and EmailDeliveryEvent tables with one intent per (paymentId, kind), stable unique idempotency key, immutable recipient/payload, retry deadline/lease/attempts, provider message/event uniqueness and delivery timestamps; do not enqueue historical payments.
- [ ] Rehearse empty and populated legacy-data branches on disposable PostgreSQL, prove atomic guard failure, compare complete existing payment/allocation snapshots and migration checksums, update generated client/fixtures, and record rollout/locking/recovery evidence.

## Dependencies

- Depends on F02.

## Evidence and verification

- Planning review only: source runtime has no OTP/payment flow; seed integration test still counts ContactVerification. Read-only configured development counts on 2026-10-24: payments=0, linkedPayments=0, ContactVerification=0, allocations=0. No schema or data changes performed.

**Review baseline:** 2026-10-27 (Africa/Lagos). See roadmap.md for current scope and preserved historical evidence.

## References

- https://resend.com/docs/dashboard/emails/idempotency-keys

---

# E03: Build required-email checkout without OTP or verification links

Collect contact email at checkout for receipts, voting confirmations, transaction communication and support. No account, OTP, email-link step or email-delivery dependency. Preserve the selected contestant/package.

**Phase:** Checkout Email and Transactional Confirmations

**Priority:** P1

**Initial status:** Backlog

**Labels:** area:web

## Acceptance criteria

- [ ] Provide an accessible required email field with client and server error handling, whitespace trimming, domain normalization and safe length/header validation; syntax validation does not claim ownership.
- [ ] Explain transactional uses and allow correction before submission. No OTP, code resend, verify-email endpoint, verified flag or verification authorization is used.
- [ ] Preserve selection and integer-kobo summary, submit only contestantId/packageId/contactEmail with a session-bound idempotency key, and use the server-approved hosted checkout URL.
- [ ] Checkout proceeds during email-provider outage. No marketing enrollment; future marketing needs separate optional unselected consent with recorded evidence/withdrawal.
- [ ] Test valid unverified email, missing/invalid email, keyboard/mobile recovery and double submission. Keep Stage 3 #31 selection-only until checkout is implemented.

## Dependencies

- Depends on P01.
- Depends on https://github.com/ebukanathan/TalentHunt/issues/31.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 2026-10-27 (Africa/Lagos). See roadmap.md for current scope and preserved historical evidence.

---

# P01: PAY-01: Paystack test configuration and payment initialization

Approved PAY-01 first slice only: strict contestantId/packageId/email input, PostgreSQL-owned integer-kobo snapshot, PENDING payment and test checkout with permanent hashed UUIDv4 retry capability. Provider initialization is not payment confirmation.

**Phase:** Payments and Vote Allocation

**Priority:** P0

**Initial status:** Done

**Labels:** area:payments, area:api

## Acceptance criteria

- [x] Validate server-only test configuration and reject live keys; placeholders only in .env.example; missing configuration disables payment initialization without breaking public reads.
- [x] Implement POST /api/v1/payments/initialize with strict Zod contestantId/packageId/email plus random UUIDv4 Idempotency-Key; map email to immutable Payment.contactEmail without registration/OTP.
- [x] Check active same-competition contestant/package, OPEN voting window and configured competition pin; require NGN and stored integer priceKobo/voteCount; reject client financial fields.
- [x] Commit PENDING payment and additive PaymentInitialization retry state before dispatching to Paystack. Preserve all historical migrations, payment values and legacy verification objects.
- [x] Return reference/authorizationUrl only after a validated provider initialization result. Identical successful replay returns the saved result; changed payload conflicts; concurrent, timed-out or crashed attempts cannot dispatch again.
- [x] Sanitize provider errors and secret-bearing exception causes. Cache definite rejection; uncertain acceptance requires reconciliation instead of automatic takeover/new reference.
- [x] Pass unit, real HTTP/PostgreSQL integration, migration-preservation, concurrency and provider/database failure-window checks. Document setup, endpoint tests and explicit test-only limitations.
- [x] Open a feature-branch PR linked to #13; no webhooks, payment finalization, vote allocation, email delivery, receipt endpoints or live features. Keep issue open until review/merge.

## Dependencies

- Depends on F02.
- Depends on F03.
- Depends on https://github.com/ebukanathan/TalentHunt/issues/27.

## Evidence and verification

- PAY-01 validation: Prisma generation/validation, API build and test typecheck passed; 5 payment unit, 9 payment HTTP/PostgreSQL integration and 13 public API checks passed across validated runs.
- Migration rehearsal preserved full legacy payment/verification/allocation/contestant snapshots; 5 seed unit and 6 seed integration checks passed; no schema drift. No hosted migration or real provider call. PR linked in issue #13; keep In Progress until review/merge.
- Merged in PR #34 and closed; remains Done while further Paystack work is deferred by the 2026-10-27 admin-first decision.

**Review baseline:** 2026-10-27 (Africa/Lagos). See roadmap.md for current scope and preserved historical evidence.

## References

- https://paystack.com/docs/api/transaction/
- https://paystack.com/docs/payments/webhooks/
- https://paystack.com/docs/payments/verify-payments/

---

# P02: Authenticate Paystack webhooks and verify payment facts

Sequencing pause (2026-10-27): defer further Paystack work while Admin Dashboard is prioritized. Accept provider signals only after authenticity and transaction checks. A browser redirect cannot prove payment.

**Phase:** Payments and Vote Allocation

**Priority:** P0

**Initial status:** Backlog

**Labels:** area:payments, area:security

## Acceptance criteria

- [ ] Preserve raw payload before Express JSON parsing and validate x-paystack-signature with documented HMAC-SHA512 and constant-time comparison before trusting data.
- [ ] Add an empty durable PaystackWebhookJob inbox through a new migration; deduplicate authenticated event handoff and acknowledge quickly only after persistence. Storage failure returns non-2xx; email/provider work is outside the request.
- [ ] Verify supported charge.success server-side via Paystack reference; require data.status success and matching reference, exact amount/currency, expected test/live domain and non-reused provider transaction ID against the stored immutable snapshot.
- [ ] Unknown references and mismatches receive no votes; email verification/delivery or browser callback is never evidence of payment. Use the shared P03 finalizer for verified events, authorized refresh and reconciliation.
- [ ] Test invalid signatures, body tampering, duplicate/reordered events, wrong amount/currency/environment, reused provider IDs, durable-handoff failures, provider outage and retry. Exclude secrets and personal payloads from logs.

## Dependencies

- Depends on P01.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 2026-10-27 (Africa/Lagos). See roadmap.md for current scope and preserved historical evidence.

## References

- https://paystack.com/docs/api/transaction/
- https://paystack.com/docs/payments/webhooks/
- https://paystack.com/docs/payments/verify-payments/

---

# P03: Allocate paid votes exactly once under concurrent delivery

Sequencing pause (2026-10-27): defer further Paystack work while Admin Dashboard is prioritized. Finalize payments and allocate votes atomically. Existing uniqueness constraints alone do not prove safe counter updates.

**Phase:** Payments and Vote Allocation

**Priority:** P0

**Initial status:** Backlog

**Labels:** area:payments, area:database

## Acceptance criteria

- [ ] In one database transaction commit payment PAID/paidAt/providerTxnId, one immutable VoteAllocation, one atomic contestant totalVotes increment and one TransactionEmail VOTE_CONFIRMATION intent.
- [ ] Use shared idempotent finalization from verified webhook, authorized refresh and reconciliation; unique payment/provider references, allocation.paymentId, (paymentId, kind) and stable provider idempotency key prevent duplicate votes and confirmation intents.
- [ ] Match attribution and vote count to immutable snapshots. Apply/document the late-payment policy using verified provider payment time; do not grant value from redirect or email delivery.
- [ ] Never call an email provider inside the finalizer/transaction. Outbox persistence failure rolls back finalization; after commit email failure changes only delivery state and cannot roll back votes or charge again.
- [ ] Run real PostgreSQL race and failure-injection tests covering duplicate/concurrent webhook/status/reconciliation, transaction rollback, outbox insert failure and crash immediately after commit: one allocation/increment/intent or none on rollback.

## Dependencies

- Depends on P02.
- Depends on E02.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 2026-10-27 (Africa/Lagos). See roadmap.md for current scope and preserved historical evidence.

---

# P04: Build checkout return, payment status and voter receipt screens

Sequencing pause (2026-10-27): defer further Paystack work while Admin Dashboard is prioritized. Complete the voter journey using trusted server payment/allocation state.

**Phase:** Payments and Vote Allocation

**Priority:** P1

**Initial status:** Backlog

**Labels:** area:web, area:payments

## Acceptance criteria

- [ ] Support hosted checkout, bounded status polling, reload recovery and pending/paid/failed/cancelled retry states.
- [ ] Show paid only after verified payment and allocation; redirect parameters cannot grant votes.
- [ ] Protect status/receipt access using a scoped unguessable token or equivalent authorization; avoid email/payment leaks through enumerable IDs.
- [ ] Verify successful, failed, abandoned, delayed-webhook and return-before-webhook journeys in test mode.
- [ ] Render payment, allocation and email delivery as separate states. Show voting success/receipt only after verified PAID and ALLOCATED, even when email is queued, failed or bounced; never require OTP/inbox access.
- [ ] Use scoped capability authorization, no-store responses and minimal private data; email/reference alone grants no receipt access. No public arbitrary-address resend; support retries use E01 audit/deduplication.

## Dependencies

- Depends on P03.
- Depends on E03.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 2026-10-27 (Africa/Lagos). See roadmap.md for current scope and preserved historical evidence.

---

# P05: Reconcile payments and implement auditable refund/vote-reversal handling

Sequencing pause (2026-10-27): defer further Paystack work while Admin Dashboard is prioritized. Recover from missed events and define refunds/disputes before taking real money. REFUNDED status currently has no reversal ledger.

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
- [ ] Payment reconciliation and auditable reversals remain independent of email delivery. Reconciliation uses the same finalizer and must not create another confirmation intent or resend accepted/delivered confirmation.
- [ ] Apply the documented paid-at/window policy; suppress pending vote-success confirmation after refund/reversal. Transaction/refund communication is separate from marketing and must not rewrite historical contactEmail.

## Dependencies

- Depends on P03.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 2026-10-27 (Africa/Lagos). See roadmap.md for current scope and preserved historical evidence.

---

# ADMIN-01: Admin authentication and protected dashboard layout

FIRST IMPLEMENTATION TASK ONLY. Reuse existing AdminUser and AuditLog with Express-owned opaque sessions and the current Next.js frontend. One administrator for the MVP; no public registration. Approved implementation on feat/admin-01-auth-dashboard is submitted for review; do not merge or start ADMIN-02 without review.

**Phase:** Admin Dashboard

**Priority:** P0

**Initial status:** In Progress

**Labels:** area:api, area:web, area:security, area:database

## Acceptance criteria

- [ ] Provide one-time secure CLI provisioning with masked prompt/protected stdin, explicit database target, no default password or startup/demo-seed provisioning, salted versioned scrypt hashing (N=2^17,r=8,p=1) and constant-time verification. Lock/check the singleton atomically; refuse existing/multiple admins without overwrite or deletion.
- [ ] Implement strict Zod login/logout, session verification and CSRF bootstrap endpoints under /api/v1/admin/auth. Require an active AdminUser and return generic invalid-credentials errors; throttle login before hashing with shared persistent account/IP limits and bounded cooldowns.
- [ ] Store only hashed cryptographically random session tokens in a new AdminSession table, rotate at login, revoke at logout and reject inactive/expired/revoked/tampered sessions. Proposed idle timeout 30 minutes and absolute lifetime 8 hours; fail closed on storage failure.
- [ ] Use host-only HttpOnly Secure SameSite=Lax cookies (production __Host- prefix, Path=/, no Domain) with explicit loopback-only HTTP development exception and no browser localStorage tokens. Do not log or expose password/session/CSRF secrets.
- [ ] Protect login/logout and every future admin write with session-bound/signed CSRF tokens, exact Origin checks and JSON/custom-header requirements; Fetch Metadata is additional protection, not a replacement. Use short-lived signed pre-login challenge binding to prevent login CSRF.
- [ ] Use a fixed-path same-origin Next.js facade to Express; allowlist forwarded cookies/headers and preserve Set-Cookie safely. Verify every protected API resource server-side; frontend links/layout redirects are not authorization.
- [ ] Build accessible /admin/login and protected /admin layout with Overview, Contestants, Competition, Vote Packages and Payments placeholders and logout. Reject external return URLs; use uncached request-time session checks on protected pages/data access, including client-navigation cases.
- [ ] Separate public chrome into a Next.js route group so public URLs, homepage and contestant views remain intact. Do not build CRUD, uploads, payment actions or dashboard statistics in this issue.
- [ ] Reuse AdminUser/AuditLog and add only a reviewed forward migration for AdminSession and shared AdminAuthRateLimit data; preserve historical migrations and all existing business/payment rows. No hosted migration or real admin provisioning runs automatically.
- [ ] Pass tests for provisioning races/refusal, successful/failed/inactive login, throttle bypass attempts, cookie flags, session fixation/expiry/logout, CSRF/origin failures, unauthenticated/direct protected access and backend outage. Run real localhost HTTP/PostgreSQL plus Next.js login-dashboard-logout/public-regression checks, typechecks/lint/build.
- [ ] After explicit implementation approval use feat/admin-01-auth-dashboard, push a linked PR, keep this issue open until review/merge and never merge without approval. Do not start ADMIN-02 until ADMIN-01 has been reviewed.

## Dependencies

- Depends on F02.
- Depends on https://github.com/ebukanathan/TalentHunt/issues/27.

## Evidence and verification

- ADMIN-01 approved by the user; feature branch implements opaque sessions, CSRF, secure provisioning and protected dashboard placeholders.
- Local tests pass for API auth/public/payment, seed regressions and real Next/Express/PostgreSQL login/session/logout; see docs/admin/authentication.md.

**Review baseline:** 2026-10-27 (Africa/Lagos). See roadmap.md for current scope and preserved historical evidence.

---

# A02: Build admin management screens and audit trail

After ADMIN-01 through ADMIN-04, retain this existing issue for protected audit-history viewing and cross-feature management UX/regressions. Login and CRUD forms are owned by the four ADMIN issues; this follow-up does not broaden ADMIN-01.

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

- Depends on ADMIN-01.
- Depends on ADMIN-02.
- Depends on ADMIN-03.
- Depends on ADMIN-04.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 2026-10-27 (Africa/Lagos). See roadmap.md for current scope and preserved historical evidence.

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
- [ ] Expose separate payment, allocation and confirmation-delivery status to authorized support; audit retry/reconciliation actions, reuse the existing intent and require review of ambiguous sends after provider deduplication expires.

## Dependencies

- Depends on ADMIN-01.
- Depends on P05.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 2026-10-27 (Africa/Lagos). See roadmap.md for current scope and preserved historical evidence.

---

# T01: Establish security and payment-integrity regression tests

Establish an isolated integration harness and cross-feature regression suite. Feature-specific acceptance tests belong in each implementation.

**Phase:** Testing, CI/CD and Deployment

**Priority:** P0

**Initial status:** Backlog

**Labels:** area:quality, area:payments

## Acceptance criteria

- [ ] Apply migrations and deterministic fixtures to isolated PostgreSQL; tests refuse production targets.
- [ ] Cover checkout abuse, authorization, amount/membership tampering, duplicate/out-of-order events, concurrency, rollback and refunds.
- [ ] Mock provider boundaries deterministically and document a separate sandbox smoke path.
- [ ] Replace failing placeholder test scripts and prove breaking idempotency or authorization fails the relevant tests.
- [ ] Cover required unverified email and invalid/missing email, payment verification independent of delivery, atomic outbox creation, retry concurrency, crash-after-acceptance, bounce/replay and elapsed idempotency windows without duplicate confirmation submission.
- [ ] Prove migration preflight refuses populated legacy data, preserves historical migration bytes and all existing payment/allocation values, and never auto-enqueues old payments. No marketing enrollment without separate consent.

## Dependencies

- Depends on P03.
- Depends on P05.
- Depends on E01.
- Depends on E03.
- Depends on ADMIN-01.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 2026-10-27 (Africa/Lagos). See roadmap.md for current scope and preserved historical evidence.

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

**Review baseline:** 2026-10-27 (Africa/Lagos). See roadmap.md for current scope and preserved historical evidence.

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
- [ ] Configure HTTPS, origins, readiness and webhook URL; pass a complete required-email checkout/payment/allocation staging journey.
- [ ] Document deploy/rollback order and backward-compatible migrations; migration failure blocks release.
- [ ] Rehearse checkout email without verification, Paystack test payment verification/allocation, durable outbox worker and signed provider delivery events, plus email outage/recovery without losing paid votes.

## Dependencies

- Depends on T02.
- Depends on P04.
- Depends on A02.
- Depends on E01.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 2026-10-27 (Africa/Lagos). See roadmap.md for current scope and preserved historical evidence.

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
- [ ] Alert on old confirmation intents, worker/lease failures, provider bounces and REVIEW_REQUIRED sends; retain privacy-safe audit data and document provider reconciliation before retry after the dedupe deadline.

## Dependencies

- Depends on T03.
- Depends on P05.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 2026-10-27 (Africa/Lagos). See roadmap.md for current scope and preserved historical evidence.

---

# T05: Complete release rehearsal and approve paid-voting launch

Use an evidence-based go/no-go gate before real paid traffic.

**Phase:** Testing, CI/CD and Deployment

**Priority:** P0

**Initial status:** Backlog

**Labels:** area:quality, area:delivery, area:security

## Acceptance criteria

- [ ] Rehearse mobile/desktop required-email checkout, payment success/failure/abandonment, delayed events and admin operations.
- [ ] Exercise expected peak traffic, duplicate events, closing boundaries and database/provider failures; record acceptable limits.
- [ ] Review dependency/secret scans, authorization, CORS/CSRF, Supabase exposure and privacy/payment/refund disclosures.
- [ ] Verify production migration, backups, TLS, live webhook/provider settings and monitoring; complete a controlled live payment/reconciliation check with approved refund handling.
- [ ] Record owner go/no-go and rollback evidence. Unresolved critical payment/security risks block launch.
- [ ] Rehearse the no-OTP checkout journey and delayed/failed email after successful payment/allocation, verify duplicate prevention and transactional-only messaging, and review new migrations preserving historical payment records.

## Dependencies

- Depends on T01.
- Depends on T03.
- Depends on T04.
- Depends on A03.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 2026-10-27 (Africa/Lagos). See roadmap.md for current scope and preserved historical evidence.

---

# ADMIN-03: Secure contestant image upload using Supabase Storage

Upload, replace and delete contestant photographs through authorized Express operations using Supabase Storage. Public image reads are permitted; anonymous writes are not. Backlog only; not part of ADMIN-01.

**Phase:** Admin Dashboard

**Priority:** P1

**Initial status:** Backlog

**Labels:** area:api, area:web, area:security, area:delivery

## Acceptance criteria

- [ ] Keep all Storage credentials server-side, apply ADMIN-01 authentication/active-admin/CSRF guards, restrict operations to owned contestant paths and deny anonymous upload/update/delete policies. Public bucket reads may remain unauthenticated.
- [ ] Validate actual decoded image content/magic bytes, declared type and extension consistently; proposed allowlist JPEG/PNG/WebP, maximum 5 MB and bounded dimensions/pixel/resource use. Reject SVG/executables, malformed/polyglot content and oversized requests before public storage.
- [ ] Decode/re-encode approved content, strip unnecessary metadata and generate random safe object names and extensions. Never trust the supplied filename/path or fetch arbitrary image URLs.
- [ ] Store file bytes only in Supabase Storage and canonical image references in Contestant.imageUrl or an explicitly reviewed reference field; no binary/base64 files in PostgreSQL.
- [ ] Upload a new object before reference replacement; audit database changes, preserve currently referenced objects on failure and use bounded compensation/orphan cleanup. Delete only authorized obsolete objects; no unsafe cross-contestant/bucket path deletion.
- [ ] Test unauthorized direct/backend/Storage writes, wrong content/type, size/dimension limits, filename traversal, replacement/delete races, failed upload/DB update cleanup and public image retrieval. No Storage provisioning or uploads occur during ADMIN-01.

## Dependencies

- Depends on ADMIN-01.
- Depends on ADMIN-02.

## Evidence and verification

- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.

**Review baseline:** 2026-10-27 (Africa/Lagos). See roadmap.md for current scope and preserved historical evidence.

## References

- https://supabase.com/docs/guides/storage/security/access-control
- https://supabase.com/docs/guides/storage/buckets/fundamentals
