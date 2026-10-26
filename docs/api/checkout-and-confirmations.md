# Proposed checkout, payment and confirmation API

Planning specification, 24 October 2026 (Africa/Lagos), with the PAY-01 implementation update below. All other proposed routes/models remain **unimplemented**. The implemented read endpoints remain documented in [Core REST API](core-rest-api.md). Product authority: [paid voting requirements](../product/paid-voting-requirements.md).

PAY-01 update, 26 October 2026: only payment initialization is now implemented; see its [actual contract and retry policy](payment-initialization.md). It uses external `email` mapped to Payment.contactEmail and a hashed UUIDv4 retry capability. The additive PaymentInitialization table owns initialization state only. Browser-session/receipt capabilities, payment verification, webhooks, votes and transactional confirmations below remain proposals. Legacy verification cleanup and E02 outbox work are not prerequisites for this approved slice.

## Paystack integration plan

```mermaid
sequenceDiagram
    participant V as Voter
    participant A as TalentHunt API
    participant D as PostgreSQL
    participant P as Paystack
    participant W as Email worker
    participant E as Email provider
    V->>A: Contestant, package, required email
    A->>D: Persist PENDING snapshot and checkout attempt
    A->>P: Initialize server reference, amount, currency, email
    P-->>V: Hosted checkout
    P->>A: Signed charge.success webhook
    A->>D: Persist authenticated webhook job
    A-->>P: 200 after durable handoff
    A->>P: Verify reference server-side
    A->>D: Atomic PAID + allocation + increment + outbox
    V->>A: Authorized status request
    A-->>V: Voting confirmed; email queued separately
    W->>D: Claim committed confirmation intent
    W->>E: Send with stable idempotency key
    E-->>W: Provider message ID
    W->>D: Record acceptance; delivery events follow
```

1. Start with separate Paystack test credentials and an allowlisted HTTPS callback origin in staging. The backend initializes `/transaction/initialize` with `email` from the immutable contact snapshot, a server-generated unique `reference`, integer minor-unit `amount`, currency and controlled callback URL. Never accept client price/vote quantity as authority or expose secret keys.
2. Persist the local payment before calling Paystack. Bind a checkout idempotency key to a browser-scoped anonymous session and a hash of the normalized request. Repeated identical submissions reuse one local payment/reference; key reuse with different input returns conflict. Claim the attempt durably so concurrent requests do not initialize separately.
3. Persist Paystack authorization data on a separate checkout attempt. An initialization timeout is ambiguous: keep the same reference and reconcile it with Paystack before a repeat provider request. Do not automatically create a new reference or assume Paystack has a generic initialization idempotency-key contract. If a new attempt is explicitly needed, show the previous attempt’s unresolved state and apply P05 recovery policy.
4. Route Paystack webhooks through raw-body parsing before global JSON parsing. Verify `x-paystack-signature` using HMAC-SHA512 and constant-time comparison before trusting payloads. Persist an authenticated, deduplicated inbox job, then acknowledge quickly. If persistence fails, return non-2xx so Paystack retries. Do not call email services in webhook handling.
5. A payment worker verifies `/transaction/verify/:reference` using a backend key. Require transaction `data.status === "success"`, expected reference, exact amount/currency, expected test/live domain and a non-reused provider transaction ID. The top-level API success flag alone is insufficient. Resolve the stored payment; never accept contestant/package attribution from webhook metadata. Email ownership/delivery has no role in these checks.
6. Invoke the shared finalizer from verified webhook processing, an authorized return/status refresh or reconciliation. Verify outside the database transaction; apply locking/conditional transition and uniqueness inside it. Commit PAID/paidAt/providerTxnId, one `VoteAllocation`, one atomic total increment and one confirmation intent together. Replays return the existing result without another email intent. Suppress new vote-success sends for a subsequently refunded/reversed payment pending its separate communication policy.
7. Run confirmation delivery after commit, independently. Recover missed/non-success payment events through bounded reconciliation; callbacks alone are not reliable payment evidence. Payment states and email states are never coupled.

## Proposed public contracts

Use existing JSON envelopes and sanitized errors. These public endpoints allow anonymous checkout with scoped browser capability authorization; no account or email ownership verification is required. Enforce server-side validation, origin/session protections and rate limits. Reject unknown body fields so verification tokens, client prices or success flags cannot silently become inputs.

| Request | Contract and behavior |
| --- | --- |
| `POST /api/v1/payments/initialize` | Require browser-session-bound `Idempotency-Key`; JSON `{ "contestantId": "...", "packageId": "...", "contactEmail": "voter@example.com" }`. No OTP, verification ID, verified flag, verification link or email authorization token. Server derives competition and all financial facts, validates eligibility and snapshots contact email. First initialization returns 201 with reference, hosted `authorizationUrl` and a safe payment summary; repeat returns 200 with the same result; unresolved initialization returns 202 pending. Issue a scoped, expiring receipt capability in a Secure/HttpOnly cookie through the web origin/BFF; no contact/capability values in URLs or analytics. |
| `GET /api/v1/payments/:reference/status` | Require the scoped capability; reference/email alone is insufficient. Return `{ reference, paymentStatus, allocationStatus, amountKobo, currency, voteCount, emailDeliveryStatus }` using snapshots, with no raw contact address or provider secrets. A bounded server refresh may verify provider facts through the shared finalizer. Set `Cache-Control: private, no-store`; no vote grant from redirect parameters. |
| `GET /api/v1/payments/:reference/receipt` | Same capability requirement. Return a minimal receipt only when payment and allocation are committed; return 202 while pending. Email may still be queued/failed. Do not require inbox access to view it. |
| `POST /api/v1/webhooks/paystack` | Paystack signature authentication, raw bytes, durable inbox, deduplicated processing and 200 only after durable handoff. Invalid signature 401; malformed input 400; storage outage 503. Unsupported valid events acknowledge without granting votes. |
| `POST /api/v1/webhooks/email` | Verify the selected provider’s documented signature/replay controls; deduplicate event IDs and correlate provider message ID to outbox. Update delivery telemetry only. No payment or vote mutations. |

Return 400 `VALIDATION_ERROR` for missing/invalid email; 404 for unavailable selections; 409 for voting eligibility/key-payload conflict; 429 for rate limits; 502/503 for provider/service failure. Use the same unavailable response for unknown/unauthorized receipt references to reduce enumeration. A failed or unresolved initialization never reports payment success. Define exact status-transition mapping and expiry/recovery behavior in P01/P04 implementation.

Proposed DTO states: `paymentStatus` mirrors PENDING/PAID/FAILED/REFUNDED; `allocationStatus` is PENDING/ALLOCATED/REVIEW_REQUIRED (refund/reversal detail belongs to P05); email is NOT_QUEUED/PENDING/RETRYING/ACCEPTED/DELIVERED/FAILED/REVIEW_REQUIRED. Success means PAID and ALLOCATED. Provider delivery does not turn an otherwise pending payment successful. User cancellation means abandoned checkout until provider reconciliation establishes final payment facts.

Do not introduce voter `/email/send-code`, `/email/verify`, `/verification/*` or email-verification-link endpoints. No public confirmation-resend endpoint in this version; support retries require admin authorization and an audit record.

## Proposed Prisma changes

This is a design, not a replacement `schema.prisma` or an executable migration. Keep every existing `Payment` business field and `VoteAllocation` constraint. Proposed relations are additive; existing payments get no generated confirmation rows.

| Model / field | Proposal |
| --- | --- |
| `Payment.contactEmail String` | Retain required, immutable contact snapshot. No default, uniqueness, ownership flag or backfill. |
| `ContactVerification` | Candidate for removal, including id/email/codeHash/expiresAt/verifiedAt/consumedAt/attempts/createdAt. Retain if populated or still used. |
| `Payment.verificationId`, `Payment.verification` | Candidate for removal with their unique index and FK only after empty-data/dependency checks. Never clear historical links. |
| `Payment.confirmations`, `Payment.checkoutAttempts` | Add inverse relations to new tables; no row rewrite/backfill. |
| `TransactionEmail` | `id`, required `paymentId` relation (Restrict deletion), `kind`, unique `idempotencyKey`, immutable `recipient`, `templateVersion` and rendered/payload snapshot, `status`, `attempts`, `nextAttemptAt`, `firstAttemptAt`, `retryDeadlineAt`, `leaseOwner`, `leaseExpiresAt`, nullable `providerMessageId` (unique), `acceptedAt`, `deliveredAt`, sanitized `lastErrorCode`, created/updated times. Unique `(paymentId, kind)` and worker index `(status, nextAttemptAt)`. |
| `TransactionEmailStatus` | PENDING, SENDING, RETRYING, ACCEPTED, DELIVERED, FAILED, REVIEW_REQUIRED. Bounces/complaints stop retry; preserve provider event evidence. |
| `EmailDeliveryEvent` | Unique provider event ID, required outbox relation, provider message ID, event type, provider timestamp, processed timestamp and minimal sanitized diagnostic data. Deduplicate/reconcile delayed or reordered events. Restrict direct contact access; apply retention policy. |
| Future checkout session/capability extension | PAY-01 already implements the smaller PaymentInitialization table for hashed retry capability, fingerprint, state and checkout URL. Browser/session binding and hashed expiring receipt authorization belong to later frontend/receipt work; no automatic initialization lease takeover is implemented. |
| `PaystackWebhookJob` | Unique dedupe key, reference/type, minimal authenticated event facts, status/lease/attempts/nextAttemptAt and timestamps. P02 adds this empty inbox table in its own forward migration. No contact/payment card payload in general logs. |

E02’s future migration owns the legacy preflight/removal decision and the empty confirmation/event tables. PAY-01 adds only PaymentInitialization; later receipt/session extensions and P02 webhook inbox use separately reviewed additive migrations. If future runtime finalizers update payments, that is new transaction processing; PAY-01's migration never updates existing payment records.

## Migration procedure proposed for E02

1. Inventory generated Prisma clients, seed/API fixtures, services, deployed versions, external reports/jobs and database dependencies. Source search currently finds legacy verification use only in schema/history and the seed integration count; do not assume that covers every deployed consumer.
2. Before each environment’s migration, inspect aggregate counts for `ContactVerification`, non-null `Payment.verificationId`, payments and allocations; record the target/environment without exposing contacts or credentials. The current development target’s counts are recorded in the requirements review once checked; they never authorize dropping data elsewhere.
3. Rehearse on disposable PostgreSQL with both empty and populated legacy tables. Choose one consistent forward migration history for all intended environments before deployment: if any target needs the legacy history, retain it everywhere and use an additive-only migration. Never create different SQL under the same migration name or conditionally produce incompatible schemas. For a globally proven-empty removal, assert emptiness under locks that block concurrent legacy writes before any DROP. Retain the legacy Prisma model/fields whenever the table/column are retained.
4. For a proven-empty target: add the new tables, remove `Payment_verificationId_fkey`, remove `Payment_verificationId_key`, drop only the unused column and empty legacy table. Leave all other Payment columns/values and all allocation rows unchanged. Preserve the historical migration folder/file bytes. Never reset, truncate, reseed or use `db push` to bypass review.
5. Regenerate Prisma and adjust fixtures/tests with the new migration. Compare complete pre-existing payment/allocation snapshots and migration checksums; test guard failure atomically leaves the database unchanged. Test new uniqueness/FK constraints and old/new app compatibility. Stop old legacy writers before a removal rollout. Apply only a reviewed new migration to the explicitly selected environment after the proposal is reviewed.

## Confirmation failure boundaries

Outbox insertion is an atomic durable obligation within finalization; provider availability is outside it. Outbox persistence failure rolls the finalization transaction back for retry, rather than silently losing a confirmation. After successful commit, a send failure changes only delivery metadata. Do not send inside a transaction or grant/roll back votes based on provider callbacks.

Deduplication requires both the permanent database unique intent and the provider key. Reuse an immutable payload. Persist the first-attempt time before network I/O and a conservative retry deadline within the provider’s 24-hour retention. Exhausted/ambiguous attempts go to REVIEW_REQUIRED, never a new logical confirmation. A signed provider delivery event may arrive before the worker records its acknowledgement; reconcile it without resending. Test crash windows, two workers, stale leases, unknown outcomes, already accepted rows, long outages, bounced recipients and replays. See the [delivery requirements](../product/paid-voting-requirements.md#confirmation-delivery) for the recovery policy.

## Sources

- [Paystack transaction initialization and verification API](https://paystack.com/docs/api/transaction/)
- [Paystack webhook signatures, acknowledgement and retries](https://paystack.com/docs/payments/webhooks/)
- [Paystack server-side verification and duplicate fulfillment guidance](https://paystack.com/docs/payments/verify-payments/)
- [Resend idempotency keys and 24-hour retention](https://resend.com/docs/dashboard/emails/idempotency-keys)
