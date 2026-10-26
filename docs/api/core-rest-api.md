# Core REST API

Run from the repository root with the existing migrated development database configured in .env:

~~~powershell
npm ci
npx --no-install prisma generate
npm run dev:api
~~~

The default base URL is http://localhost:4000/api/v1. PORT can override 4000. Environment values supplied by the process take precedence over apps/api/.env, followed by the root .env. DATABASE_URL is required and must be a PostgreSQL URL.

## Try it in Postman or a browser

In Postman choose GET, paste a URL below and click Send. No body or authentication is required. The same URLs can be opened directly in a browser. Replace the example detail ID with an ID from your contestant list when using another database.

| Request | URL | Expected result with the existing demo data |
| --- | --- | --- |
| Competition | http://localhost:4000/api/v1/competition | 200; one competition object |
| Contestants | http://localhost:4000/api/v1/contestants | 200; three active contestants |
| Trailing-slash list alias | http://localhost:4000/api/v1/contestants/ | Same collection response |
| Contestant detail | http://localhost:4000/api/v1/contestants/demo-talenthunt-contestant-001 | 200; one contestant |
| Vote packages | http://localhost:4000/api/v1/vote-packages | 200; three active packages |
| Unknown ID | http://localhost:4000/api/v1/contestants/does-not-exist | 404; CONTESTANT_NOT_FOUND |
| Malformed ID | http://localhost:4000/api/v1/contestants/bad!id | 400; VALIDATION_ERROR |

The repeated /contestants/ entry in the original request is supported as a list alias; /contestants/:id is the detail endpoint.

## Selection and response contract

Set PUBLIC_COMPETITION_SLUG to pin all endpoints to one competition. For example, set PUBLIC_COMPETITION_SLUG=talenthunt-demo in a local environment file or shell. When unset, the API selects the newest competition by createdAt descending, with id ascending as a deterministic tie-breaker. A configured but missing slug never falls back to another show.

Competition status, including DRAFT, is returned as metadata. These reads do not authorize voting or initialize payments. Contestant and package reads always apply the selected competition, and inactive records are excluded from both collections and contestant details.

Successful core responses have this envelope:

~~~json
{
  "status": "success",
  "data": []
}
~~~

The data value is an object for competition/detail requests and an array for collections. An empty collection is 200 with []. Missing competition metadata and missing/inactive/other-show contestant details are 404.

Contestant totalVotes is a decimal STRING, such as "0" or "9007199254740993", to preserve BigInt precision. Do not convert large totals to JavaScript Number. Dates are ISO strings or null. Package priceKobo is an integer in kobo. Explicit public projections exclude payment relations, voter contacts, admin data and internal timestamps.

Errors use the same shape:

~~~json
{
  "status": "error",
  "code": "CONTESTANT_NOT_FOUND",
  "message": "Contestant not found."
}
~~~

Malformed IDs return 400/VALIDATION_ERROR with field/message details. IDs may contain letters, numbers, underscores and hyphens, start with a letter/number, and have at most 128 characters. This supports Prisma-generated IDs and the existing demo IDs. Well-formed IDs with no visible matching record return 404. Unknown routes return JSON 404, unavailable database connections return sanitized 503, and unexpected failures return sanitized 500 without SQL, credentials or stacks.

The existing /api/v1/health response remains compatible: status "ok" and its existing message. It is a process health check, not a database readiness check.

Test checkout initialization is documented separately in [PAY-01](payment-initialization.md). Public reads continue to work without Paystack configuration. Initialization uses `email` (stored as Payment.contactEmail), not email ownership verification, and grants no votes.

## Implementation

Routes match URLs, controllers validate request parameters with Zod and build response envelopes, and services perform scoped Prisma queries. src/lib/prisma.ts provides the reusable client. The server closes HTTP connections and disconnects Prisma on shutdown; it never disconnects after individual requests. The app factory accepts a service for isolated HTTP tests. BigInt JSON conversion and error handling are centralized.

## Automated verification

Use a FRESH isolated local PostgreSQL database named talenthunt_api_test or talenthunt_api_test_suffix. The tests refuse remote targets, connection routing overrides, production mode and non-empty databases. They create synthetic fixtures and leave them in that disposable database; they never reset it or write to Supabase.

~~~powershell
$env:API_TEST_DATABASE_URL = 'postgresql://YOUR_LOCAL_ROLE:YOUR_LOCAL_PASSWORD@127.0.0.1:5432/talenthunt_api_test'
$env:DATABASE_URL = $env:API_TEST_DATABASE_URL
npx --no-install prisma migrate deploy
npm run build --workspace=apps/api
npm run typecheck:test --workspace=apps/api
npm test --workspace=apps/api
~~~

Public-read tests cover successful requests, empty results, inactive/cross-show filtering, explicit competition selection, malformed/unknown IDs, exact BigInt JSON strings above Number.MAX_SAFE_INTEGER, unknown routes, health compatibility and sanitized asynchronous/database errors. The API test command now also requires PAYMENTS_TEST_DATABASE_URL for the separate [PAY-01 initialization tests](payment-initialization.md). Payment finalization, transactional email and administrator endpoints remain unimplemented. Voter email verification is not required; checkout requires email without OTP/link verification.
