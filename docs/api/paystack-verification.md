# P02: test-mode verification and authenticated webhook inbox

Implements the independently reviewable verification/intake portion of [#14](https://github.com/ebukanathan/TalentHunt/issues/14), from main `3b97f8f` after checkout PR #76. Explicit user approval covers this test-only slice. The issue's finalizer handoff remains dependent on #15 and the #7 confirmation outbox. This PR does not complete paid-voting fulfillment or close #14's remaining integration criterion.

## Existing functionality and boundary

PAY-01 initialization and E03 checkout are reused unchanged. The existing internal voting engine consumes immutable VerifiedPayment evidence and owns its allocation transaction. Its database trigger requires matching PAID facts before inserting evidence. Consequently P02 cannot safely persist PAID/evidence separately and call that allocator afterward: a failure could strand a paid purchase without votes or a confirmation intent.

P02 therefore records successfully matched provider facts as **AWAITING_FINALIZATION** in the inbox. Payment remains unchanged; no VerifiedPayment, VoteAllocation, contestant increment or email intent is created. These inbox facts are not allocation authority. #15 must independently revalidate provider/current purchase state and atomically commit paid facts, evidence, allocation, increment, audit and outbox. It must reuse a transaction-aware core of the existing engine rather than duplicate allocation logic. Browser refresh/status authorization belongs to #16; there is no public verification or worker-control endpoint here.

## Backend configuration

Everything is disabled by default. Existing Paystack settings still require test mode and sk_test_ credentials. The signing-secret prefix alone does not identify its environment: configure only secrets from the **test** dashboard. The verifier additionally requires the provider response domain to equal test.

| Variable | Purpose |
| --- | --- |
| PAYSTACK_WEBHOOKS_ENABLED | Literal true enables intake and permits the standalone test worker; absent/false disables |
| PAYSTACK_WEBHOOK_SIGNING_KEYS | JSON array of at most four `{id: "whk_...", secret: "whsec_..."}` test signing keys; IDs/secrets must be distinct |
| PAYSTACK_ALLOW_LEGACY_SIGNATURE | Default false; explicit temporary opt-in for legacy headers only when the new header is absent |
| PAYSTACK_WEBHOOK_MAX_ATTEMPTS | Integer 1–20, default 8 |

No setting uses NEXT_PUBLIC_. Configuration failures omit input values. No local/shared environment file, dashboard webhook URL or hosted database was configured by this implementation. Test keys do not authorize writing test transactions into production.

## Raw HTTP intake

`POST /api/v1/webhooks/paystack` is registered before global express.json, using a bounded 100 KiB raw parser with decompression disabled. It requires application/json and authenticates the original bytes before parsing. Disabled intake returns 503. Invalid signatures return 401; authenticated malformed events return 400; oversized/encoded requests return 413/415.

The current [Paystack signature protocol](https://paystack.com/docs/v2/developer-tools/integration/webhooks) supplies `Paystack-Signature: t=<unix>,v1=whk_id:<128 lowercase hex characters>`. HMAC-SHA512 covers timestamp, a dot and the exact raw bytes, keyed by the entire whsec_ secret. The implementation requires one timestamp within ±300 seconds, supports multiple rotating v1 signatures/key IDs, ignores unknown future fields and uses constant-time comparison for valid-length digests. A present but malformed/invalid new header always fails; it cannot downgrade to legacy authentication. Explicitly enabled legacy X-Paystack-Signature authenticates raw bytes using the test API secret and lacks timestamp replay protection.

Authenticated charge.success is deduplicated permanently by TEST/event/reference, so payload reformatting and newly signed redelivery cannot create another logical job. Unsupported authenticated events are durably marked IGNORED with a body-digest dedupe key; refunds never grant/reverse votes here. The inbox retains only event/reference, digest, signing key ID/version and processing metadata. Raw payload, customer/contact data, card authorization, signature values and secrets are not retained or logged.

The handler returns 200 only after successful durable insertion or an existing duplicate is confirmed. A database failure returns 503, permitting provider retry. Verification HTTP calls, email and fulfillment never run inside the request. Unknown purchase references are quarantined by the worker without provider calls; no anonymous reference-query endpoint is exposed.

## Independent server verification

The client calls only the fixed HTTPS Paystack transaction-verification path, using backend test authorization, disabled redirects, a configured timeout and a 64 KiB response limit. It requires the transaction's data.status to be success, rather than relying on HTTP/API success. See [verification guidance](https://paystack.com/docs/payments/verify-payments/).

Provider reference, integer amount, currency, test domain, transaction identity and paid timestamp must match the stored purchase. Amounts/votes never come from webhook metadata or browser callbacks. Category/subcategory/contestant/package attribution comes exclusively from the immutable PaymentScope; unscoped legacy purchases require review. Failed/refunded local purchases, mismatches and reused provider IDs do not advance. The client accepts exact unsigned 64-bit transaction IDs as decimal strings. On Node 24, the JSON reviver's original token source preserves numeric ID digits before floating-point rounding; decimal/exponential/negative or out-of-range IDs fail closed. [Paystack documents unsigned 64-bit transaction IDs](https://paystack.com/docs/api/transaction/).

Matching facts are persisted without contact/card data. A unique inbox providerTxnId plus checks against Payment and VerifiedPayment prevent attribution of the same provider transaction to another purchase. Facts and authenticated routing fields are immutable at the database layer. Inbox records are not deleted/truncated automatically; a future reviewed retention policy is required.

## Worker and recovery

Run `npm run worker:paystack:test --workspace apps/api` only with explicitly configured test credentials and an isolated development database. The HTTP API never starts this worker automatically. It claims due work with a short FOR UPDATE SKIP LOCKED transaction, commits a random lease token and releases locks before network I/O. A 60-second lease permits crash recovery. Completion/retry writes require the current exact token and an unexpired lease; stale workers cannot overwrite newer results.

Lease/due comparisons explicitly convert parameters to UTC timestamps, matching Prisma DateTime storage regardless of the PostgreSQL session timezone. No connection or transaction spans provider HTTP. Transient failures use bounded exponential backoff/jitter and bounded numeric Retry-After. Exhausted or non-retryable outcomes become REVIEW_REQUIRED. Failure codes are an internal allowlist; provider exception messages/bodies are discarded. A database failure retains the lease for recovery instead of inventing an outcome. Unknown commit outcomes are retried through the same permanent job and uniqueness constraints. Re-verifying a provider GET after lease expiry is safe; exactly-once verification HTTP is not promised.

The current engine still requires voting open both at allocation processing time and verified paidAt. P02 only verifies facts; it does not change that policy or turn a late settlement into votes. Late-payment, first allocation after closure, refund/reversal, worker monitoring, shared request abuse limits and live-mode activation remain future reviewed gates.

## Schema and tests

The new forward migration adds one empty inbox table, its status enum, indexes, integrity triggers and public-role privilege revocations. No old migration/checksum, Payment, ContactVerification, allocation, scope, counter or initialization record is rewritten or backfilled. The migration rehearsal includes populated legacy contact links, multiple payment statuses, original allocation/counter history and initialization state, checks complete snapshots/checksums, injects a DDL failure to prove atomic rollback, and verifies denial under Supabase-style default grants.

`npm run qa:local -- -Phase paystack` creates a dedicated temporary PostgreSQL cluster and runs the new Vitest cases. The full existing `-Phase all` gate includes them automatically. Fixtures use fresh owned databases and simulated provider transports only, with external HTTP blocked. There are no production test endpoints or fake production financial records. See [execution report](../qa/paystack-verification.md) for executed results and remaining findings.
