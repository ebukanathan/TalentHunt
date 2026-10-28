# ADMIN-01: administrator access

The dashboard is `/admin`; sign in at `/admin/login` (locally, http://localhost:3000/admin/login). ADMIN-01 is merged in PR #36. [ADMIN-02 contestant management](contestant-management.md) replaces the Contestants placeholder on its feature branch for review. Overview, Competition, Vote Packages and Payments remain placeholders. There is no public admin registration, voter login, image upload or payment finalization in these admin tasks.

## Configure and migrate

Use your intended development database. Review the target before running Prisma commands; no hosted migration or real account provisioning is performed by the test suite.

1. Run `npm ci` and `npx --no-install prisma generate` from the root.
2. Set the API's `DATABASE_URL` as usual and review `npx --no-install prisma migrate status`. Apply the new additive migration with `npx --no-install prisma migrate deploy` only against the intended target. Existing migration files and historical payment/admin rows are preserved. The migration creates empty `AdminSession` and `AdminAuthRateLimit` tables.
3. In root `.env` or the API process environment, set `ADMIN_AUTH_ENABLED=true`, `ADMIN_APP_ORIGIN=http://localhost:3000`, and `ADMIN_CSRF_SECRET` to a fresh 32-byte hex secret. Generate the secret locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`; keep it in the secret environment. Optional `ADMIN_IDLE_MINUTES=30` and `ADMIN_ABSOLUTE_HOURS=8` set session limits.
4. In `apps/web/.env.local`, set `API_BASE_URL=http://localhost:4000/api/v1` and `ADMIN_APP_ORIGIN=http://localhost:3000`. The origins must match exactly and have no trailing slash. The API base is server-only.

All admin settings blank (or explicit `ADMIN_AUTH_ENABLED=false`) disables authentication with 503 while public reads/checkout remain available. Partially configured enabled authentication fails API startup with field names only. Production requires an explicit HTTPS frontend origin in both applications. HTTPS API transport is required except loopback. Never put admin secrets in `NEXT_PUBLIC_*` variables.

## Provision the one administrator

The CLI intentionally ignores `.env` and `DATABASE_URL`. Choose a database explicitly in the current shell, then use the hidden interactive password prompt:

```powershell
$env:ADMIN_PROVISION_DATABASE_URL = 'YOUR_INTENDED_POSTGRESQL_CONNECTION_STRING'
$env:ADMIN_PROVISION_CONFIRM = 'initial-admin'
npm run admin:provision --workspace=apps/api
Remove-Item Env:ADMIN_PROVISION_DATABASE_URL, Env:ADMIN_PROVISION_CONFIRM
```

The password must have 16–128 characters with no control characters. No default password, password arguments, startup bootstrap or seed account exists. Provisioning uses a transaction/advisory lock and refuses if **any** AdminUser already exists; concurrent attempts create at most one administrator. It never upserts, overwrites, activates, deletes or repairs an existing account. Existing incompatible hashes or lost credentials need a separately reviewed operator recovery task. Do not delete an account to rerun provisioning.

Automation may supply protected UTF-8 JSON `{ "email": "…", "password": "…" }` on stdin with `npm run admin:provision --workspace=apps/api -- --stdin`. This requires noninteractive redirected input. Use a secret manager or restricted temporary input, not literal credentials in command history, logs or committed files. Errors deliberately omit database URLs and credential details.

Run `npm run dev:api` and `npm run dev:web`, then open `/admin/login`. Use the exact configured browser origin; `127.0.0.1` and `localhost` are different origins.

## Authentication flow and API

The browser uses the same-origin Next facade below. Express owns credentials, active-user checks, authorization and session storage. Facade destinations and methods are fixed; it forwards only admin cookies and CSRF/origin headers, bounds mutation bodies to 4 KB, uses an 8-second timeout and rejects redirects. It never forwards user-controlled client-IP headers or an arbitrary upstream URL.

| Browser endpoint | Express endpoint | Contract |
| --- | --- | --- |
| GET `/api/admin/auth/csrf` | GET `/api/v1/admin/auth/csrf` | `{status:"success",data:{csrfToken}}`; sets a signed 10-minute HttpOnly login challenge, or returns a session-bound token |
| POST `/api/admin/auth/login` | POST `/api/v1/admin/auth/login` | Strict JSON `{email,password}`, exact Origin and `X-CSRF-Token`; returns only `{status:"success",data:{admin:{id,email}}}` and an HttpOnly session cookie |
| GET `/api/admin/auth/session` | GET `/api/v1/admin/auth/session` | Requires a valid, unexpired session and active administrator; same minimal admin DTO |
| POST `/api/admin/auth/logout` | POST `/api/v1/admin/auth/logout` | JSON `{}`, exact Origin and session-bound `X-CSRF-Token`; revokes the session, clears both cookies, returns `{status:"success",data:null}` |

For a manual HTTP client, save cookies from GET csrf, send its `data.csrfToken` in `X-CSRF-Token`, and send `Origin` equal to the configured frontend origin for login. Save the login cookie. Fetch csrf again with that cookie before logout. Cookies and tokens are credentials; do not paste them into issues or logs. Missing/invalid session returns 401, CSRF/origin failure 403, invalid login input 400, throttling 429 and unavailable configuration/storage/upstream 503 (unexpected failures are sanitized 500). Unknown, wrong-password and inactive accounts have the same invalid-credentials response.

Passwords use salted scrypt (N=131072, r=8, p=1), fixed bounded parameters and constant-time comparison; unknown/corrupt account hashes take the same KDF path. At most two KDF operations run per API process. PostgreSQL atomically tracks 15-minute limits of 5 attempts/account, 20/source IP and 50 globally, shared between workers, including rejected attempts. Account/IP keys are HMAC hashes. With the facade, the API sees the Next server's IP, so that bucket is intentionally conservative/shared. Apply a separate trusted ingress limiter if more traffic is expected; do not enable blanket Express `trust proxy` or forward untrusted IP headers.

Sessions use random 32-byte opaque tokens; PostgreSQL stores only SHA-256 hashes. Login rotates the presented session, logout revokes it, and every protected backend request verifies expiry and AdminUser.isActive. Defaults are 30 minutes idle / 8 hours absolute; refreshing a session cannot extend the absolute limit or revive an expired session. Secure production cookies use `__Host-talenthunt_admin`, HttpOnly, Secure, SameSite=Lax, Path=/ and no Domain. Loopback HTTP development uses a separate `talenthunt_admin_dev` name. Login challenge cookies follow the same policy. All auth API responses are no-store.

Every protected Next page and its layout verifies the session at request time; no persistent auth cache or localStorage token exists. Authentication failures redirect to login; upstream/configuration failures show an unavailable state. Successful login/logout uses a full navigation to discard private client-router state. The Express admin router applies session and unsafe-method CSRF guards before all subsequent protected handlers, including future resources. Safe GETs cannot perform admin writes. No frontend action alone authorizes a mutation.

Provisioning/login/logout produce sanitized AuditLog events. Each login deletes at most 100 sessions that expired over 24 hours ago; throttle processing similarly prunes at most 100 stale keys. Recent session metadata remains for investigation. Changing the signing secret invalidates CSRF tokens/throttle keys; deploy it consistently across API workers. Server session expiry remains authoritative.

## Verification

Use **fresh migrated localhost databases only**. Suites refuse production, non-local URLs, routing overrides, wrong database names and non-empty targets; they never reset a database. Set the dedicated URLs explicitly (no `DATABASE_URL` fallback):

```powershell
# Create/migrate each fresh database first; substitute your local role/port.
$env:ADMIN_TEST_DATABASE_URL = 'postgresql://LOCAL_ROLE@127.0.0.1:5432/talenthunt_admin_test_run1'
$env:ADMIN_WEB_TEST_DATABASE_URL = 'postgresql://LOCAL_ROLE@127.0.0.1:5432/talenthunt_admin_test_web_run1'
npm run test:admin --workspace=apps/api
npm run test:admin:integration --workspace=apps/web
```

The web integration suite starts an isolated Next development server and a real Express API, provisions a synthetic admin only in its guarded database, and checks login/session/logout through the facade, direct access to every private page, expiry, CSRF, no-store responses and upstream outage. It makes real HTTP requests and checks rendered HTML; it does not simulate a browser or execute client interactions. Its artifacts use `.next-admin-test` so an existing development server can keep running. Use a new database for each run.

Additional checks: `npm run build --workspace=apps/api`, `npm run typecheck:test --workspace=apps/api`, web `lint`, `test`, `typecheck`, `build`, `test:smoke`, existing public/Paystack integration suites, seed unit/integration suites and Prisma schema drift. The root `npm test` remains the pre-existing placeholder; use workspace scripts. No Paystack, email or Supabase Storage credentials are needed for auth tests. Real browser keyboard/mobile inspection remains a manual review item when browser automation is available.
