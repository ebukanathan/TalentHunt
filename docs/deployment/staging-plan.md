# TalentHunt staging deployment review

> Superseded on 26 November 2026 by `digitalocean-plan.md`. Vercel/Render resources
> and their templates below are historical proposals; do not provision/import them.

Prepared 26 November 2026. **Resource creation, deployment, hosted migrations,
seeding and purchases are awaiting approval. No staging URLs exist yet.**

## Release source and verified evidence

- Repository: `ebukanathan/TalentHunt`; branch `integration/all-completed-features`.
- Worktree: `.worktrees/integration`; baseline commit
  `f33fc7187b1c5ae4c3bcf4429012f9e718cbc172` (PR #79, still draft).
- [Exact-baseline CI](https://github.com/ebukanathan/TalentHunt/actions/runs/45701310328/job/139511825056)
  passed TypeScript checks, ESLint, Prisma validation/drift checks, API/frontend
  builds, 125 financial tests, 192 API tests, 70 frontend tests, proxy/seed/category
  integration checks and public/admin, checkout, paid-voting and stability browser
  suites. Provider calls in those suites are simulated, not hosted checkout proof.
- The leaderboard category/subcategory controls are links, not native selects.
  Commit `f33fc71` preserves their filtering and fixes contrast, hover, selected,
  keyboard-focus and disabled appearance. Actual Chrome and Playwright Firefox
  checks passed; text contrast was at least 8.34:1 and focus contrast 9.53:1.
- Prior image acceptance verified real uploads/replacements, database pointers,
  refreshes and public profiles against the explicitly approved development image
  project. That project is **not approved for staging database use**.
- Local ports 3000/4000 were confirmed as the integration Next/Express pair. The
  API process started at `42d8f86`; later baseline changes were documentation,
  credential-example removal and selector CSS. It is not a hosted staging pair.
- Staging preparation changes CORS to the configured admin frontend origin,
  permits only explicitly approved Supabase test finalization, and preserves
  strict certificate validation in the existing test-data seed configuration.
  Payment verification, allocation, ranking, authentication and upload algorithms
  are unchanged. See `staging-results.md` for current candidate checks.

## Resources proposed for approval

| Resource | Proposed configuration | Purpose |
| --- | --- | --- |
| Vercel `talenthunt-staging-web` | Separate project; Next.js; root `apps/web`; Node 24; stable provider-assigned HTTPS alias | Public/admin UI and existing same-origin API proxies |
| Render `talenthunt-staging-api` | Node 24 web service; Frankfurt; 512 MB paid compute; one instance | Express API and signed webhook intake |
| Render `talenthunt-staging-paystack-worker` | Node 24 background worker; same region/commit; one instance | Existing durable inbox processing and verified test vote finalization |
| Render `talenthunt-staging-image-cleanup` | Existing cleanup command hourly, minute 17 UTC | Retire only journal-owned expired staging upload objects under existing grace periods |
| Supabase `talenthunt-staging` | **New isolated project**, region near API; PostgreSQL plus `contestant-images` bucket | Synthetic QA data and images only |
| Paystack | Existing authorized TEST account; separate test API/signing credentials | Hosted test checkout, verification and webhook delivery |

No Render database, Redis, mail service, custom domain, domain purchase or new
application functionality is proposed. The cleanup job is subject to approval
with the other resources and will never point at existing development/production
images. No existing records or images are to be reset, copied or deleted.

Provider-assigned URLs/project reference remain `null` in
`deploy/staging/project-plan.json` until account access and resource approval.
Do not invent an `onrender.com` hostname, `vercel.app` alias, pooler host or CNAME.

## Charges requiring approval

Prices are USD, exclude taxes/overages, and must be confirmed against the selected
accounts before provisioning. Existing subscriptions may reduce incremental cost.

- [Vercel Pro](https://vercel.com/pricing): budget $20/month for one deploying seat
  plus metered use. Do not assume Hobby eligibility for this client project; its
  [terms](https://vercel.com/legal/terms) restrict Hobby use.
- [Render compute](https://render.com/pricing.md): API $7/month and worker
  $7/month. [Cron billing](https://render.com/docs/cronjobs) has a $1/month minimum
  per job plus execution time. Budget approximately $15/month combined at low use.
  A Render Pro workspace, if required/chosen, adds $25/month; do not upgrade it
  implicitly. Free web-service sleep is unsuitable for acceptance of dependable
  webhook processing, and a continuous worker needs paid compute.
- [Supabase](https://supabase.com/pricing): an available Free project can cost $0
  but has quotas and pauses after inactivity. Recommend a separate Pro staging
  organization/project at $25/month for an uninterrupted delivery review. An
  additional project in an existing paid organization starts around $10/month;
  inspect the account first, and do not alter the production organization's plan.

Indicative base total: **$35/month with eligible existing/free Supabase capacity;
$60/month with a new Supabase Pro organization; $85/month if a Render Pro workspace
is also needed.** These are estimates, not a guaranteed all-in spending cap.
Set available usage controls/alerts; additional seats, upgrades or overages need
separate approval. No paid services have been purchased.

## Configuration and secrets

Templates: `deploy/staging/web.env.example`, `api.env.example`, `vercel.json`,
`render.yaml`, `project-plan.json`. They contain no credentials and are not active
local environment files. Their placeholder values intentionally cannot deploy a
working payment environment.

Vercel project settings: root `apps/web`, Node `24.x`, framework Next.js, include
workspace files outside root. Apply `deploy/staging/vercel.json` explicitly as the
staging deployment's local config (CLI from repository root:
`vercel deploy --local-config deploy/staging/vercel.json`, after project linking).
The build-only loopback `DATABASE_URL` is an unused Prisma-generation placeholder;
Vercel receives no database or Paystack credentials. The header config prevents
indexing. A dedicated project's stable production alias can represent **staging**;
it does not authorize deployment to the school's production domain. Check Vercel
deployment protection permits the public test flow and callback. Keep deployments
manual and deploy only a reviewed CI-green commit.

Render uses repository root for workspace installs/builds. Create its private
`talenthunt-staging-api` environment group only after approval, then reference it
from API and webhook worker. `render.yaml` disables automatic deployments, omits
automatic migrations/seeds and never declares school domains. Render supplies
`PORT`; the API binds normally without a port change in source.

**Upload compatibility approval is required:** the existing image route accepts
5,000,000-byte files through Next. Vercel's default request-body cap is 4.5 MB,
including multipart overhead, so the upper part of that range will fail before
application validation. The documented 20 MiB larger-body **Public Beta** requires
Pro/Enterprise, Fluid Compute, Performance (4 GB) function memory, and
`VERCEL_SUPPORT_LARGE_REQUEST_BODY=1`, then redeployment. This is proposed, not
enabled. Obtain explicit approval for beta use and additional metered memory cost,
then test a near-limit image and accurate errors on staging. Without that approval,
full preservation of the existing upload limit is a deployment blocker; a reduced
limit or upload architecture change is not silently included in feature freeze.
See [Vercel's current function limits](https://vercel.com/docs/functions/limitations#request-body-size).

Database connections must be copied from the approved project's Connect dialog:
session pooler, port 5432, database `postgres`, matching project username,
`sslmode=require&sslaccept=strict&connection_limit=5&pool_timeout=10`.
Do not use transaction pooling, redirected hosts or invalid-certificate bypasses.
If certificate validation fails, resolve the provider trust chain before deploying.
`DEPLOYMENT_ENV=staging`, `STAGING_DATABASE_APPROVED=true` and the exact project ref
are explicit operator attestations, **not proof** that a project is isolated.
Independently inspect/approve the project before setting them. The guard binds the
database, storage project, Vercel HTTPS origin, callback and `sk_test_` mode.

Frontend browser requests use existing Next same-origin proxies, which call Render
over HTTPS. CORS advertises only the exact staging origin; it is not authentication.
No wildcard credential access is introduced. Existing admin/checkout cookies use
`Secure`, `HttpOnly`, `SameSite=Lax`, path `/`, and `__Host-` names, with no Domain.
The Next proxy relays cookies to the frontend host, so cross-site browser cookies
and `SameSite=None` are unnecessary. Verify these actual headers after deployment.

Generate independent admin-CSRF and checkout-session 64-hex secrets privately.
Store database/storage/Paystack secrets only in Render's private settings; checkout
secret stays server-side in Vercel. Only the public image origin has `NEXT_PUBLIC_`.
Do not reuse unrelated worktree environment files, old committed example keys,
production keys or the local admin password. Current local test key differs from
the historical example; that does not replace account/rotation review.

New Supabase project: use only public synthetic portraits, 5 MB WebP bucket limits
and reviewed `supabase/contestant-images.sql`. Restrict browser write roles. The
application accesses tables through Prisma, so disable the unused Data API on this
new project and verify anonymous REST/GraphQL cannot read app/auth/payment tables.
Supabase Storage public portrait reads must continue to work. Follow the provider's
[Data API security guidance](https://supabase.com/docs/guides/api/securing-your-api).
Do not alter settings or permissions on an existing project.

## Exact payment URLs (routes inspected in source)

Let `WEB` be the assigned staging frontend origin and `API` the assigned Render
origin, both HTTPS without trailing slashes:

| Operation | URL / method | Configuration |
| --- | --- | --- |
| Frontend checkout initialization | `POST WEB/api/checkout/initialize` | Existing browser-to-Next proxy |
| API initialization | `POST API/api/v1/payments/initialize` | Vercel `API_BASE_URL=API/api/v1` |
| Hosted checkout | Paystack-returned `https://checkout.paystack.com/...` | Never construct/replace its token |
| Browser callback | `WEB/payments/return` | `PAYSTACK_CALLBACK_URL` and Paystack TEST callback |
| Signed provider webhook | `POST API/api/v1/webhooks/paystack` | Paystack TEST webhook dashboard |
| Frontend status check | `POST WEB/api/checkout/status` | Existing secure checkout session |
| API status/verification | `POST API/api/v1/payments/:reference/status` | Existing server verification/finalization |

The callback is a browser return, not evidence of payment. The webhook requires a
publicly reachable HTTPS API; it bypasses frontend/preview authentication. Keep raw
request bytes and signature verification intact. Obtain TEST `whk_`/`whsec_` keys
privately; default legacy signatures remain disabled. Existing code supports
timestamped signed input, durable deduplication, server-side provider verification
of test domain/reference/amount/NGN, and transactional unique vote allocation.
Proof on the hosted staging system is still required; mocks do not establish it.

## Reviewed migration and data sequence (approval required)

1. Confirm account, project ref, billing choice and isolated ownership. Verify no
   TalentHunt application records/migration history exist in the **new** project;
   stop if any are found. Keep Supabase system schemas intact. Disable the unused
   Data API before application migrations; confirm database UTC.
2. Review the eleven unchanged historical migration files and their SHA-256
   manifest (`deploy/staging/migrations.json`). Do not use `migrate reset`, `db push`
   or shadow/reset operations against hosted databases. The separate guarded
   category NOT NULL cutover is **not** part of this deployment; do not apply it.
3. From the reviewed candidate, explicitly bind the approved staging URL in a
   private one-off environment and run `prisma migrate status`, then
   `prisma migrate deploy`, then status/validation again. Never fall back to a
   local/root `.env`. Record migration checksums/status without credentials.
4. Apply the reviewed storage SQL only to the same new project, with Data API
   disabled and restrictive browser write permissions checked.
5. Use the existing guarded test seed only against the approved empty project:
   one-off `NODE_ENV=test`, `SEED_ENV=test`, explicit `SEED_DATABASE_URL` with strict
   TLS and `SEED_SUPABASE_PROJECT_REF`. This CLI's demo competition slug is fixed;
   set `PUBLIC_COMPETITION_SLUG=talenthunt-demo`, or use a separately
   reviewed synthetic fixture dataset. Do not silently seed `talenthunt-staging`
   if the seed uses another slug. Templates default to the existing demo seed's
   `talenthunt-demo` slug. This temporary CLI environment is separate from
   the hosted services' production Node mode. Do not seed existing records.
6. Provision the first staging admin using the existing CLI, protected stdin,
   explicit `ADMIN_PROVISION_DATABASE_URL` and `ADMIN_PROVISION_CONFIRM=initial-admin`.
   It refuses to replace an existing admin. Deliver credentials privately.
7. Enter test payment/signing settings, enable finalization/webhooks only after
   the guard passes, deploy API and worker at the same approved commit, verify
   PostgreSQL connectivity separately from the liveness endpoint, then deploy web.
8. Set exact Paystack TEST callback/webhook URLs after provider URLs are assigned.
   Execute the hosted acceptance checklist and retain redacted evidence.

## Hosted acceptance and production readiness

All following items remain **NOT RUN** until infrastructure approval/deployment:

- TLS and redirect behavior; no unexpected school domain/DNS changes; noindex;
  exact CORS/preflight and secure-cookie headers; blocked invalid CSRF/origin.
- Database and storage connectivity; migration status/checksums; UTC; no anonymous
  access to private tables; only synthetic portraits publicly readable.
- Admin login, session across reload/navigation, logout, and rejection afterward.
- Create one contestant with image; verify exactly one record, stored WebP and
  database pointer; edit image; refresh public profile; failed/retried upload must
  preserve record identity and journal-owned cleanup behavior.
- Both category/subcategory scopes, keyboard selection/focus/contrast in Chrome
  and Firefox, two YouTube video limits, public groups, leaderboard visibility and
  voting interfaces; mobile layout and repeated navigation/refresh/network checks.
- Initialize Paystack TEST checkout, follow returned checkout URL, complete the
  provider's current test scenario, return to the exact frontend callback, observe
  actual signed webhook and worker verification. Verify one PAID payment, one
  verified test payment and one allocation/counter increment. Refresh status and
  replay a controlled valid test webhook without allocating votes again; invalid
  signatures must fail. Also test cancellation/provider failure safely.
- **Email delivery is blocked:** the code creates an immutable `TransactionEmail`
  PENDING outbox intent, but contains no sender/worker/provider integration. A mail
  environment variable cannot enable missing delivery. Under feature freeze, this
  preparation adds no email feature. Obtain an explicit limited-staging exception
  or separately approved scope before claiming the requested email criterion.
- Re-run complete candidate CI, inspect runtime dependency advisories, record
  browser/network logs and redact sensitive request headers/body fields.

Dependency review on this candidate reports four high-severity findings in
`prisma`, `@prisma/config`, `deepmerge-ts` and `effect` (zero critical). npm's suggested
resolution is a Prisma major upgrade to 7.10.1. The app's request handlers import
the generated `@prisma/client`; these findings are in the CLI/config dependency
chain, but that is not a completed exploitability assessment or an accepted risk.
Keep this visible for staging approval and production security review. No forced
upgrade, lockfile change or advisory suppression is included in this preparation.

Production sign-off requires all hosted checks, email scope resolution, approved
live Paystack account/final testing, backup/restore/monitoring review, production
secrets and separate resources, exact approved origins, and later domain/DNS
approval. Current code deliberately supports **test payments only**; production
live-payment enablement is not authorized or implemented by this staging task.
No CNAME is requested for staging. A future production project's exact
Vercel-supplied DNS target must be recorded before asking the school to change DNS.

Rollback means stop a staging rollout and redeploy the previous reviewed frontend,
API and worker versions together after schema-compatibility review. Preserve the
database, payment evidence, storage and migration history; never reset data or
delete worktrees to roll back. Staging costs continue until separately managed.
