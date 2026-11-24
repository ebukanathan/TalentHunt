# Paid voting repair execution report

Implementation is on fix/test-paid-voting-e2e, based on PR #77's existing code. Tests and demonstrations are reported separately from actual provider activity. No production financial writes, hosted migrations or live activation occurred.

The first finalization run passed 18/19 cases and found a concurrent inbox-upsert unique-key race. The unique-key loser now confirms the durable winner; the unchanged duplicate-webhook assertion passed. The corrected focused finalization gate passed **19/19**, with 19 owned fixture databases created/removed and zero template drift, in 43.83 seconds. A configuration guard test was subsequently added and is included in the full gate.

The first connected desktop/mobile browser run reached confirmed payment, evidence/allocation/outbox persistence, exactly ten additional votes and the correct scoped leaderboard. Both scenarios then failed a text locator expecting the contestant name alone, while the existing link includes the contestant number. The locator was corrected to the accessible link name, and a numeric leaderboard-cell assertion was added. The actual rows and screenshots showed the votes; this failed run is not counted as passed.

The corrected full command `npm run qa:local -- -Phase all` executed successfully on 2026-11-24, exited 0 and emitted `QA_NONPAYMENT_PASSED (all)`. Results:

| Suite | Executed / passed | Failed |
| --- | --- | --- |
| Vitest: existing allocator/isolation, P02 verification and new finalization | 125 / 125 | 0 |
| API regression | 192 / 192 | 0 |
| Initialization unit / PostgreSQL / web facade | 5 / 5, 10 / 10, 9 / 9 | 0 |
| Seed integration / category schema / QA guards | 6 / 6, 13 / 13, 2 / 2 | 0 |
| Web components / seed unit | 68 / 68, 5 / 5 | 0 |
| Existing public / checkout / connected paid browser scenarios | 6 / 6, 10 / 10, 2 / 2 | 0 |
| Total counted test cases and browser scenarios | **453 / 453** | **0** |

The real Next/Express/PostgreSQL admin/public integration script, API/web builds, test and application typechecks, lint, smoke checks, populated historical migration checks and schema drift checks also passed. Vitest created and removed all 105 owned fixture databases (58 allocator, 28 P02, 19 finalization), leaving none and zero template drift. All application targets were fresh dedicated local PostgreSQL databases; the disposable full-gate cluster was stopped afterward.

The new finalization suite passed 20/20 including its configuration guard. Twelve simultaneous independent clients produced one allocation, one counter increment and one email intent. Injected database failures at allocation, contestant update, audit and email-intent insertion left payment PENDING and evidence/allocation/counter/intent unchanged; retry then succeeded once. Five duplicate authenticated webhooks plus a commit-before-job-ack crash produced one allocation/intent. Invalid/closed/inactive/refunded/mismatched/unready/late purchases granted nothing. Receipt ownership, pending/failed provider behavior, isolated subcategories and LIVE/RANK_ONLY/HIDDEN projections passed.

Both desktop and mobile connected browser scenarios passed with a **simulated** hosted gateway and an actual HTTP provider-verification adapter. Package selection and a pending provider response left allocations unchanged. Server-verified completion committed one payment/evidence/allocation/intent, increased only the selected contestant by ten and rendered its subcategory board. Reload did not invoke another provider call or grant more votes. Screenshots were visually inspected. Example desktop fixture reference: `th-test-c79f6f17-588c-43f0-9453-75936bee639c`, receipt amount NGN 50.00, 10 votes, scoped leaderboard total 10. The fixture web server ran at `http://127.0.0.1:59788`; that ephemeral QA server is stopped. These are simulated fixtures, not genuine Paystack transactions.

Runtime recheck after starting the repaired branch:

| Request | Actual result |
| --- | --- |
| GET http://localhost:3000/contestants/test-performer/vote | 200; three packages, required email, working checkout button |
| GET http://localhost:3000/api/checkout/session | 200 |
| POST http://localhost:3000/api/checkout/initialize | 503; explicit missing Paystack test credentials message |
| GET http://localhost:4000/api/v1/leaderboard?categoryId=test-music&subcategoryId=test-solo | 200; LIVE, setupReady true, NO_VOTES |

The running app uses an independently owned local `talenthunt_paid_demo_*` database, not the hosted database from the old checkout. Before and after exercising missing-credentials initialization, counts for Payment, VerifiedPayment, VoteAllocation and TransactionEmail all remained zero. The launcher now retains its child servers in the development session rather than reporting detached servers that the command host could later clean up. Its syntax and persistent browser/API/database behavior were separately checked after the full gate; Next's generated local type paths were retained.

`npm audit --json` executed and reported 11 dependency advisories (4 high, 7 moderate, no critical). Dependencies and lockfile were not changed; these existing advisories remain a release consideration. The concurrent webhook unique-key race discovered above was fixed. No direct public vote-write or duplicate-allocation bypass was observed in the executed tests; this is not a comprehensive security audit.

Local diagnostics, full output, audit JSON and browser screenshots are retained under ignored `artifacts/qa/`. The real Paystack test-key file remained absent at the final runtime check. **A genuine Paystack test transaction and external signed-webhook delivery remain blocked**, pending secure local test-key/signing configuration and a reachable webhook URL. Receipt-email delivery is not implemented; only the durable confirmation intent is added. This repair is ready for that controlled provider test, not live-payment approval. No merge or live activation occurred.
