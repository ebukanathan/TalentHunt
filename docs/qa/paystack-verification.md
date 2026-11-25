# P02 verification and webhook test execution

Branch: feat/p02-test-verification, baseline main 3b97f8f. Test-mode verification and durable intake only; finalization, votes and email remain deferred. All test fixtures use dedicated local PostgreSQL databases and simulated provider responses; no production transaction or live Paystack request is involved.

The first focused command failed before tests because the runner referenced a root Vitest binary while it is installed in the API workspace. The workspace launcher was corrected. The first executed focused suite passed 27/29 checks and exposed two failures in lease concurrency/retry timing. Raw SQL compared Prisma's UTC timestamp-without-time-zone columns against bound timestamps using the database session timezone. Explicit UTC conversion fixes premature expiry/due work; the original assertions remain intact and timezone cases were added. Those failed attempts are retained in artifacts and are not counted as passed gates.

## Executed results

The corrected focused run completed with **35/35 tests passed**, zero failed/skipped, in 51.45 seconds (`artifacts/qa/paystack-focused-3.log`). It created/removed all 28 owned case databases, with zero remaining and zero template drift. Tests cover the three database timezones explicitly, in addition to signatures, transport/fact validation, worker concurrency and recovery.

The final `npm run qa:local -- -Phase all` run completed with **QA_NONPAYMENT_PASSED (all)** in `artifacts/qa/paystack-full-validation.log`. The temporary PostgreSQL cluster stopped cleanly. All executed groups passed with no failed or skipped tests:

| Group | Passed |
| --- | --- |
| Vitest verification and voting | 105/105: 35 new verification checks plus 70 existing voting checks; 150.39 seconds |
| Isolated Vitest databases | 86 created, 86 removed, zero remaining; template drift zero |
| Existing API | 192/192 |
| Initialization unit / database / checkout web | 5/5, 10/10, 9/9 |
| Existing frontend | 68/68 |
| Existing desktop/mobile browser | 6/6, 2.3 minutes |
| Checkout desktop/mobile browser | 10/10, 1.6 minutes |
| Seed unit / integration | 5/5, 6/6 |
| Category/schema / QA guards | 13/13, 2/2 |

Real Next → Express → PostgreSQL integration, API/web/test/Vitest/seed typechecks, lint, production builds, public HTTP/privacy tests and final schema-drift checks passed. The pre-existing finalization fixture retained exactly its two expected required assignment columns; other targets had no schema differences. The extended upgrade rehearsal preserved populated legacy contact links, initialization/payment/allocation/counter values and historical migration checksums. An injected DDL failure rolled back both new table and enum, and the normal migration added an empty inbox. Supabase-style default grants could not expose the inbox to public roles.

## Integrity and security conclusions

Eight simultaneous authenticated deliveries committed one logical inbox job. Two workers claimed once; completed duplicate delivery caused no further verification. Lease expiry recovered crashed work, stale owners could not overwrite the winner, and retry timing remained correct under UTC/Africa-Lagos/Pacific-Honolulu. Concurrent attempts to reuse a provider transaction across two purchases produced one awaiting result and one review result. Reuse against already persisted payment evidence was also rejected. Failure after provider verification retained a recoverable lease with no partially stored facts; recovery used the same job.

Every new pending-purchase success/mismatch path left Payment PENDING, VerifiedPayment/VoteAllocation absent and contestant counters unchanged. The reused-evidence negative test retained only its pre-existing simulated evidence. Inbox facts remain separate from allocation authority; the new layer cannot finalize a purchase or send a confirmation.

Executed `npm audit --json` still reports **4 high and 7 moderate package entries**, zero critical. These are the existing Prisma/config/deepmerge-ts/Effect and lint/minimatch findings documented in the [voting test report](voting-vitest.md). Dependencies and lockfile are unchanged. This is an outstanding release gate, not a passing security audit or proof of a deployed system's security.

The merged checkout's post-merge CI also completed successfully ([run 45348759530](https://github.com/ebukanathan/TalentHunt/actions/runs/45348759530)). This branch requires its own PR CI/review and remains unmerged. The implementation does not activate webhooks/checkout in the shared app, perform a hosted migration, create real Paystack transactions or authorize live payments. #14 remains open for the finalizer handoff; #7/#15, protected receipts, email delivery, late/refund policy and deployment abuse/monitoring reviews remain subsequent work.
