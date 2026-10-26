# PAY-01: Paystack test checkout initialization

Implements [issue #13](https://github.com/ebukanathan/TalentHunt/issues/13). This endpoint creates a hosted **test checkout**, not a confirmed payment. Payment stays PENDING. There are no voter accounts, email OTPs, verification links, webhooks, vote allocation, email delivery, receipt endpoints or live-payment support in this change.

## Configuration

Copy the placeholders from the root `.env.example` into local, uncommitted configuration. Set:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Explicit isolated development PostgreSQL target with migrations applied |
| `PAYSTACK_MODE` | `test` |
| `PAYSTACK_SECRET_KEY` | Your Paystack **test** secret, supplied locally; must begin with `sk_test_` |
| `PAYSTACK_CALLBACK_URL` | Fixed server-owned URL, e.g. `http://localhost:3000/` for local development |
| `PAYSTACK_TIMEOUT_MS` | Optional 1000–30000 milliseconds, default 8000 |

Leave all four Paystack variables blank to disable initialization with 503/PAYMENTS_NOT_CONFIGURED while keeping public reads available. Partial/invalid configuration fails startup with field names only. Live mode/keys are rejected in every NODE_ENV. Callback URLs cannot contain credentials, query parameters or fragments; HTTPS is required except for local loopback development. Production NODE_ENV also requires an HTTPS callback. No public key is needed for backend hosted initialization.

The provider URL is fixed at `https://api.paystack.co/transaction/initialize`, with redirects disabled; tests replace the transport through dependency injection. Paystack uses the same API host for test/live, selected by the secret key. Initialization sends the stored email, reference, NGN currency and integer-kobo amount as a decimal string, never a naira conversion. See [Paystack API environments](https://paystack.com/docs/api/) and [transaction initialization](https://paystack.com/docs/api/transaction/).

## Request and response

`POST http://localhost:4000/api/v1/payments/initialize`

Require `Content-Type: application/json` and a freshly generated UUIDv4 `Idempotency-Key` header. Keep that key for retries of the **same purchase**. It is a private retry capability; keep it out of URLs, logs and analytics.

```json
{
  "contestantId": "YOUR_ACTIVE_CONTESTANT_ID",
  "packageId": "YOUR_ACTIVE_PACKAGE_ID",
  "email": "voter@example.com"
}
```

The external field is `email`; it maps to `Payment.contactEmail`. Surrounding email whitespace is trimmed, the domain is lowercased and the local part is preserved. Email is required contact information, not an ownership/identity check. Unknown fields, including `amount`, `amountKobo`, `priceKobo`, `voteCount`, `contactEmail` or verification tokens, are rejected. IDs follow the existing public API string-ID conventions.

First successful creation returns **201**:

```json
{
  "status": "success",
  "data": {
    "reference": "th-test-<server-generated-uuid>",
    "authorizationUrl": "https://checkout.paystack.com/<checkout-code>"
  }
}
```

An identical successful replay returns **200** with the same reference/URL, including across service restarts and package-price edits. Responses are `private, no-store`. The URL permits checkout; neither it nor the callback proves payment or authorizes receipt access. Paystack/bank payment authentication is separate from the removed voter email-verification requirement.

## Selection and snapshot rules

The server locks the contestant, competition and package rows while validating and inserting the snapshot. The contestant and package must exist, be active and belong to the same competition. `PUBLIC_COMPETITION_SLUG`, when configured, must match. The competition must be OPEN; the optional opening time is inclusive and closing time exclusive. Malformed/reversed dates fail closed. Null dates impose no additional boundary on an OPEN competition.

Package and competition currency must both be NGN. Stored price must be an integer of at least 5000 kobo (the documented NGN provider minimum); vote quantity must be a positive integer. The backend reads these values from PostgreSQL. Changing a package later does not rewrite any payment snapshot. Replays identify the existing purchase rather than create/reprice/revalidate a new purchase or renew an expired checkout session.

One transaction creates the PENDING Payment and its PaymentInitialization row. Only that transaction's successful creator dispatches the provider request, **after commit**. Payment snapshots include reference, competition, contestant, package, contactEmail, amountKobo, voteCount and currency. This service never updates those values or transitions payment status. The legacy nullable verification relation is unused and preserved.

## Errors and safe retries

| HTTP / code or state | Meaning / action |
| --- | --- |
| 400 / VALIDATION_ERROR | Invalid JSON fields, IDs, email or unknown amount/vote/verification fields; no payment created |
| 400 / INVALID_IDEMPOTENCY_KEY | Missing/non-UUIDv4 key; no payment created |
| 404 / SELECTION_NOT_FOUND | Missing/inactive/mismatched contestant or package, or configured competition mismatch |
| 409 / VOTING_NOT_OPEN | Competition lifecycle/window does not permit a new purchase |
| 409 / INVALID_PACKAGE | Stored price/votes/currency cannot be purchased |
| 409 / IDEMPOTENCY_CONFLICT | Same key with a different normalized request; do not replace the original purchase |
| 409 / PAYMENT_NOT_PENDING | Existing payment can no longer be initialized |
| 502 / PAYSTACK_REJECTED | Explicit provider rejection; sanitized, stored as initialization REJECTED; identical retries return the same failure without dispatch |
| 202 / initializationStatus PENDING | Another request owns the initialization, or it crashed before saving the outcome; replay the same key/input, never blindly create a replacement |
| 202 / initializationStatus REVIEW_REQUIRED | Timeout, transport error, 429/5xx, invalid/mismatched provider response or another uncertain outcome; provider acceptance is possible |
| 503 / PAYMENTS_NOT_CONFIGURED | Test checkout is disabled |
| 503 / SERVICE_UNAVAILABLE | Database is unavailable; repeat the same key/input after recovery |

202 responses use `{ "status": "pending", "data": { "reference": "...", "initializationStatus": "..." } }` and `Retry-After: 5`; they contain no checkout URL. A random reference is not sufficient to retrieve a purchase. A cached failure and uncertain initialization leave Payment PENDING because this issue does not determine payment success/failure.

The permanent unique hashed idempotency key and normalized request fingerprint prevent duplicate local payments and provider calls for the same attempt, including concurrent requests and process restarts. Raw keys are not stored. No network operation runs inside a database transaction. If the process crashes after reserving or Paystack accepts but the database cannot save its reply, retries remain unresolved instead of dispatching again. A stale STARTED row is also potentially accepted; there is deliberately no time-based automatic takeover, deletion or retry with a new reference.

Uncertain outcomes require provider/dashboard reconciliation before any replacement purchase. This issue does not implement that worker or promise automatic recovery from ambiguous acceptance. Only after establishing that the original transaction cannot charge should a voter explicitly start a new purchase with a new key; do not instruct clients to regenerate keys on network errors. Definitive rejection is cached; correcting server configuration alone does not reset the old attempt. READY checkout expiry/renewal and receipt/session authorization remain future payment/frontend work. Different keys denote different purchases and are not deduplicated by email.

Provider raw responses, error messages, secret headers and exception causes are never forwarded or logged. Only the exact HTTPS `checkout.paystack.com` origin is accepted for returned URLs, and returned references must match the stored one.

## Manual test in PowerShell

Use your own explicitly isolated development database. After reviewing that `DATABASE_URL` names that target, run the new migration there and start the API:

```powershell
npx --no-install prisma generate
npx --no-install prisma migrate deploy
npm run dev:api
```

Choose fixture IDs from `GET /api/v1/contestants` and `GET /api/v1/vote-packages` in that same database. The existing demo competition is DRAFT and must return 409; do not change hosted competition status just to test checkout. Use an isolated OPEN fixture with active records and a current voting window for the successful path; the integration suite creates one automatically without touching Supabase.

In another terminal:

```powershell
$purchaseKey = [guid]::NewGuid().ToString()
$purchaseHeaders = @{ 'Idempotency-Key' = $purchaseKey }
$purchaseBody = @{
  contestantId = 'YOUR_ACTIVE_CONTESTANT_ID'
  packageId = 'YOUR_ACTIVE_PACKAGE_ID'
  email = 'voter@example.com'
} | ConvertTo-Json
$checkout = Invoke-RestMethod -Method Post `
  -Uri 'http://localhost:4000/api/v1/payments/initialize' `
  -ContentType 'application/json' -Headers $purchaseHeaders -Body $purchaseBody
$checkout
# Repeat this identical request with the SAME headers/body to test safe replay.
```

Open the returned authorizationUrl manually to inspect hosted test checkout. Use only [Paystack test payment details](https://paystack.com/docs/payments/test-payments/). Completing it still grants **no votes** in PAY-01; payment remains locally PENDING until future verified finalization is implemented. No email sending occurs. No real Paystack call is claimed by automated tests, and no secret is needed in chat/committed files.

## Automated checks and migration

```powershell
npm run test:payments:unit --workspace=apps/api
# Create fresh, migrated LOCAL databases (never the hosted development target).
$env:PAYMENTS_TEST_DATABASE_URL = 'postgresql://YOUR_ROLE:YOUR_PASSWORD@127.0.0.1:5432/talenthunt_payments_test'
$env:API_TEST_DATABASE_URL = 'postgresql://YOUR_ROLE:YOUR_PASSWORD@127.0.0.1:5432/talenthunt_api_test'
npm run build --workspace=apps/api
npm run typecheck:test --workspace=apps/api
npm test --workspace=apps/api
```

Apply the committed migrations to each explicit local test target before running. Tests reject production mode, remote hosts, unsafe names/routing and non-empty targets; they leave synthetic fixtures and never reset/delete existing data. The provider boundary is a local HTTP fake. The migration rehearsal applies the original SQL into a separate test schema, inserts a historical PAID payment with populated verification link and allocation, then applies the new migration and compares complete historical snapshots.

`20261026090000_add_payment_initialization` adds only a new enum, table, unique index and foreign key, with no backfill. Historical migration bytes, ContactVerification, Payment.verificationId and all prior payment/allocation rows are preserved. Deployment to the configured hosted database is a separate controlled step; it is not performed by this implementation or startup. Scope excludes verification cleanup and confirmation/outbox tables.
