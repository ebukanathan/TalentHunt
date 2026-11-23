# Voting engine verification with Vitest

Approved scope: 23 November 2026. Related issues: [T01 #20](https://github.com/ebukanathan/TalentHunt/issues/20), [P03 #15](https://github.com/ebukanathan/TalentHunt/issues/15), [P05 #17](https://github.com/ebukanathan/TalentHunt/issues/17) and [CI #21](https://github.com/ebukanathan/TalentHunt/issues/21). This verifies the internal engine merged in PR #74; broader payment/refund issues remain open. Paystack remains paused.

## Running the suite

Use Node 24 and PostgreSQL 18 with the repository lockfile. Vitest 5.1.1 and Node 24 declarations are API development dependencies. The existing Node test suites remain intact. `apps/api/vitest.config.mts` selects only `test/vitest/**/*.test.ts`; the API production build excludes these files. Database test files run sequentially, while race tests explicitly start concurrent allocation calls through independent Prisma clients.

On Windows:

```powershell
npm ci
npm run qa:local -- -Phase voting-vitest
```

The existing Windows helper starts a new temporary loopback-only PostgreSQL cluster, creates an empty `talenthunt_qa_admin` control database, sets test-only configuration and stops the cluster in `finally`. It preserves the disposable cluster files for diagnosis. It does not use the configured application database or stop the user's application servers.

On CI/Linux, supply an explicit empty localhost control database named `talenthunt_qa_admin`, then run:

```text
NODE_ENV=test
QA_DISPOSABLE_DATABASES=1
QA_TEST_DATABASE_URL=postgresql://YOUR_TEST_ROLE:YOUR_TEST_PASSWORD@127.0.0.1:5432/talenthunt_qa_admin
npm run qa:nonpayment -- voting-vitest
```

The `all`, `api` and `voting` QA phases also run Vitest and its separate TypeScript check. Existing PR CI runs `all` against its disposable PostgreSQL service; it supplies no production or provider credentials. Direct `npm run test:voting:vitest --workspace apps/api` requires `VOTING_VITEST_CONTROL_URL` set explicitly to that same dedicated control target, `NODE_ENV=test` and `QA_DISPOSABLE_DATABASES=1`. There is no fallback to `DATABASE_URL` and no dotenv loading in the test harness.

The dedicated test role needs CREATEDB and permission to create the test-only NOLOGIN role used by the SQL-access regression. The temporary Windows cluster and CI PostgreSQL service supply their isolated owner role. These permissions must not be granted to a production application account to run this suite.

JSON and JUnit results are written to `artifacts/qa/voting-vitest.json` and `artifacts/qa/voting-vitest.xml`, retained by the existing CI artifact step. Automatic test retries, `.only`, and passing with zero selected tests are disabled. A failing assertion remains a failing test.

## Isolation and cleanup

The harness validates environment, protocol, hostname, exact control database name, absence of URL query/fragment overrides, and absence of application tables before creating anything. Hosted, production, implicit and ambiguous targets are refused without printing credentials. Child migration processes receive an explicit test URL with provider and inherited database credentials removed.

Each suite creates one randomly named template and applies the nine unchanged repository migrations. Prisma checks the template for zero schema drift. Every database test clones that empty migrated template into a newly generated database and asserts the application tables are empty. This preserves genuine Prisma transaction commits, database constraints, row locks and concurrent connections. No transaction mock redirects the engine into a test rollback wrapper.

Teardown disconnects every registered client, then drops only that test's database. Names must match the current random run ID and exist in the harness's private creation registry. Cleanup uses no FORCE, wildcard deletion, row truncation, disabled trigger, or arbitrary supplied database identifier. Suite teardown removes its template, compares created/removed counts and queries PostgreSQL to confirm zero databases remain for its run. A cleanup failure fails the suite. Original allocation/evidence immutability remains enabled throughout.

Test helpers live only under `apps/api/test/vitest`. They create synthetic purchase and verification records in these clones. The application gains no test endpoint, verification writer, provider adapter or runtime configuration change. Test HTTP requests are restricted to loopback; an attempted external fetch fails loudly. Existing purchase retry tests inject a provider stub that must never be called.

## Coverage and assertions

| Requirement | Executable assertions |
| --- | --- |
| 10/50/100 packages | Parameterized grants, stored prices/votes, one audit per allocation; combined grants total exactly 160. |
| Duplicate processing | Five sequential replays through independent clients preserve the original allocation and ledger. |
| Concurrent duplicate delivery | Three rounds of 24 simultaneous requests, synchronized start and three distinct PostgreSQL backend connections; exactly one allocation, increment and audit. |
| Concurrent different payments | Six grants to one contestant total exactly 320, with no lost increments. |
| Payment eligibility | PENDING/FAILED/REFUNDED, PAID without evidence, browser assertions, authority/environment and verified-fact mismatches grant nothing. |
| Relationship integrity | Contestant/competition/package/category/subcategory mismatches roll back the synthetic purchase/scope transaction. Inactive selections reject allocation. |
| Transaction failures | Fail allocation insert, counter update, audit insert and deferred commit. Earlier 100 votes remain; retry produces exactly 150 once. BigInt overflow leaves no allocation or audit. |
| Cached totals | Compare exact cached BigInt values with allocation sums and attribution/status checks after successful, duplicate, concurrent, failed and retried operations. Deliberate drift is reported without repair. |
| Independent rankings | Same-named children under different parents remain separate; both have rank 1, with shared ties 1,1,3, pagination and zero-vote isolation. |
| Visibility | Real HTTP standings, profiles and cards obey LIVE/RANK_ONLY/HIDDEN and no-store responses. Existing full regressions retain final-publication and HTML/RSC/privacy coverage. |
| Write protection | Public/anonymous routes, administrator mass assignment and untrusted SQL-role writes cannot create votes or change totals; no test-only ingress exists. |
| Windows and retries | Opening is inclusive and closing exclusive for new reservations. Closed purchases create no payment/scope/initialization. Existing STARTED/READY/UNKNOWN/REJECTED retries preserve reference, snapshot, payment count and zero votes, without provider dispatch. Changed selection conflicts. |

The approved closing policy is unchanged: a new allocation requires voting open at processing time and verified paidAt inside the explicit window. An already committed allocation is safe to replay after closure. A previously initialized PENDING purchase can return its existing stored checkout URL after closure; that is the current initialization contract and does not authorize a new grant. Late settlement/refund handling must be reviewed before enabling the provider.

## Security findings and integration readiness

The audit reports vulnerable package entries separately from executable engine tests. At this review, the full `npm audit --json` report contains **4 high and 7 moderate entries**, arising from four underlying advisories. `npm audit --omit=dev --json` still reports **4 high entries** through the Prisma chain; they must not be dismissed as absent from the production dependency graph. `npm ls` identifies Prisma/config 6.19.0, deepmerge-ts 7.1.5, Effect 3.18.4, and minimatch 10.2.6 under typescript-eslint 8.72.0.

- [DeepmergeTS recursive graph stack exhaustion](https://github.com/advisories/GHSA-ggr8-5vv4-36mx): high, propagated through Prisma configuration.
- [Effect RPC AsyncLocalStorage context contamination](https://github.com/advisories/GHSA-38f7-945m-qr2g): high, in the same dependency chain.
- [Effect TemplateLiteral regular-expression denial of service](https://github.com/advisories/GHSA-7589-6fvf-x4pw): high, in the same dependency chain.
- [Minimatch globparts amplification denial of service](https://github.com/advisories/GHSA-g3hv-75wg-m249): moderate, propagated through lint tooling.

These package/advisory matches are confirmed audit findings. The audit does not demonstrate exploitation through the voting API, and the suite is not a penetration test. Npm proposes a Prisma major upgrade for the high findings; no forced upgrade or unrelated remediation is applied in this testing PR. Compatibility/remediation remains a release gate under #53/#21. The installed advisory-affected versions predate this work.

Passing simulations establishes the tested internal allocation boundary. It does not verify Paystack signatures, provider facts, environment separation at a deployed verifier, live settlement, transactional payment/outbox finalization or refund execution. Those integrations remain absent or deferred, and the existing hosted deployment/privilege review is still required. A security-clean paid-voting release is not approved by this suite. Paystack remains disabled pending a separate integration decision and resolution of these gates.

## Execution record

The initial executed run passed all **70 tests**: 58 fresh-database cases and 12 guard checks, with zero failed/skipped tests, in 119.36 seconds. Allocation/concurrency/rollback/HTTP checks all passed without engine changes. A later test cleanup edit briefly introduced an undefined fixture variable; TypeScript caught it, and it was corrected before the final regression run.

The final local full run again passed all **70 Vitest tests**, with zero failed/skipped tests. It recorded **58 fresh fixture databases created, 58 removed, zero remaining and zero template schema drift**. Existing regressions passed **192 API checks, 68 frontend checks, 5 seed unit checks, 6 seed integration checks, 13 category/schema checks, 2 QA guards and all 6 desktop/mobile browser scenarios**, together with real Next → Express → PostgreSQL integration, API/web/test/seed/Vitest TypeScript, lint, production builds and both public HTTP/privacy suites. The runner exited successfully with `QA_NONPAYMENT_PASSED (all)` in `artifacts/qa/vitest-full-validation.log`. The schema-drift gate passed, including the existing finalization fixture's exactly two expected required assignment columns, and the disposable cluster stopped cleanly.

Concurrency results: all three 24-delivery races through independent PostgreSQL clients committed exactly one 100-vote allocation and audit per payment. Six different concurrent purchases accumulated exactly 320 votes. Every failure-injection case retained the earlier 100 votes and its original allocation/audit, then retried to exactly 150 once. Ledger/cache assertions passed after grants, duplicates, concurrent operations, rollback and retry. No functional engine failure was reproduced in the executed scenarios. Both audit commands exited nonzero because of the documented advisories; those exits are not counted as passing security checks.

Changes are limited to Vitest tests/configuration, the isolated database harness, API development dependencies/types and lockfile, separate test typechecking, QA commands/result artifacts, and documentation. Voting services, public routes, Prisma schema and all migration files are unchanged. The lockfile also refreshes one optional wasm-runtime patch while installing the test toolchain; no Prisma/framework major upgrade is included. The workflow file is unchanged: its existing full QA command runs Vitest through the updated script and retains JSON/JUnit/full-audit artifacts. The production-only audit was executed locally and documented here; adding a separate workflow audit step was omitted because the current GitHub OAuth token lacks workflow-write scope. PR CI reruns the full gate on the submitted commit. Paystack remains paused, no test-only production endpoint exists, and no production financial record or hosted migration was touched.
