# Paid voting and transactional email requirements

Decision confirmed 24 October 2026 (Africa/Lagos). This document supersedes the original voter email-verification requirements. Requirements are approved; the schema and integration designs below are proposals for review before implementation.

PAY-01 update, 26 October 2026: the approved first implementation slice is [test checkout initialization](../api/payment-initialization.md), including its additive retry-state table. The broader confirmation, cleanup and payment-finalization designs below remain future work. Existing payment records and historical migrations are preserved.

## Product decision

Every checkout requires an email address. Voters do not need an account, email OTP, verification link, verified-email flag or email-based checkout authorization. Paystack/bank authentication during payment is a separate provider responsibility and is unaffected by this decision.

Use the address for payment receipts, successful voting confirmations, transaction-related communication and customer support. Keep `Payment.contactEmail` required and immutable for each payment. Collect only necessary personal data and restrict contact access to authorized support staff. An address is contact information, not proof of identity or receipt ownership.

No marketing emails are authorized by checkout. Do not add checkout addresses to marketing lists. Any future marketing feature needs a separate, optional, unselected consent control and auditable consent/withdrawal records; declining marketing cannot block voting. This change adds no marketing subsystem.

## Voting journey

1. Browse the competition and choose an active contestant.
2. Select an active vote package belonging to that competition. Show vote count, currency and the full price in integer minor units.
3. Enter the required email address at checkout. Show: “We’ll use your email for your receipt, voting confirmation and transaction support.” Validate on client and server, trim surrounding whitespace, reject invalid/oversized input and header control characters, and normalize the domain without rewriting the local part. Let the voter correct it before submitting; never claim ownership verification.
4. The server rechecks voting eligibility, contestant/package membership and voting dates, snapshots the price, votes and contact email, and initializes hosted Paystack checkout. Do not call the email provider here.
5. Return to a pending status screen. A redirect, browser callback, client assertion or delivered email never proves payment.
6. The server verifies Paystack facts and atomically records paid status, allocates votes once, increments the contestant total and creates one confirmation outbox record.
7. Show successful voting only after that transaction commits. The receipt page works immediately even if confirmation email is queued, delayed, bounced or permanently failed.
8. A background worker sends one combined payment receipt and voting confirmation. Support can inspect delivery and retry safely without changing payment or votes.

Preserve the selection and accessible inline errors throughout checkout. Offer recovery for abandoned/failed payment and delayed webhook processing. Display payment, allocation and email-delivery states separately. Email delivery must never gate checkout, determine payment status, grant votes, roll back paid votes or trigger a second charge.

## Payment integrity

Use backend-only Paystack secrets and server-owned amount/currency/vote snapshots. Check provider transaction success, reference, amount, currency, provider transaction ID and test/live environment. Unknown or mismatched references receive no votes. Do not use customer email matching as a payment-verification mechanism.

Webhooks, authorized status refresh and reconciliation use the same idempotent finalizer. Enforce one allocation per payment and one use of a provider transaction ID; concurrent attempts produce one counter increment. A failed database transaction creates neither votes nor a confirmation intent. A committed transaction remains successful when the email provider is unavailable.

Proposed closing rule: accept a payment initiated during the valid voting window whose verified provider payment timestamp falls within that window, even if notification arrives later. Late actual payments go to reconciliation/refund review and receive no automatic vote-success confirmation. Finalize this policy with P05 before launch.

## Confirmation delivery

Proposed provider: Resend, behind a small adapter with a deterministic development fake. Use a verified sending domain, SPF/DKIM, an appropriate DMARC policy, separate environment credentials, authenticated delivery webhooks, rate limits and monitored delivery failures. Provider account/domain setup and any paid service activation are future implementation work.

The combined receipt contains the payment reference, amount/currency, competition, contestant, purchased vote count, confirmed payment time and support contact. Escape user-controlled content. Freeze recipient and template payload per logical confirmation. Exclude card/bank credentials, internal secrets and bearer receipt tokens from email. Paystack may send its own provider receipt; that is distinct from TalentHunt’s one voting confirmation and does not prove vote allocation.

Store one durable outbox intent per `(paymentId, kind)`, where kind is `VOTE_CONFIRMATION`. Keep a stable idempotency key such as `vote-confirmation/<paymentId>` across every attempt and template deployment. A database unique constraint prevents repeated finalizer calls from creating another intent.

Workers claim due rows atomically using a renewable lease and compare-and-set ownership; do not hold a database transaction across a provider HTTP request. Retry rate limits and transient failures with bounded exponential backoff and jitter, respecting `Retry-After`. Record attempt time, provider message ID, sanitized error code and next attempt. Mark accepted only after provider acknowledgement; provider acceptance and delivery are separate states. Signed, deduplicated delivery webhooks update delivery status without regressing terminal states. Hard bounces/complaints stop automatic resends and are available to support.

Resend retains idempotency keys for 24 hours. Set a conservative automatic retry deadline, such as 23 hours from the first provider attempt, and reuse the exact request body. A crash/timeout after provider acceptance may leave the result unknown: retry the same key only inside that deadline. Once the deduplication window could have elapsed, move uncertain sends to `REVIEW_REQUIRED`; reconcile provider message/event evidence before any resend. Never blindly create a fresh key or resend an accepted/delivered confirmation. If non-acceptance cannot be established, keep it for review. This design avoids duplicate submissions; it does not promise universal exactly-once inbox delivery.

No public “send receipt to arbitrary address” endpoint is planned. Any support action is authenticated, rate-limited and audited, uses the existing outbox intent, and cannot modify historical `Payment.contactEmail`. Address corrections or a separately requested replacement receipt need a future explicit support policy, not an automatic retry workaround.

## Proposed database model and migration safety

The executable schema is unchanged during this planning task. See [API and schema proposal](../api/checkout-and-confirmations.md) for proposed fields and contracts.

- Keep `Payment.contactEmail`, payment snapshots, original allocations and uniqueness constraints.
- `ContactVerification`, `Payment.verificationId`, its relation, unique index and foreign key are obsolete for the new checkout. Source review found no implemented OTP/payment runtime path; `prisma/seed.integration.test.ts` still counts `ContactVerification` and must change with any future removal.
- Remove legacy objects only through a new, reviewed Prisma migration after a per-environment dependency/data preflight. Do not alter or delete `20261021044148_init` or any other historical migration.
- Removal is safe only if the verification table is empty and no payment has a non-null verification link, and no deployed client, external reader or pending job depends on them. Assert these conditions in the migration under appropriate locks so a concurrent writer cannot invalidate the check.
- If any historical verification rows or populated links exist, retain the legacy table/columns and deprecate their use. Use an additive outbox migration. Do not null payment links, rewrite emails, backfill payment statuses, delete verification history or modify existing payment records to make removal pass. A later archival/removal policy requires separate review.
- Add new empty outbox/checkout-support tables; do not auto-enqueue historical payments. Rehearse both empty and populated legacy-data branches on disposable databases; compare all pre-existing payment and allocation values before/after. Review lock duration, privileges and rollout compatibility. Recover forward without editing migration history.

Read-only aggregate check on the configured development target, 24 October 2026: **0 payments, 0 non-null verification links, 0 ContactVerification records, 0 allocations**. No records were changed. Removal is feasible for this observed target after dependency/rollout checks; this is not evidence about any other environment or a migration approval.

## Delivery sequence and review boundary

Repurpose the original issues rather than mark unimplemented OTP work complete:

| Issue | Updated scope | Dependency |
| --- | --- | --- |
| [E02 #7](https://github.com/ebukanathan/TalentHunt/issues/7) | Review-safe schema transition and durable confirmation/checkout data model | F02; review of this proposal |
| [P01 #13](https://github.com/ebukanathan/TalentHunt/issues/13) | Required-email checkout and idempotent Paystack initialization | E02, C02, F05 |
| [P02 #14](https://github.com/ebukanathan/TalentHunt/issues/14) | Signed webhook intake and independent payment verification | P01 |
| [P03 #15](https://github.com/ebukanathan/TalentHunt/issues/15) | Atomic payment/votes/outbox finalization | P02, E02 |
| [E01 #6](https://github.com/ebukanathan/TalentHunt/issues/6) | Retriable transactional confirmation worker/provider integration | E02, P03, F05 |
| [E03 #12](https://github.com/ebukanathan/TalentHunt/issues/12) | Required-email checkout form with no verification step | Stage 3 selection #31, P01 |
| [P04 #16](https://github.com/ebukanathan/TalentHunt/issues/16) | Protected status/receipt screens independent of delivery | P03, E03 |

The next proposed development issue for this change is **E02 #7**. Review the integration and migration proposal before implementing it. Existing public-UI work #29 remains In Progress; the solo WIP limit remains one. Planning updates do not complete these implementation issues, create/apply migrations, change application routes, modify existing payment records, provision providers or send emails.

## Acceptance evidence required before launch

- Checkout with an unverified but syntactically valid email reaches Paystack; missing/invalid email fails validation. No voter OTP or verification-link path exists.
- Missing/stale selection, tampered amounts, closed windows and cross-competition data cannot initialize a valid payment.
- Forged callbacks, invalid webhook signatures, wrong amount/currency/environment and reused transaction IDs cannot allocate votes.
- Concurrent webhook/status/reconciliation delivery and forced transaction failures produce one allocation, one increment and one outbox intent, or none on rollback.
- Email outage, retries, worker crashes before/after acceptance, lease expiry, duplicate provider events, bounced recipients and an elapsed provider idempotency window cannot duplicate the confirmation or affect paid votes.
- Receipt access requires a scoped unguessable capability; knowledge of an email or payment reference alone grants no private data access.
- New migrations preserve historical migration checksums and every existing payment/allocation value. Populated legacy verification data blocks removal safely.
- Staging completes hosted test checkout, webhook verification, allocation, receipt rendering, confirmation delivery and delivery-failure recovery; checkout produces no marketing enrollment.

## Provider references

Design checked 24 October 2026 against [Paystack transaction API](https://paystack.com/docs/api/transaction/), [webhooks](https://paystack.com/docs/payments/webhooks/), [payment verification](https://paystack.com/docs/payments/verify-payments/) and [Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys). Provider details must be checked again during implementation.
