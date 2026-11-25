# Contestant image upload investigation — 25 November 2026

## Root cause and reproduction

The running integration pair was confirmed before changing source: Next server PID 28704 on port 3000 and Express PID 18704 on port 4000, both from `.worktrees/integration`. The integration launcher intentionally discarded inherited Supabase configuration, but provided no explicit replacement storage source. Neither storage setting was available to Express, so `readStorageConfiguration` returned null and no `SupabaseImageStorage` was constructed.

Clean-browser registration and editing reproduced the same response:

```text
POST /api/admin/contestants/<id>/image
HTTP 503
{"status":"error","code":"IMAGE_STORAGE_NOT_CONFIGURED","message":"Photograph uploads are not configured."}
```

The frontend forwarded the request to Express correctly. Express rejected it before multipart decoding, storage dispatch or journal creation. The frontend then discarded the useful error code and displayed its generic uncertain-write message. This was not a successful upload awaiting a stale confirmation read.

The reproduction registered one clearly marked contestant in the owned local integration database (`image-qa-mww2rmfk`, id `cmww2rnbs001pupfkuzf4dzan`). Registration returned 201 and its separate upload returned 503. Retrying the image operation left exactly one contestant with that marker. No existing contestant pointer changed, no image-operation row was added and no image URL was saved for this QA contestant. The record is retained; no reset or deletion was performed. Existing-contestant editing produced the same 503. Browser evidence contained zero page exceptions and zero forced HMR reloads, ruling out the previous development-server failure for these requests.

## Supabase read-only inspection

The older workspace's API environment contains storage configuration, while the integration environment does not. Its credential was accepted for a read-only bucket lookup (200). The existing `contestant-images` bucket is public, has a 5,000,000-byte limit, and accepts stored WebP objects. Read-only PostgreSQL metadata confirmed storage RLS and restrictive INSERT, UPDATE and DELETE policies excluding this bucket for `anon` and `authenticated` roles. No bucket or policy SQL was executed.

Listing only the two failed-upload prefixes found no objects. This agrees with the missing journal rows and proves those attempts did not leave uploaded files behind. Hosted write permission is not established by a successful metadata lookup; an approved upload test is still needed.

The exact contestant ID in the user's failed runtime requests was checked separately, read-only: the contestant exists, its image URL is absent, its image-operation count is zero and its matching Supabase prefix is empty. The same missing-configuration cause therefore applies to the reported record, not only the QA reproduction.

## Focused changes

- `scripts/integration-settings.cjs`: accept only explicitly supplied storage settings for a confirmed test project, reject partial/mismatched/public-key configuration, retain independent database/payment guards, and keep the storage secret out of Next. Only the public managed-image origin reaches the frontend.
- `scripts/start-integration.cjs`: read only the two storage fields from `SUPABASE_TEST_ENV_FILE`, require the separately selected `SUPABASE_TEST_PROJECT_REF`, and validate backend storage settings before launch. It does not automatically import another worktree's environment.
- `apps/web/src/lib/admin/image-errors.ts` and `components/admin/contestant-image.tsx`: distinguish missing configuration and provider uncertainty with allowlisted messages. Unknown writes still instruct the administrator to reload before retrying; raw provider messages are never shown.
- Runtime guard tests, image UI tests and the existing public/admin browser scenario cover the regression. The integrated development runbook documents explicit storage selection.

No upload algorithm, object naming, image normalization, compare-and-swap transaction, operation journal, cleanup schedule, registration endpoint, database schema, payment code or other feature was changed. The previous unrelated `.env.example` redaction is preserved outside this fix.

## Actual validation

| Check | Result |
| --- | --- |
| Integration runtime guards | 4/4 passed, including storage target validation and secret isolation |
| Frontend image unit/UI tests | 3/3 passed |
| Image API unit/HTTP/PostgreSQL tests | 14/14 passed; fixture storage only |
| Desktop/mobile production browser suite | 6/6 passed; fixture storage only |
| API build and API test type check | Passed |
| Frontend type check | Passed, including expanded browser test |
| Full frontend lint and final focused changed-file lint | Passed |
| Frontend production build | Passed; all 46 static-page entries generated |
| Actual running UI after fix, storage still disabled | Correct missing-configuration message; same 503/code, no image-operation rows, no duplicate contestant, original pointers unchanged |

The browser regression registers once, uploads a portrait, refreshes, simulates an unconfigured-storage failure, verifies the saved pointer survives refresh, retries a replacement, verifies a distinct saved URL and replacement pixel colour, refreshes again, and loads that replacement on the public profile. It also preserves the existing video, category, leaderboard and authentication checks. Existing image API tests cover provider/database/audit failure, concurrent replacement, journaled cleanup and preservation of attached/shared/legacy images.

The first ad-hoc browser probes needed harness corrections for a disabled pre-hydration file input and Next's separate route-announcer alert. The first isolated fixture runner passed all 14 API checks, then failed browser startup because its sanitization removed the disposable-database marker. Restoring that test-only marker and resuming its still-empty browser database yielded six passing browser checks and `IMAGE_QA_PASSED`. The outer PowerShell resume session reported exit 1 despite successful child results. A harmless control reproduced this shell behavior: a Node process explicitly exiting 0 but writing redirected stderr produced PowerShell exit 1; explicitly forwarding `$LASTEXITCODE` returned 0. The six browser checks and runner success marker are retained as the authoritative child results, not represented as a passing full financial QA gate. No assertions were disabled and no full financial gate was rerun for this scoped change.

Evidence outside the watched checkout:

- `%TEMP%/talenthunt-image-before-cM6jRc/result.json`: complete original registration/edit/retry failure reproduction.
- `%TEMP%/talenthunt-image-before-NgSC16/result.json`: actual running UI showing the corrected missing-configuration message using the same QA record.
- `%TEMP%/talenthunt-image-tests.log`: 14 passing API checks and the initial fixture-startup failure.
- `%TEMP%/talenthunt-image-browser-tests.log`: six passing desktop/mobile checks and success marker.
- `%TEMP%/talenthunt-image-tests-2X9W2p/browser-results`: browser screenshots.
- `%TEMP%/talenthunt-image-production-build.log`: production build output.

## Remaining activation and hosted acceptance

The user selected option 1, confirming that the existing Supabase project is approved development/test storage. The ignored integration settings now explicitly select that project and the existing backend storage credential file; only its two storage fields are imported. The credential source itself is unchanged. The identified application pair will be restarted once to apply that configuration. Real hosted upload, replacement, public image fetch and database attachment are recorded below after execution; this intermediate report does not yet claim they passed.

After the user confirms a dedicated test project, select it explicitly using the documented ignored local settings, restart the identified pair once to load them, and test the retained QA contestant. Preserve existing images, compare PostgreSQL URLs to journal-owned storage keys, confirm public GET and refresh persistence, and retain the existing retirement grace period. Do not run destructive cleanup or alter policies on an existing project to obtain a passing test.
