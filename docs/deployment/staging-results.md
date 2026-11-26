# Staging preparation results

> Historical Vercel/Render preparation evidence. The current hosting decision is
> documented in `digitalocean-plan.md`; no DigitalOcean deployment/load test is
> implied by these earlier local results.

Recorded 26 November 2026 (Africa/Lagos). **Not deployed.** Frontend URL and API
URL are unassigned. Cloud resources, purchases, migrations and Paystack dashboard
changes remain subject to the user's infrastructure/cost approval.

## Candidate and local changes

Worktree `.worktrees/integration`, branch `integration/all-completed-features`,
baseline `f33fc7187b1c5ae4c3bcf4429012f9e718cbc172`. Preparation changes are local,
uncommitted and unpushed. No merge into main was performed. Existing worktrees,
lockfile, Prisma schema and migration history were preserved.

Application/configuration changes:

- `apps/api/src/app.ts`: CORS advertises the configured admin frontend origin;
  localhost remains the fallback for existing fixtures/development.
- `apps/api/src/config/env.ts` and `finalization-target.ts`: preserve the existing
  local test-database restriction; add an explicit approved Supabase staging path
  requiring test credentials, matching database/storage project, TLS with strict
  certificates, session/direct port 5432, Vercel HTTPS origin and exact callback.
  Hosted finalization still fails closed without approval/configuration.
- `prisma/seed.ts`: existing guarded seed can preserve explicit strict certificate
  validation; an invalid-certificate bypass is rejected. No seed was run on a
  hosted target and no business dataset or seed algorithm was changed.
- `apps/api/test/staging-config-unit.test.ts` and `prisma/seed.test.ts`: regression
  coverage for hosted approval/project/origin/TLS/URL-routing safeguards and CORS.

Deployment/configuration documents are under `deploy/staging/` and
`docs/deployment/`; none is an active credentials file. See `staging-plan.md` for
the resources, environment separation, actual route paths, migration sequence,
prices, blockers and production checklist.

## Fresh execution

To avoid locking the running app's Prisma DLL or disturbing its database, the
candidate was tested in a secret-free temporary archive of the baseline with the
six changed application/test source files overlaid and SHA-256 recorded. No
ignored environment files or real provider credentials were copied. The overlay
hashes still matched the source worktree at completion.

Node: **24.15.0**. `npm ci --include=dev` succeeded using the unchanged lockfile.
Full command in that copy: `powershell -NoProfile -File scripts/qa-local.ps1 -Phase all`.
It created a separate disposable PostgreSQL cluster; existing local/hosted
application records were not selected. The cluster stopped normally afterward.

**Exit 0:** `QA_NONPAYMENT_PASSED (all); no provider or production credentials used.`

| Check | Actual result |
| --- | --- |
| Prisma validate/generate; fresh migration histories and schema drift comparisons | PASS; no unexpected differences |
| API build and TypeScript checks for source, tests and financial suites | PASS |
| Financial verification/finalization/worker suites | 125 passed |
| API regression suite, including 4 new staging-configuration/CORS tests | 196 passed, 0 failed |
| Payment unit / integration tests | 5 / 10 passed |
| Frontend checkout component/session tests | 9 passed |
| Seed unit / seed integration / category schema integration | 6 / 6 / 13 passed |
| Real Next/Express/PostgreSQL admin integration | PASS: auth, session expiry, CRUD, images, settings, packages, videos, categories, leaderboard privacy/publication and outages |
| Frontend component/unit suite; admin API proxy | 70 / 1 passed |
| Frontend and seed TypeScript; ESLint; frontend production build | PASS |
| Public refinement and production smoke checks | PASS |
| Public/admin browser suite, desktop and mobile | 6 passed |
| Checkout browser suite | 10 passed |
| Simulated paid-voting browser suite | 2 passed |
| Development-server navigation/refresh/session browser stability | 2 passed; desktop/mobile, no hydration or forced HMR reload failures |
| Deployment YAML/JSON syntax; noindex/manual-deploy declarations | PASS locally; cloud/provider validation pending |
| Git whitespace check; schema/migration source unchanged | PASS |

The selector CSS itself is unchanged from the previously verified fix: actual
Chrome and Playwright Firefox passed contrast, focus/keyboard, active/hover and
parent-to-child category filtering checks. Minimum tested text contrast 8.34:1;
focus contrast 9.53:1. This full run used Chromium; it is not a new Firefox run.

Evidence retained locally:

- `%TEMP%/talenthunt-staging-full-qa.log`
- `%TEMP%/talenthunt-staging-qa-current.json` (baseline, source overlay hashes, copy path)
- `%TEMP%/talenthunt-staging-runtime-audit.json`
- QA cluster: `%TEMP%/talenthunt-qa-3c9320533aa849f1a3ea147e41893d9c`
- Prior Chrome/Firefox selector evidence: `%TEMP%/talenthunt-selector-check-oh9PU0/`

## Outstanding deployment and acceptance items

1. Connect the Vercel, Render and Supabase accounts, inspect their ownership,
   existing subscriptions/quotas and assigned hostnames, and approve the resource
   and cost plan before creating anything. No isolated staging project has yet
   been approved/provisioned. Do not substitute the existing development project.
2. Review/commit the preparation, obtain exact-commit CI, then pin frontend/API/
   worker deployments to that reviewed version. No active environment file was
   changed during preparation.
3. Vercel's default 4.5 MB request cap is below the app's existing 5 MB upload cap.
   Full upload acceptance requires an approved hosting solution: the proposed
   20 MiB Public Beta with Pro/4 GB Fluid Compute has not been enabled. Account
   billing and hosted near-limit upload tests remain pending.
4. Test API key format is configured locally and differs from the old committed
   example. No webhook signing-key array is configured in that local provider
   file. Obtain/account-check test credentials privately; never use a historical
   example key or live credentials. Hosted checkout, actual signature delivery,
   callback and exactly-once allocation have **not** been executed in staging.
5. Email delivery cannot pass: only the durable pending email intent exists; no
   sender/provider/worker is implemented. No email feature was added under freeze.
6. Runtime dependency audit exits 1: **4 high, 0 critical**, in Prisma's CLI/config
   dependency chain (`prisma`, `@prisma/config`, `deepmerge-ts`, `effect`). The full
   install audit reports 11 findings (7 moderate, 4 high). `npm explain` confirms
   Prisma is also the generated client's optional peer. npm recommends a Prisma
   major upgrade; no forced upgrade or suppression was applied. This needs an
   explicit security review/decision before production readiness is asserted.
7. Hosted HTTPS/CORS/cookies, database isolation/permissions, image storage, mobile
   browsers, real Paystack test transactions/webhooks and error handling remain
   NOT RUN. Local mocks and prior development image checks do not prove staging.

The production domain, DNS, live payments, production data and credentials were
not activated or changed. The complete hosted and production readiness checklist
is in `staging-plan.md`; this report does not assert client-delivery readiness.
