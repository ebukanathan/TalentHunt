# Paid voting integration repair — TEST MODE ONLY

Repair branch: fix/test-paid-voting-e2e, based on the existing P02 branch b8b2f33 (PR #77, still unmerged). The user's approved scope connects the existing checkout, verification and allocator, adds private confirmation feedback and runs the correct code locally. It does not authorize merging, hosted migrations or live payments. Root worktree edits and legacy financial data are preserved.

## Diagnosed breakpoints

The IDE root remained on feat/admin-05-dashboard-overview. Actual listeners on localhost:3000/4000 were children of the old .worktrees/voting-engine launch, at a9d9ebb. The helper explicitly blanked Paystack configuration. A previous health-only start check did not detect this version mismatch.

Observed requests: profile and package page returned 200; selecting a radio produced no email field, submit button or initialization request. GET /api/checkout/session returned 404, POST /api/v1/payments/initialize returned 503/PAYMENTS_NOT_CONFIGURED using nonexistent diagnostic IDs, and POST /api/v1/webhooks/paystack returned 404. The relevant LIVE subcategory board returned SETUP_REQUIRED, not rankings. Source configuration had no test key, callback, signing keys, checkout origin or session secret; its database was hosted. No diagnostic financial record was created.

Newer E03/P02 code already supplied required-email checkout, server prices, validated hosted URLs, signatures and independent verification, but verification deliberately stopped at AWAITING_FINALIZATION. There was no paid-state/evidence/allocation/outbox finalizer, private payment return/status page, or receipt email sender. The existing allocator and scoped leaderboard logic were reusable.

## Connected flow and trust boundary

Profile → package selection → required email → same-origin checkout facade → existing initialization API → server-approved hosted URL → return page or signed webhook → independent server verification → atomic finalization → scoped leaderboard.

PaymentFinalizationService accepts only a stored reference and fetches Paystack facts itself. It never accepts browser-supplied amounts, votes or success flags. Existing verification checks test environment, successful status, exact reference/amount/currency, unsigned 64-bit provider identity and timestamps. Finalization locks competition then payment, reloads immutable scope, validates current state and calls the extracted **existing allocator transaction core**. No second allocation algorithm is introduced.

One Prisma transaction commits PAID/paidAt/provider ID, VerifiedPayment, VoteAllocation, contestant increment, allocation audit and one immutable VOTE_CONFIRMATION outbox intent. Any allocation, counter, audit or outbox failure rolls all changes back. Database uniqueness and locked replays prevent double grants and duplicate confirmation intents. Only confirmed rollback/deadlock errors are retried; unknown commit outcomes propagate and the same purchase can be checked again. Historical PAID/allocation rows without the expected trusted evidence/intent are quarantined rather than backfilled. Refunded/failed/mismatched/ineligible purchases receive no new grant.

The allocator retains its existing closure policy: both processing time and verified paidAt must be inside the explicit window, with active matching ancestry/package, reviewed category setup and integrity readiness. Replaying a committed allocation is safe after closure. LIVE/RANK_ONLY/HIDDEN projections and subcategory ranking remain unchanged. Test fixtures explicitly confirm their own test taxonomy; the repair never marks the hosted competition ready automatically.

The webhook worker reclaims AWAITING_FINALIZATION through the same lease mechanism, independently re-verifies, calls the same finalizer and marks the job FINALIZED. Crashing after commit but before that marker is harmless on retry. Retry attempts are bounded across verification and handoff; exhausted jobs need review. The inbox upsert now handles a concurrent unique-key loser by confirming the durable winner before acknowledgment. Storage failures still return non-success for provider retry.

## Private return/status and receipt

PAYSTACK_CALLBACK_URL is http://localhost:3000/payments/return for the local test runtime. The provider's reference/trxref query is untrusted and never grants votes by itself. The original tab stores the reference with its existing frozen checkout attempt. The page requires the signed HttpOnly session, CSRF and binding tokens and posts the attempt to /api/checkout/status. The web server privately derives the existing session-bound retry capability; the backend authorizes the exact reference against its permanent hash before verification.

POST /api/v1/payments/:reference/status requires that private capability and an empty strict JSON body. A guessed reference, different session/key or changed reference cannot read another receipt or call its verifier. Responses are private/no-store and omit contact addresses and global contestant totals. A committed receipt can be read again without another provider call. Expired-session failure clears displayed receipt data. No email ownership, OTP or verification link is required.

The confirmation shows own reference, amount, allocated package votes and a link to the exact subcategory board. It reports pending/review separately from confirmed. There is **no receipt-email sender** in the existing code or this repair. A durable PENDING intent records the obligation; the test page explicitly says email sending is not enabled. No claim of delivery is made. Delivery-worker/provider work remains #6; no network send is attempted within a database transaction.

## Schema and deployment boundary

One new forward migration adds the empty TransactionEmail table/status enum and the FINALIZED webhook status. Intent identity, recipient, payload and key are immutable; (paymentId, kind) and the idempotency key are unique. Public/Supabase browser-role access is revoked on the new table. There is no historical enqueue, contact-link removal, record rewrite, reset, db push or destructive migration edit. Populated migration fixtures and historical checksums are checked in the regression gate.

PAYSTACK_FINALIZATION_ENABLED defaults false. Enabling it requires valid test credentials and an explicitly named loopback test database; remote, production-named and connection-override URLs fail startup. Live credentials remain rejected. Default application behavior remains off until explicitly configured; the dedicated local test launcher deliberately enables the test checkout UI and explains missing credentials instead of silently showing selection-only controls.

## Start the correct local app

From .worktrees/paid-voting-e2e, install/generate/build as normal, then run `npm run dev:paid-voting`. Ports 3000 and 4000 must be free; stop only the known TalentHunt processes. The script refuses occupied ports and never kills arbitrary processes.

The launcher creates or reuses an owned loopback PostgreSQL cluster/database named talenthunt_paid_demo_*, applies forward migrations there, and creates a reviewed **test-only** competition with two independent subcategories and 10/50/100 vote packages. It does not create payments or votes. Existing test purchases persist across restarts; their database is never reset. The command remains running to supervise its child development servers; keep that development session open. Web artifacts use a separate .next-paid-local directory. All inherited database/provider/admin settings are discarded. Only .env.paystack-test.local supplies optional test credentials; .env.admin-credentials is never read. Secrets/session capabilities stay in ignored local files or backend process environment, and output includes only safe URLs/PIDs/configuration state.

| Local credential file setting | Purpose |
| --- | --- |
| PAYSTACK_SECRET_KEY | Actual sk_test_ backend key; configure locally, never in chat or a commit |
| PAYSTACK_CALLBACK_URL | Optional fixed callback; defaults to the local /payments/return URL |
| PAYSTACK_WEBHOOK_SIGNING_KEYS | Optional JSON array of test whk_/whsec_ signing pairs; enables the real worker |

Without a test key, the current UI runs with package/email controls but initialization returns an explicit setup error and creates no purchase. A real Paystack transaction cannot be demonstrated until the key is configured. For genuine provider webhook delivery, register a reachable HTTPS test URL pointing to /api/v1/webhooks/paystack; no tunnel/dashboard setting is provisioned automatically. Return/status verification can independently confirm a genuine test payment from the original browser session. No live mode exists in this runtime.

Local URLs: http://localhost:3000/contestants/test-performer/vote, http://localhost:3000/payments/return?reference=YOUR_TEST_REFERENCE, http://localhost:3000/leaderboard?categoryId=test-music&subcategoryId=test-solo and http://localhost:4000/api/v1/health. These refer to the isolated test competition, preserving the old hosted records.

## Verification evidence

`npm run qa:local -- -Phase finalization` tests atomicity, concurrent processing, state/eligibility rejection, owner authorization, privacy/scoping and webhook commit recovery. `-Phase paid-browser` drives a real production Next server, Express and PostgreSQL through a clearly labelled **simulated** hosted gateway and an HTTP provider verifier. It checks pending provider responses grant nothing, confirmed payment adds exactly ten votes, duplicate refresh adds none, and only the selected subcategory changes. Both desktop and mobile are exercised. This integration test is not represented as an actual Paystack transaction. The full `-Phase all` gate includes both alongside the existing regressions. See [execution report](../qa/paid-voting-repair.md).
