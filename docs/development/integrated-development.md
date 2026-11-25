# Integrated local development

The integration branch retains remote main `3b97f8f` and payment commits `b8b2f33` / `d5975e1`, then ports the original workspace's admin timeout and voting-date repairs. Videos, taxonomy, public grouping, scoped leaderboard controls, voting allocation and test payments remain in one source history. Do not merge older feature branches again or copy whole older admin files over these interfaces.

## Start the complete app on Windows

Use Node 24, PostgreSQL 18 (default binaries `C:/Program Files/PostgreSQL/18/bin`) and the checked-in lockfile. From the integration checkout:

```powershell
npm ci
$env:DATABASE_URL = 'postgresql://postgres@127.0.0.1:5432/talenthunt_paid_demo_00000000'
npx --no-install prisma generate
npm run build --workspace apps/api
Remove-Item Env:DATABASE_URL
npm run dev:integration
```

The URL in the generation command is an unused local placeholder, solely for Prisma configuration parsing. Generation/build do not migrate or connect to that database. The launcher independently selects its owned database and never uses inherited `DATABASE_URL`.

`npm run dev`, `dev:admin` and `dev:paid-voting` are aliases of the same integrated launcher in this branch. Keep its command running. It refuses occupied ports and never stops another runtime automatically. Stop only the identified TalentHunt launcher before switching worktrees.

The launcher creates and reuses its own loopback PostgreSQL cluster, guarded `talenthunt_paid_demo_*` database, test competition, two independent subcategories, two contestants, two example video IDs and 10/50/100-vote packages. Initial vote totals are zero; setup does not create purchases, evidence or allocations. The reviewed synthetic taxonomy is test-only. The initial voting window lasts seven days; restarts preserve existing settings, purchases and vote totals rather than resetting or reopening the competition.

For an empty owned database only, the existing provisioning CLI creates a dedicated test administrator using generated credentials in ignored `.env.integration-admin.local`. Open that local file to sign in; passwords are never printed. Existing accounts are never overwritten, reactivated or reprovisioned. The original workspace's administrator is independent and its credentials are not read or copied.

Application links:

- Website: http://localhost:3000
- Administration: http://localhost:3000/admin/login
- Videos/profile: http://localhost:3000/contestants/test-performer
- Categories: http://localhost:3000/categories
- Test purchase: http://localhost:3000/contestants/test-performer/vote
- Scoped leaderboard: http://localhost:3000/leaderboard?categoryId=test-music&subcategoryId=test-solo
- Backend health: http://localhost:4000/api/v1/health

The launcher waits for complete public/login responses, database-backed API reads and the admin CSRF proxy before reporting `ready: true`. The printed startup summary and ignored `artifacts/qa/integration-processes.json` identify the worktree, branch, commit, child PIDs and exact log paths. Continuous logs live in the owned temporary PostgreSQL runtime directory, outside the watched checkout. Do not redirect continuous logs into this worktree while `next dev` is running. The development frontend uses its own ignored `.next-integration` output.

Development filesystem caching is disabled in `next.config.ts` after a reproduced restored-graph HMR hash-mismatch reload loop. Production build caching and application caching retain their existing settings. Use only one frontend per output directory; a running development server and a production build must not write the same output.

## Separate local configuration

No root/API `.env`, original `.env.admin-credentials`, hosted database URL, inherited provider configuration or Supabase credential is used to select the integration target. Admin and checkout signing secrets are independently generated in ignored local files and persist across restarts. Database and Paystack credentials are not passed to Next.js; only its checkout session secret is available server-side.

Keep Paystack test settings in ignored `.env.paystack-test.local` in this checkout. Alternatively, ignored `.env.integration.local` may explicitly reference an existing Paystack-only file:

```dotenv
PAYSTACK_TEST_ENV_FILE=C:/absolute/path/to/.env.paystack-test.local
```

Only `PAYSTACK_SECRET_KEY`, `PAYSTACK_CALLBACK_URL` and `PAYSTACK_WEBHOOK_SIGNING_KEYS` are consumed from that provider file. The key must start with `sk_test_`; callback must be `http://localhost:3000/payments/return`. Other credentials/settings are not imported. `.env.integration.local` can also set `POSTGRES_BIN` to the local PostgreSQL binaries directory. Do not place secrets in examples or `NEXT_PUBLIC_*` settings.

Without a test key, admin/public interfaces still work and checkout explains missing configuration. With a key, server-side finalization is restricted to the owned loopback test database. Start a fresh browser tab when switching from another worktree/database: saved checkout attempts belong to their original environment and must not be silently replaced. Then follow the returned Paystack checkout and return in that same tab; callback query values alone cannot grant votes. Successful verification must allocate once, and reload must not allocate again. Real provider completion must be reported separately from the simulated browser suite.

The webhook receiver and worker already exist. A real delivery requires a publicly reachable HTTPS endpoint forwarding to backend `/api/v1/webhooks/paystack`, the matching test-mode signing keys, and Paystack test dashboard configuration. The worker starts only when signing keys are configured. No tunnel or dashboard setting is created automatically. Return-page verification can work without webhook delivery. Receipt-email sending remains unavailable; confirmation intents are durable but not delivered.

## Verify before review

```powershell
npm run qa:local -- -Phase all
```

The full gate validates/generates Prisma, applies unchanged migrations to fresh isolated fixtures, checks historical data preservation and schema drift, runs API/unit/integration/browser tests, and builds/typechecks the applications. Provider transports are simulated there and inherited credentials are removed. It includes the local-runtime guards, slow admin-proxy regression, voting-date validation, video/category/visibility browser scenarios, atomic payment/vote tests and a development-mode desktop/mobile navigation, refresh and session regression. The latter can also run alone with `npm run qa:local -- -Phase stability`; its reports live outside the watched worktree.

Stop the integrated launcher before running this gate on Windows. A running Prisma client holds its query-engine DLL open and prevents `prisma generate` from replacing it. Restart the application after the gate; the owned integration database and test account persist.

No hosted migration is part of integration testing. The category assignment NOT NULL contract remains separately gated until all mappings are reviewed and incompatible writers are drained. Do not promote that gated migration automatically, reset a database, or rewrite historical migration files.
