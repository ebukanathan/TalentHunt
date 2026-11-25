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

## Final running-instance verification: passed

The validated application pair started once from `.worktrees/integration` at application commit `34d31cfc53c319f48598d7bbf968a4c59c0b1632` on `integration/all-completed-features`. A later documentation-only commit records these results; no application files changed after validation/startup. The launcher returned `ready: true` only after its complete-response checks.

| Process | PID | Role |
| --- | --- | --- |
| npm development command | 31864 | Owns launcher command |
| Integration launcher | 33964 | Owns API/Next children |
| Express | 18704 | Sole listener on port 4000 |
| Next CLI | 19932 | Integration checkout's Next executable |
| Next server | 28704 | Sole listener on port 3000 |
| Next transform worker | 33356 | Child of Next server, integration build output |
| Codex helpers | 15204, 30392 | Tool processes, not application listeners |

Clean Chromium contexts at widths 1280 and 375 completed 48 measured visits and 48 refreshes over eight public/admin routes (three cycles per viewport), followed by admin navigation and session checks. All 96 route/refresh loads returned 200. Browser console errors, JavaScript exceptions, failed first-party JavaScript/CSS and forced HMR reload counts were all zero. Both contexts logged in, retained their session after navigation/reload (session endpoint 200), logged out and received 401 afterward. PostgreSQL was reachable, one dedicated test administrator was active, and the session table remained readable.

The running UI showed two public video frames and both editor values, isolated category/subcategory grouping, all three vote packages, taxonomy management and the LIVE visibility control. Production browser tests separately exercised visibility changes and editing while preserving videos. Desktop homepage, mobile profile and login screenshots were visually inspected. YouTube is intercepted in automated checks; external playback is not claimed.

Final evidence is outside the checkout at `%TEMP%/talenthunt-stability-final-D6SSu1/result.json` with screenshots; runner output is `%TEMP%/talenthunt-stability-final-probe-2.log`. The first ad-hoc running-instance probe stopped after 24 visits because its request context lacked a base URL; it was a probe error, not counted as a passing complete run. Correcting that probe did not change application code or restart servers.

The final read-only local ledger contained two purchases (one PENDING, one PAID), one `paystack` / `TEST` verification record and one allocation. Those counts were identical before and after the complete final probe. The additional verified local test purchase existed before that probe; this investigation did not submit a purchase, modify totals or observe its external checkout completion. No LIVE evidence was present. Original production records were not accessed or changed.

## Separate browser-profile warning

The running server also forwarded a warning from an existing browser: React found an extra `cz-shortcut-listen="true"` attribute on `body`. That attribute does not appear in application source. This is consistent with a browser extension modifying HTML before hydration; the exact installed extension was not inspected. Clean automation contexts had no hydration/console errors. Use an extension-free browser profile for client acceptance; do not suppress hydration warnings across the app to conceal externally injected DOM changes.

No additional business functionality was introduced. Local stability/build checks are complete; hosted deployment configuration, external playback, actual provider checkout acceptance and real external webhook delivery remain separate acceptance checks. The earlier real checkout attempt was obstructed by Cloudflare; the newer local TEST verification record is reported as observed ledger evidence, not a browser-completed transaction witnessed by this investigation.

No production database record, administrator credential, migration history or live provider configuration was changed. External webhook delivery still requires test signing keys and a publicly reachable HTTPS endpoint. Receipt-email delivery is not implemented. Passing local stability gates does not establish that these external acceptance checks have been completed.
