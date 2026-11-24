# E03: required-email test checkout

Implements [#12](https://github.com/ebukanathan/TalentHunt/issues/12), following explicit approval to resume Paystack work **in test mode only**. Checkout remains disabled by default. No live credentials, hosted database changes or migrations are included.

## Audit and scope

Baseline: main `c8d7296`, including voting-engine PR #74 and the merged PostgreSQL/Vitest suite PR #75. Repository instructions, Prisma history, category/subcategory scope, leaderboard, payment services, tests and GitHub payment issues were inspected before coding. The approved implementation starts with the earliest incomplete checkout issue in the requested sequence.

| Component | Existing functionality | This issue |
| --- | --- | --- |
| PAY-01 #13 | Test-only server initialization, strict email DTO, stored package prices/votes, unique hashed retry key, durable ambiguous outcomes | Reused. Adds a safe stored purchase summary and aligns new-purchase eligibility with the voting engine |
| Selection #31 | Accessible package radios, integer kobo preview, voting window, scoped contestant profile | Extended behind a disabled-by-default server flag |
| Voting engine | Verified-payment-only allocation, transaction/locking, allocation uniqueness, reconciliation and correction foundation | Unchanged; checkout never invokes it |
| Payment schema | Payment, PaymentScope, PaymentInitialization, VerifiedPayment and VoteAllocation | Unchanged; all migration history preserved |
| Server verification #15, webhook #14, outbox #7, receipts/confirmation | Not implemented by this checkout slice | Remain separate reviewable issues |

The initializer previously allowed missing voting dates and a missing integrity cutover. Those new purchases could not meet the allocator's requirements. New reservations now require explicit dates plus setup/integrity readiness. Existing reservations are found first and retain their previous retry semantics; no historical payment is changed. A future verified-payment finalizer still needs an explicit policy for first allocation after closure.

## User flow

The contestant vote page retains category/subcategory identity and package selection. In enabled test environments it collects a required email, explains transactional use and that ownership is unverified, and permits editing before submission. There is no account, OTP, email-link authorization, marketing consent or email-provider dependency.

“Review test checkout” initializes one PENDING purchase. The browser submits only contestantId, packageId and email. Email is trimmed, domain-normalized, length-limited and checked for control characters on both servers. The UI displays the **stored** amount and votes returned by the backend, including any package price changed since the page opened. The user explicitly follows “Continue to Paystack (test)” after reviewing that amount. The URL must use the exact HTTPS checkout.paystack.com origin, an allowed path and no credentials, query or fragment. Hosted redirect reuses PAY-01; no Inline SDK, new provider initializer or public key is introduced.

This phase deliberately does not confirm payment or add votes. Callback query parameters are ignored as payment evidence. Stored READY retries remain retrievable after voting closes, but the UI withholds the checkout link when its current window is closed. The server also rejects new purchases after closure. Receipt/status authorization and reconciliation are future work.

## Session and retry protections

Only fixed same-origin routes exist: GET `/api/checkout/session` and POST `/api/checkout/initialize`. Both return private/no-store responses. The initializer facade enforces exact configured Origin, same-origin Fetch Metadata when supplied, JSON MIME, no content encoding, a streamed 4096-byte limit and strict field validation. Upstream origin/path is fixed by server configuration; client destinations, cookies and authorization headers are never forwarded. Upstream responses have bounded JSON parsing, timeout, strict safe summary validation and sanitized errors.

The anonymous session cookie has an eight-hour signed lifetime, HttpOnly, SameSite=Lax and root Path. HTTPS uses Secure and the `__Host-` prefix with no Domain. Local HTTP uses an unprefixed cookie only for loopback. CSRF and public session-binding tokens use separate HMAC purposes. A browser UUID plus the signed session ID derive a private UUIDv4-format retry capability, forwarded only from the web server to PAY-01. The raw backend capability is neither returned nor stored in the browser. The backend permanently stores only its hash and the normalized request fingerprint. Session expiry or secret rotation cannot silently reuse an old browser attempt under a new backend key.

Before dispatch, sessionStorage saves the tab's attempt UUID, session binding, selected IDs and normalized email. It contains no card details or credentials; it is temporary, same-origin browser storage, readable by scripts on that origin. Clearing tab storage removes retry recovery, so the UI explains its use. After initialization starts, selection/email freeze. Duplicate clicks are guarded immediately. Reloads and network failures reuse the frozen attempt. A changed/expired session stops for review rather than starting another purchase. Invalid storage blocks dispatch. A lost response, 202 STARTED/PENDING or UNKNOWN outcome never generates a new reference or automatically retries the provider. Unresolved purchases remain locked in that tab pending future reconciliation/support tooling.

The facade limits initialization requests to 20 per session per minute with a bounded process map. This is a test-mode safeguard, not a deployment-wide abuse guarantee; shared edge/IP limits for the direct API and web facade are a release gate. Anonymous sessions and syntactically valid email do not prove payer identity or authorize future receipts.

## Test configuration

Keep the currently running app and production settings disabled. Use an isolated development database only. Backend configuration remains in [PAY-01](payment-initialization.md): test secret only (`sk_live_` and live mode are rejected), fixed callback URL and test mode. The web runtime requires:

| Setting | Value |
| --- | --- |
| CHECKOUT_TEST_ENABLED | Literal `true` to enable; absent/anything else disables |
| CHECKOUT_APP_ORIGIN | Exact trusted web origin; HTTPS except loopback development |
| CHECKOUT_SESSION_SECRET | Independent random 32-byte value encoded as 64 hex characters; server only |
| API_BASE_URL | Fixed server API base ending in /api/v1; HTTPS or loopback HTTP |

Do not prefix any secret with NEXT_PUBLIC_. No credentials or flags were enabled in the shared app's environment. PAYSTACK_CALLBACK_URL remains server-owned; returning from checkout does not display payment success in this slice. Test keys alone are not permission to write test transactions into a production database.

## Tests and remaining work

Run `npm run qa:local -- -Phase checkout` for a fresh temporary PostgreSQL cluster, migrated isolated payment/browser databases, simulated provider calls, unit tests and real Next/Express browser requests. `npm run qa:local -- -Phase all` includes these plus the existing full regression gate. CI's existing QA command runs this updated gate; no workflow permission change is needed. Fixtures refuse populated, hosted, ambiguous or non-test targets. No test allocation/control endpoint is shipped in application code. Loopback controls exist only in the test harness. Paystack navigation is intercepted and all provider initialization is simulated.

Coverage: normalization/invalid email, byte limits, CSRF, host-only signed cookie integrity/expiry, session-bound deterministic retries, untrusted prices/votes, fixed URLs, disabled configuration, malformed upstream data, stale package prices, keyboard/mobile checkout, rapid clicks, simultaneous HTTP requests, reload, ambiguous outcomes, lost replies, changed sessions, closed voting, callback forgery and public vote mutations. Existing engine tests exercise verified-payment concurrency, rollback, independent leaderboards and cached-total reconciliation. See [execution report](../qa/test-checkout.md).

Production activation remains blocked by verification/finalization, authenticated durable webhooks, receipts and outbox delivery, reconciliation/late-payment policy, shared abuse controls, dependency advisory review and separate live-mode approval. Initialization and a browser redirect never establish readiness for production payments.

## Next webhook issue research (not implemented)

The [current Paystack webhook documentation](https://paystack.com/docs/v2/developer-tools/integration/webhooks) describes `Paystack-Signature: t=<unix>,v1=whk_id:<hex>` with mode-specific `whsec_` keys. Verify HMAC-SHA512 of timestamp + `.` + original raw body bytes using the whole webhook secret, constant-time comparison, documented timestamp tolerance (300 seconds), key IDs and rotation/multiple signatures. The deprecated X-Paystack-Signature mechanism hashes raw bytes with the API secret and lacks a timestamp. Any explicitly permitted legacy fallback must apply only when the new header is absent; never downgrade after an invalid new signature. Recheck current provider documentation when implementing #14. Preserve raw bytes before global JSON parsing, and persist a deduplicated authenticated inbox before acknowledging. No webhook, verification or signature code is added here.
