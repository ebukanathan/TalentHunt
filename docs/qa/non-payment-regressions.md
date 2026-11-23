# Non-payment integration and regression testing

QA-01 brings the completed public category and scoped-leaderboard commits onto a branch targeting `main`. The earlier CAT-04/CAT-05 PRs merged into parent feature branches after CAT-03 reached main, so their source and regression tests did not reach the default branch. The QA branch retains the performance-video models, editor, validation and public player. No migration or production data change is part of this work.

## Local checks

Use Node.js 24 LTS and the repository lockfile. After `npm ci` and Prisma generation, `npm test` runs the database-target guard, non-payment API unit tests, frontend unit tests and seed unit tests. It does not select the payment initialization suites.

The complete gate needs disposable local PostgreSQL. On Windows, from the repository root:

```powershell
npm ci
npm exec --workspace apps/web -- playwright install chromium
npm run qa:local
# Focused reruns use the same safe workflow:
powershell -NoProfile -File scripts/qa-local.ps1 -Phase browser
```

`qa-local.ps1` starts a new PostgreSQL cluster bound to loopback on a free port, creates its empty `talenthunt_qa_admin` control database, runs the selected phase and stops that cluster in `finally`. It never resets an existing database. PostgreSQL 18 defaults to `C:/Program Files/PostgreSQL/18/bin`; use `-PostgresBin` for another installation. Browser HTTPS needs OpenSSL (Git for Windows' bundled executable is detected, otherwise use PATH or `QA_OPENSSL_BIN`). Temporary fixture files are retained under the printed temporary directory.

Tailwind's class-source discovery is explicitly limited to `apps/web/src` using its documented [source base-path configuration](https://tailwindcss.com/docs/detecting-classes-in-source-files#setting-your-base-path); generated browser reports and build output do not belong to its inputs. Keep redirected console logs outside the checkout (for example, `$env:TEMP/talenthunt-qa.log`) as well. Local browser verification exposed repeated development reloads after generated output was written into the wider workspace.

On Linux/macOS or an isolated CI service, provision an empty localhost control database named exactly `talenthunt_qa_admin`, set the following environment variables and run:

```text
NODE_ENV=test
QA_DISPOSABLE_DATABASES=1
QA_TEST_DATABASE_URL=postgresql://YOUR_TEST_ROLE:YOUR_TEST_PASSWORD@127.0.0.1:5432/talenthunt_qa_admin

npm ci
npm exec --workspace apps/web -- playwright install --with-deps chromium
npm run qa:nonpayment
```

The role needs permission to create databases. The runner rejects hosted URLs, production mode, alternate control databases, query overrides, missing opt-in and control databases containing application tables. Each suite receives a newly created database with a random suffix and the existing migrations. There are no DROP/reset/truncate operations. Do not point this workflow at Supabase or an existing application database.

`npm run qa:nonpayment -- api`, `integration`, `checks` or `browser` runs one phase. `all` is the default. The runner removes inherited provider credentials, explicitly disables Paystack/Supabase configuration, and never loads a provider-backed application server. Existing assignment/history tests use synthetic local fixtures; no test values represent real votes, payments or revenue.

## Regression coverage

The API gate selects every non-payment `*.test.ts` file automatically. It covers authentication, CSRF/session expiry, settings/packages, dynamic taxonomy, assignment integrity/history locks, images, videos, public scope/eligibility, independent rankings, visibility and reviewed publication. A child-process security test sends malformed compressed JSON to public, admin and unknown paths; each is rejected with a sanitized 415 and the API must stay alive. Plain JSON and normal malformed-JSON handling remain checked. Login controls stay disabled until hydration, with a native POST fallback so pre-hydration submission cannot put credentials in a GET URL; unit and JavaScript-disabled browser regressions enforce this. Contestant edit fields likewise wait for hydration to prevent early input being overwritten.

The real Next.js → Express → PostgreSQL integration runs separately from production builds. Frontend tests, TypeScript, lint, Prisma validation/generation, API builds, seed unit/integration checks, category-constraint/legacy-upgrade checks, production web build, both production public HTTP suites and drift checks are part of the complete gate. The legacy-upgrade suite gets an empty dedicated database and applies historical migrations itself; no existing database is downgraded or reset.

All normal fixture schemas must have zero drift. The existing CAT-03 finalization test deliberately applies the separately gated NOT NULL contract in its dedicated fresh database. Its read-only diff must contain exactly the two expected assignment-column nullability differences against the expansion schema; any additional difference fails. The runner never executes that diff or relaxes the finalized columns. A regression rejects missing, altered or extra DDL in this exception.

Headless Chromium runs at desktop 1280×900 and mobile 375×812 widths. It exercises real login, category/child creation and renaming, dependent assignment selectors, biography edits, portrait uploads, assignment changes and zero/one/two videos through the browser. It then verifies grouped public navigation, profile context/back-links, vote-selection context, scoped rank isolation, visibility changes, mobile menu focus/Escape, page-width overflow, loading/error recovery and unavailable-page states. Test-only fault/image controls exist only in the guarded fixture server, outside application routes. Browser image delivery uses the fixture storage's actual optimized bytes; this does not test a hosted Supabase bucket or real YouTube playback.

The browser fixture refuses populated/non-local databases and never reuses a running application or port. It serves the production `.next` build through a loopback-only HTTPS terminator, exercising production origin checks and secure admin cookies. OpenSSL creates a one-day certificate/key under the temporary directory; only the test browser/readiness probe ignore its trust error, and no system trust store is changed. The focused browser phase builds first; the full gate reuses its immediately preceding production build. This avoids development hot reload interfering with input/navigation. The fixture creates no Payment or VoteAllocation rows. Failure traces/screenshots and the HTML report are under `artifacts/qa/`.

## Pull request checks

`.github/workflows/nonpayment-qa.yml` runs on PRs targeting main and pushes to main, with Node 24, PostgreSQL 18, commit-pinned official actions, read-only repository permissions and no production/provider secrets. The required functional status is **Non-payment integration and regression**. Configure branch protection to require it after its first successful PR run; branch-protection settings are not changed by this PR. The default-branch run will be verified after an approved merge.

The dependency-audit step retains the complete npm report and visibly warns on advisories. Its `continue-on-error` applies only to that report, never to tests/builds. It is not a security-clean attestation. The QA runtime fixes pin Next.js and matching ESLint config to 16.4.6, resolve body-parser to 2.4.0, and reject encoded JSON before decompression. Remaining Prisma/effect/deepmerge and lint-tooling findings need a compatibility/reachability review under #53; this PR does not force Prisma 7 or a transitive major override. They remain release-review items even when functional CI passes.

## Staging verification

Before release, use a separately approved non-production Supabase project to verify bucket permissions, upload/replace/remove/retry behavior and scheduled cleanup. Local injected storage and browser image delivery cannot establish hosted bucket/RLS correctness. Confirm actual YouTube playback/embedding permissions and perform screen-reader and additional-browser checks. Do not use production contestants, votes, payments or photographs as test fixtures. Paystack development and paid launch remain paused; no automatic merge is performed.
