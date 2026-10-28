# TalentHunt

A paid talent-show voting platform under development with Next.js, TypeScript, Express, Prisma, PostgreSQL/Supabase and Paystack.

Current implementation: npm workspaces, the public Next.js interface, Express read API, Prisma/PostgreSQL, PAY-01 test checkout initialization, merged ADMIN-01 authentication and ADMIN-02 contestant management submitted for review. Payment finalization, paid votes, transactional confirmations, uploads and competition/package management remain roadmap work.

Product decision (24 October 2026): checkout requires an email address for receipts, voting confirmations, transaction communication and support, with no voter OTP or verification link. Payment verification and vote allocation are independent of email delivery. See [paid voting requirements](docs/product/paid-voting-requirements.md) and the [broader Paystack, API and schema plan](docs/api/checkout-and-confirmations.md). Confirmation delivery and legacy verification removal remain proposals. Marketing requires separate appropriate consent.

PAY-01 adds test-only `POST /api/v1/payments/initialize` with server-owned prices, PENDING purchase snapshots and durable retry protection. See [configuration, request examples and payment tests](docs/api/payment-initialization.md). Checkout initialization does not confirm payment, allocate votes or send email. Paystack credentials are optional as a complete configuration; when absent, public reads work and initialization returns 503.

Current development priority: Admin Dashboard first; further Paystack implementation is paused. ADMIN-01 is merged in PR #36. ADMIN-02 adds `/admin/contestants`, `/admin/contestants/new` and `/admin/contestants/[id]/edit` on its feature branch for review. Sign in at `/admin/login`; see [admin setup](docs/admin/authentication.md), [contestant API/UI/testing](docs/admin/contestant-management.md) and [roadmap](docs/project-management/roadmap.md). Storage uploads and competition/package management remain later issues. No ADMIN-02 merge without approval.

## Development setup

Validated tooling at initial review: Node.js 24.15.0 and npm 11.12.1. Use the repository lockfile.

1. Run npm ci from the repository root.
2. Copy .env.example to .env and set DATABASE_URL for an isolated development PostgreSQL database. Credentials belong only in the local environment.
3. Run npx --no-install prisma generate and npx --no-install prisma validate.
4. Inspect npx --no-install prisma migrate status. Only after confirming the target is your intended development database, apply existing migrations with npx --no-install prisma migrate deploy.
5. In separate terminals run npm run dev:web and npm run dev:api.

The web app runs on http://localhost:3000; the API defaults to http://localhost:4000. The health endpoint is GET /api/v1/health. The API CORS origin is currently fixed to localhost:3000.

Prisma CLI loads the root .env through prisma.config.ts. The API loads process settings first, then apps/api/.env, then root .env, validates startup configuration and uses a shared Prisma client. See [Core REST API](docs/api/core-rest-api.md) for browser/Postman requests, public response contracts and isolated test commands. Broader readiness/logging work remains in F05.

Demo database seeding is available through npm run db:seed; see the development/test instructions below. Do not run demo seeds or development/reset migrations against production. Runtime database pooling and migration connection settings must be validated before deployment.

## Demo database seeding

The seed creates one DRAFT competition (talenthunt-demo), three fictional contestants and three NGN vote packages. It creates no contacts, payments, allocations or admin accounts. Initial vote totals are zero.

Package names, vote counts and integer-kobo prices are configurable in prisma/seed-data.ts. Keep fixture IDs unchanged to preserve identity. Demo defaults are Starter: 10 votes / 100000 kobo; Supporter: 50 / 500000; Champion: 100 / 1000000. These are demonstration values, not production pricing decisions.

The seed requires a dedicated SEED_DATABASE_URL and SEED_ENV=development or test. It does not fall back to DATABASE_URL. Local databases must be named talenthunt_dev[_suffix], or talenthunt_test[_suffix] / talenthunt_seed_test[_suffix] in test mode. A remote Supabase target additionally requires an exact SEED_SUPABASE_PROJECT_REF; other remote hosts, identity mismatches, routing overrides, repeated options and non-public schemas are refused. NODE_ENV=production and SEED_ENV=production are always refused.

From the repository root, after creating a dedicated local development database and using your own local role/password:

```powershell
$env:SEED_ENV = 'development'
$env:SEED_DATABASE_URL = 'postgresql://YOUR_LOCAL_ROLE:YOUR_LOCAL_PASSWORD@127.0.0.1:5432/talenthunt_dev'
# Explicitly point the migration CLI at that same local database.
$env:DATABASE_URL = $env:SEED_DATABASE_URL
npx --no-install prisma generate
npx --no-install prisma migrate deploy
npm run db:seed
npm run db:seed
```

Repeat runs reuse the same IDs. Existing competition/contestant edits, activation flags and vote totals are preserved; configured package metadata is updated. All seed writes are transactional. A conflicting demo ID/slug fails instead of adopting another competition's records. There are no reset, truncate or delete operations, and Prisma disconnects on success or failure. Run one seed process at a time.

### Supabase development seeding

Only select a project confirmed to be development/test. Set SEED_DATABASE_URL to its connection string and SEED_SUPABASE_PROJECT_REF to that same project's reference. The guard binds direct host identity or the session-pooler username to this reference and requires the postgres database on port 5432 with SSL. It accepts an existing boolean pgbouncer option. Connection formats follow the [Supabase connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres).

Set these values for the current shell session, without saving credentials or permissions into committed files:

    $env:SEED_ENV = 'development'
    $env:SEED_SUPABASE_PROJECT_REF = 'YOUR_PROJECT_REF'
    $env:SEED_DATABASE_URL = 'YOUR_DEVELOPMENT_SUPABASE_DIRECT_OR_SESSION_URL'
    npm run db:seed
    npm run db:seed
    Remove-Item Env:SEED_ENV, Env:SEED_DATABASE_URL, Env:SEED_SUPABASE_PROJECT_REF

The Prisma CLI still loads DATABASE_URL from the root .env; the seed itself connects only through the dedicated target. Existing migrations must already be applied. The automated integration suite remains local and refuses the Supabase postgres database.

When promoting this project to production, set NODE_ENV=production, remove all SEED_* settings from local/deployment configuration, and review/remove fictional demo records before launch. The seed cannot infer that a hosted project has changed purpose; its production refusal depends on these explicit settings. No demo seed is part of deployment.

### Seed verification

```powershell
npm run typecheck:seed
npm run test:seed
# Create a FRESH isolated database named talenthunt_seed_test (or _suffix).
$env:SEED_TEST_DATABASE_URL = 'postgresql://YOUR_LOCAL_ROLE:YOUR_LOCAL_PASSWORD@127.0.0.1:5432/talenthunt_seed_test'
$env:DATABASE_URL = $env:SEED_TEST_DATABASE_URL
npx --no-install prisma migrate deploy
npm run test:seed:integration
```

Integration tests refuse a non-empty target and never reset it. They run the real Prisma seed CLI twice, verify row counts/IDs/relationships and zero initial votes, then exercise preservation, configurable prices, unsafe configuration and transactional rollback. They leave synthetic test data in the isolated target; use a fresh disposable database for the next integration run. A local PostgreSQL installation or disposable PostgreSQL container is sufficient; no payment/email credentials are needed.

## Verification

- API: npm exec -- tsc -p apps/api/tsconfig.json --noEmit
- Web: npm run lint --workspace=apps/web
- Builds: npm run build --workspace=apps/api and npm run build --workspace=apps/web
- Schema: npx --no-install prisma validate

Initial review passed API typechecking, frontend lint, schema validation and a live API health request. The configured database had the initial migration applied and no detected drift. The root test script remains a placeholder. API HTTP/database tests run with npm test --workspace=apps/api against an explicit fresh local API_TEST_DATABASE_URL; seed-specific checks are documented above. Broader application testing and CI remain tracked by T01/T02. Both API and web production builds also passed before the initial source publication; clean-checkout reproducibility remains to be verified in F04.

## Architecture and roadmap

Intended request path: browser -> Next.js interface -> Express API -> Prisma -> Supabase-hosted PostgreSQL. Paystack, CSRF and email provider secrets stay on the server. Admin authentication uses opaque database sessions and a fixed-path same-origin Next facade.

- [Development project](https://github.com/users/ebukanathan/projects/3)
- [Roadmap, milestones, workflow and risk register](docs/project-management/roadmap.md)
- [Detailed initial backlog](docs/project-management/proposed-backlog.md)

The board uses Backlog, Next, In Progress and Done. Work in progress is limited to one task for solo development. Close issues only with acceptance and validation evidence. A phase is a grouping, so security prerequisites such as A01 may be pulled forward.

The roadmap runner uses GitHub CLI. node scripts/github-roadmap.mjs --plan regenerates a local preview without GitHub requests. --apply writes GitHub resources and is only for an explicitly approved setup; it is not a routine development command or a synchronization tool for a board already in use.
