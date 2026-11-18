# Public website verification

Verified 18 November 2026 (Africa/Lagos), parent #42 and validation #52. The refinement stack begins at privacy PR #48; no PR is merged automatically.

## Executed checks

- 130 API tests passed on fresh migrated loopback PostgreSQL databases, including bounded card selection, strict pagination, all leaderboard visibility policies, unauthorized access, publication/concurrency and existing video/admin/payment-fake regressions.
- 50 frontend tests passed, including navigation semantics, route announcements, image-origin restrictions/loading, profile eligibility, exact kobo selection, date/status boundaries, identity-only metadata and server pagination.
- Five seed unit tests and six seed integration checks passed. The initial integration run hit existing CLI timeouts during parallel Next compilation; a fresh database and sequential retry passed without seed-code changes.
- Real Next.js → Express → PostgreSQL integration passed for public package selection, no-payment behaviour, uncached discovery, inactive-profile exclusion, HTML/RSC leaderboard privacy, confirmed publication and existing admin/video/image/authentication flows.
- API build and API test TypeScript, web lint (no warnings), web TypeScript, seed TypeScript and the production web build passed. Next's existing advisory initially stopped the build; the identical retry passed with the notice retained. See [security assessment](public-website-security-assessment.md).
- Production HTTP scenarios verify LIVE/RANK_ONLY/HIDDEN HTML/RSC and bot metadata; bounded pagination; image optimisation restrictions; lazy zero/one/two video markup; sharing PNG dimensions and cache headers; robots/sitemap; package/closed-window states; all-zero/unpublished/final messages; and empty/missing/failure/mismatch/draft/inactive handling.

The HTTP fixture binds only to loopback and does not contact a real payment provider. Database integration uses guarded fresh local databases; no hosted competition data was changed or results published. No Paystack processing, financial models or migration history changed. The development database migration history remains as it was before refinement.

## Reproduce public production HTTP checks

Use a disposable validation build, not a deployment artifact. In PowerShell, from the repository root:

```powershell
$env:NEXT_PUBLIC_CONTESTANT_IMAGE_ORIGIN = 'https://portraits.example.test'
npm run build --workspace=apps/web
npm run test:public:refinement --workspace=apps/web
npm run test:smoke --workspace=apps/web
```

If Next stops solely for its existing security reminder, repeat the identical build command; do not suppress security settings or mistake a successful retry for a patch. The production harness starts/stops only its own server. On Windows it needs permission to terminate its own process tree; cleanup is bounded and verifies that its port is released. The first restricted cleanup run was stopped, corrected and rerun with appropriate process privileges.

Run `npm run lint --workspace=apps/web`, `npm run typecheck --workspace=apps/web`, `npm test --workspace=apps/web`, API build/test typechecks and the guarded local-database integration commands when changing these paths. Deployment builds must use the actual managed image origin and trusted `SITE_URL`, as documented in [the implementation guide](public-website-refinement.md).

## Manual mobile and desktop review

Interactive browser verification is pending. The earlier audit's browser host was unavailable and native Computer Use could not verify the browser URL. Source, SSR, HTTP and native-control semantics are not evidence of a completed visual/keyboard/screen-reader review. No Lighthouse, axe or Core Web Vitals score is claimed.

1. Check home, both lineup pages, a profile, videos, leaderboard and package selection at 320/360/390px, 768px and 1440px, portrait/landscape and 200% zoom. Text/actions should wrap without page overflow; the standings table may scroll within its labelled region.
2. Use only Tab/Shift+Tab, Enter/Space, arrows and Escape. Verify menu expanded state, Escape focus restoration, logical tab order, visible focus, pagination heading focus, native package selection and announced summaries. Check a screen reader's headings, labels, loading/error messages and image alternatives.
3. Test long names/bios, missing/failed portraits, empty rosters/packages and unavailable APIs. Check zero, one and two videos, descriptive iframe titles, lazy loading and keyboard/fullscreen playback.
4. Use disposable fixtures for statuses, voting boundaries and LIVE/RANK_ONLY/HIDDEN/publication. Inspect API payloads, full HTML/RSC, head metadata, sharing responses and sitemap. Hidden totals/ranks must be absent; all-zero results must not imply meaningful rankings. Do not publish or alter hosted results for this review.
5. Inspect managed image variants and throttled loading; compare the actual main-content paint before/after. Verify no payment/provider request, email field or false success flow appears. Refocus/back-navigate a tab after fixture status changes to check refresh behaviour.

Keep #30/#31/#42 open until their complete manual acceptance and PR review are satisfied. Framework patching in #53 is a separate prerequisite before production release; broader CI work in #21 remains unfinished.
