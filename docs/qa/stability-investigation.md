# Application stability investigation — 25 November 2026

## Runtime identity and failure evidence

Both applications were running from `.worktrees/integration`, branch `integration/all-completed-features`, HEAD `d5975e1da6bd5a21f18b9fe3e48596ea1133b0fe` plus the pending integration repairs. The runtime was not the older root checkout. Initial Windows process evidence identified launcher 26872, API 25880 owning port 4000, Next CLI 18600 and Next server 6276 owning port 3000. Next's child compilation worker was 22048. Other Node processes were Codex helpers. There were no competing Next servers at investigation start.

A Chromium probe repeated homepage, contestant list, profile, voting page and admin login twice. It recorded 17 server `reloadPage` messages with `HMR hash mismatch`, four interrupted visits, aborted first-party scripts and a login button left disabled because hydration had not completed. No HTTP asset 404/500 was observed. Next repeatedly rebuilt without source edits and accumulated high CPU usage. Installed Next hot-reloader code emits that message when client and server HMR versions differ. This explains both interrupted public rendering and the disabled admin form; removing its pre-hydration credential protection would hide the symptom.

Read-only backend evidence showed health, competition, contestant and category endpoints returning 200. PostgreSQL accepted `SELECT 1`; one active dedicated test administrator and a readable session table were present. API origin/proxy settings pointed at the same backend on port 4000. No failing CORS, Express authentication or database request explained the browser reload loop. Paystack configuration was isolated to backend test mode and was not involved in these public/login requests.

## Controlled comparisons and fix

A bounded cold control server used the identical source/API, a separate existing ignored build directory and logs outside the checkout. Nine visits passed; one cold compilation exceeded the navigation timeout and passed on the second cycle. Both login visits hydrated. There were zero forced reloads, page errors or failed first-party assets. That owned control process was stopped afterward.

Disabling only `experimental.turbopackFileSystemCacheForDev` on the original development server produced ten of ten successful visits, enabled login on both cycles, zero hash-mismatch reloads, zero JavaScript errors and zero failed first-party assets. External YouTube requests canceled by intentional navigation were classified separately. The public APIs then responded in 13–69 ms. This identifies the restored development graph/HMR invalidation path as the failure mechanism; byte-level corruption of a particular cache file is not proven.

A controlled write probe also showed refresh activity after generated artifact writes inside the checkout and none after outside writes. Continuous runtime logs were therefore moved outside the watched source tree. Production build caching and application/RSC caching remain unchanged. No dependency, business feature, authentication architecture or migration was rewritten.

The launcher now reports readiness only after complete streamed homepage/login responses, database-backed competition and health reads, and a successful admin CSRF proxy response. It fails on occupied application ports and never automatically kills an unknown application. Readiness failures are bounded and do not trigger restart loops.

## Regression coverage and outstanding verification

The new development browser regression exercises three navigation/refresh cycles over seven public/admin routes on desktop and mobile, captures JavaScript errors, first-party asset failures and forced HMR reloads, then verifies login, refresh-persistent session and logout. It uses fresh guarded local fixture databases and external temporary reports. Its HTTPS test terminator forwards HMR WebSocket upgrades; the first test attempt exposed that missing fixture capability and failed hydration, and is retained as a failed harness run.

Earlier incomplete gates are not counted as passing: one Windows Prisma DLL lock was caused by validating while the backend was running; one financial concurrency test reported a PostgreSQL connection failure. That PostgreSQL log also records a Windows shared-memory child-process reservation failure (error 487). These events do not establish an application logic defect and were not hidden by changing financial assertions. A second development-test attempt found a cold-compile warm-up timeout and asset requests canceled by the test's immediate refresh. Warm-up now has a separate bounded allowance, and measured navigation waits for asset completion before refreshing. No failed asset is filtered out to obtain a pass.

## Final full gate: passed

`npm run qa:local -- -Phase all` exited 0 with `QA_NONPAYMENT_PASSED (all)`. The unmodified financial assertions passed. External evidence: `%TEMP%/talenthunt-stability-full.log`, with retained disposable PostgreSQL files in `%TEMP%/talenthunt-qa-6ebea88a11764236ad19c523fe86737c`.

| Check | Actual result |
| --- | --- |
| Prisma validate/generate, fresh migrations, drift comparisons | Passed; no schema difference, except the exact separately gated fixture contract explicitly checked by its guard |
| Backend build, test/Vitest type checks | Passed |
| Financial Vitest suite | 125/125 passed |
| API suite | 192/192 passed |
| Payment initialization unit/database and web checkout | 5/5, 10/10 and 9/9 passed |
| Seed integration and category migration suites | 6/6 and 13/13 passed |
| Real Next/Express/PostgreSQL admin integration | Passed, including auth, expiry/outage, videos, taxonomy, groups, privacy and settings |
| Runtime/readiness and QA guards | 7/7 passed |
| Frontend unit and slow-proxy regression | 69/69 plus 1/1 passed |
| Seed type check/unit tests | Passed, 5/5 unit tests |
| Frontend lint, generated route types, type check, production build | Passed |
| Production HTTP privacy/refinement and smoke suites | Passed |
| Public/admin desktop/mobile browser suite | 6/6 passed |
| Checkout desktop/mobile browser suite | 10/10 passed |
| Simulated payment-to-vote desktop/mobile browser suite | 2/2 passed |
| Development navigation/refresh/session suite | 2/2 passed; 84 measured route/refresh loads, zero JavaScript errors, first-party asset failures or forced HMR reloads |

The final running-instance verification is recorded separately after starting the validated pair. No additional business functionality was introduced.

No production database record, administrator credential, migration history or live provider configuration was changed. Real Paystack checkout completion remains separate from simulated transport/browser coverage; the earlier real test initialization reached checkout but Cloudflare prevented completing a transaction. External webhook delivery still requires test signing keys and a publicly reachable HTTPS endpoint. No claim of complete client-delivery readiness is made while gates remain outstanding.
