# E03 checkout execution report

Test-mode checkout only; no production financial records, actual Paystack calls, email sends or live activation. Source baseline is main `c8d7296`; feature branch is `feat/e03-test-checkout` for #12.

## Executed checkout tests

| Group | Executed / passed | Result |
| --- | --- | --- |
| PAY-01 unit tests | 5 / 5 | Test/live configuration guard, strict email/financial DTO, boundaries, server kobo transport and sanitized outcomes |
| PAY-01 PostgreSQL integration | 10 / 10 (including parent suite) | Integrity cutover, explicit dates, immutable safe summary, stale prices, eight-request race, provider ambiguity, restart and database failure recovery |
| Web checkout unit/security | 9 / 9 | Signed cookie/expiry/tampering, CSRF, session binding, bounded JSON, strict DTO, fixed redirect, throttling, disabled mode, sanitization and accessible markup |
| Real desktop/mobile browser scenarios | 10 / 10 | Next production server → Express → isolated PostgreSQL; five scenarios at each viewport |

Initial executed gates caught a prohibited Next route `runtime` export under Cache Components and a Playwright configuration merge that started the inherited non-checkout server. The route uses Node's default runtime and a dynamic session handler; checkout now overrides one complete Playwright config object. TypeScript environment fixture typing and an inferred initializer return union were corrected. The first full API run reported 190/192 passed because an existing reservation fixture omitted the newly required dates (one failing child plus its parent). That fixture now provides a valid window without weakening any assertions; its reservation and reassignment checks passed on the next run. That next API run reported 183/184 passed after an unrelated admin-overview fixture failed opening its initial local PostgreSQL connection; its eight nested checks did not execute. The unchanged final rerun passed all 192 API checks, including admin overview. No application workaround or assertion relaxation was applied for the connection failure. These earlier failed build/setup/test attempts are retained and are not counted as passing full gates.

After the checkout corrections, the focused real browser suite completed with **10 passed in 58.7 seconds**, zero failed/skipped. Database and unit groups above actually executed and passed.

## Final full regression run

`npm run qa:local -- -Phase all` completed successfully with `QA_NONPAYMENT_PASSED (all)` in `artifacts/qa/checkout-full-validation-4.log`. The temporary cluster stopped cleanly. No test failed or was skipped in this final run.

- Voting Vitest: **70/70**, including 58 isolated database cases and 12 guards, in 123.18 seconds. All 58 generated fixture databases were removed; zero remained and template drift was zero.
- Existing API: **192/192**. Payment unit **5/5**, payment PostgreSQL **10/10**, checkout web security/unit **9/9**.
- Existing frontend: **68/68**. Existing desktop/mobile browser **6/6** (2.0 minutes) and checkout browser **10/10** (52.4 seconds).
- Seed unit **5/5**, seed integration **6/6**, category/schema **13/13**, QA/schema guard **2/2**.
- Real Next → Express → PostgreSQL admin/public integration, API/web/test/Vitest/seed typechecks, lint, production builds, public HTTP/privacy suites and final schema-drift comparisons passed. The existing gated finalization fixture retained exactly its two expected required assignment columns; all other targets had no schema difference.

Concurrency/rollback/cache assertions in the engine suite passed again: same-payment races allocated once, different payments accumulated exactly, injected database failures rolled back allocation/counter/audit together, and retries preserved the ledger/cache invariant. LIVE/RANK_ONLY/HIDDEN restrictions and independent subcategory leaderboards passed. The checkout layer introduces no allocation caller.

## Concurrency and financial integrity

Eight simultaneous requests with the same session-bound attempt produced one persisted Payment/reference and exactly one simulated provider initialization. Rapid button activation and reload also retained one purchase. A response deliberately dropped after the server finished recovered the same purchase without another dispatch. UNKNOWN/pending retries stayed unresolved without a checkout URL or fresh reference. Replacing the browser cookie blocked the saved attempt instead of silently deriving a new purchase.

All checkout fixtures remained PENDING; VerifiedPayment and VoteAllocation counts stayed zero, and the contestant's fixture total remained 12. The API integration's injected failure after provider acceptance left an unresolved reservation which could not redispatch after recovery. Cached totals, payment snapshots and migration history were not rewritten. Callback success parameters, client price/vote fields, cross-origin requests and direct public vote mutations granted nothing.

Each fixture uses a guarded fresh local test database. The temporary cluster stops in `finally`; no hosted database or production environment is read to select targets. No application test-control endpoint exists. Browser provider navigation is intercepted and server initialization is injected; no actual Paystack transaction was created. Desktop/mobile screenshots were inspected and horizontal overflow checks passed.

## Security findings and readiness

Executed `npm audit --json`: **4 high and 7 moderate vulnerable package entries**, zero critical, unchanged from the baseline. High findings involve Prisma/config, deepmerge-ts and Effect; moderate findings involve minimatch and typescript-eslint tooling. The command exits nonzero because of these findings; the audit is not a passing security check. See the linked advisories in [the voting test report](voting-vitest.md). No forced dependency major upgrade is included.

The corrected purchase eligibility mismatch is covered by tests: OPEN alone no longer permits new reservations with missing dates or absent integrity cutover. Existing persisted retry behavior remains intact. The suite is not a penetration test or proof of a deployed payment system's security.

The checkout slice is ready for review in test mode, with default flags still off. Verification/finalization, authenticated webhook inbox, transactional outbox/email, protected receipt/status capabilities, late-settlement/refund policies, deployment-wide abuse limits and advisory remediation remain separate release gates. No payment or voting confirmation is claimed from initialization or browser callbacks, and no live activation is approved.
