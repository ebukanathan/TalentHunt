# Leaderboard visibility verification

Verified 17 November 2026 (Africa/Lagos). Issue [#32](https://github.com/ebukanathan/TalentHunt/issues/32). Branch `feat/leaderboard-visibility`, rebased on main `fac86b2` including merged video PR #47. The user approved the schema, API and permanent-publication policy before implementation. This is a separate checkout from the running app and the original workspace's uncommitted admin fixes.

Completed checks:

- **129/129 API tests passed, with no skips**, including all existing public/admin/payment/video regressions and the new HTTP/PostgreSQL visibility and publication suite.
- **34/34 frontend tests passed**, including video regressions, three public modes, absent vote displays on public cards/profiles, exact large totals, hidden/rank-only response validation, private full standings, all-zero/final states, visibility controls, the closed native confirmation dialog, and the separate CSRF-protected publication request.
- **5/5 seed unit tests passed**, along with seed typechecking.
- API build/test TypeScript checks, frontend lint (no warnings), frontend typecheck and the production Next.js build passed. Production HTTP smoke checks passed for real rendering, loading shells, pagination, large totals, empty/missing/error/mismatch and not-found states.
- All six migrations applied to fresh disposable loopback PostgreSQL databases. Prisma validation and client generation passed. Schema drift check reported no difference. The cluster stopped after verification.
- Real **Next.js → Express → PostgreSQL integration passed** for hidden public standings, all-zero live messaging, live totals, rank-only HTML and streamed-data redaction across homepage/list/profile/leaderboard, private full totals, hidden completed-but-unpublished results, confirmation errors, and successful final publication. The video management/embedding/removal and existing auth/CRUD/image/settings/overview/expiry/outage flows also passed.
- API cases verify default hidden/unpublished state, exact BigInt totals and global tie ranks before pagination, inactive exclusions, drafts and selected competition scope, anonymous/inactive/revoked access, CSRF/Origin checks, strict input and timestamp mass-assignment rejection, stale saves, empty/all-zero publication rejection, no-op audits, audit failure rollback, idempotent concurrent publication, visibility/publication races and visibility locking after publication. Public endpoints enforce the same restrictions even when sent an administrator cookie.
- Diff review confirmed no changes to Paystack implementation, financial models, or the five historical migrations. New feature fixtures leave Payment and VoteAllocation empty. Existing payment regressions use their existing isolated local provider fake. No real provider or hosted database was used for this work.

The initial production typecheck caught a BigInt literal in the web integration fixture, whose TypeScript target is ES2017. The fixture now uses the BigInt constructor; the final build/typecheck and full integration passed.

Browser access reported **the browser access host is unavailable**. Interactive visual/mobile/keyboard confirmation testing was not performed. Static markup, native dialog semantics, responsive CSS and HTTP/RSC checks are not a substitute for that browser review; it remains an explicit PR review item.

The production build reported an existing Next.js 16.4.2 security advisory notice and initially stopped after compilation. Repeating the normal build completed successfully with the notice still reported. The isolated dev server emitted the same notice; the harness now reports that warning and retries the identical command once using Next's supported retry behavior. It also classifies startup failures without forwarding request logs and terminates only its own Windows process tree on cleanup. The final integration passed. No framework version or security setting was changed. Dependency security review remains separate from this feature.

No migration or result publication was performed on the hosted development database. The existing app processes remain untouched, and the video feature from merged PR #47 is retained. Coordinate API/frontend rollout as described in the [feature contracts](leaderboard-visibility.md). Merge still requires user approval.
