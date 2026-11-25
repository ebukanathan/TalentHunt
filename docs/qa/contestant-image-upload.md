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

## Approved activation and hosted acceptance — passed

The user selected option 1, confirming that the existing Supabase project is approved development/test storage. The ignored integration settings explicitly select that project and the existing backend storage credential file; only its two storage fields are imported. The credential source itself is unchanged. The verified launcher and its owned children were stopped once, then the pair restarted from image-fix application commit `42d8f860ccf4f273e76743751e6fb17f6fe8ad32`. Backend PID 33364 and Next CLI PID 26992 were reported ready. Database target, ports, administrator and Paystack test configuration were preserved. A later documentation-only commit records the results; no application code changed afterward.

Real Supabase storage, the running Next/Express pair and the owned local PostgreSQL database were used for hosted acceptance. No storage response was simulated:

| Hosted acceptance | Actual result |
| --- | --- |
| Invalid PNG upload | HTTP 400 `INVALID_IMAGE`; useful UI error, zero image-operation rows and no saved URL |
| Retry with valid initial portrait | HTTP 200; returned URL matched PostgreSQL and survived admin-page refresh |
| Replace that newly uploaded QA portrait | HTTP 200; distinct URL matched PostgreSQL and survived refresh |
| Direct public object retrieval | Both objects returned 200 `image/webp`; decoded dimensions and initial/replacement colours verified |
| Public contestant profile | Correct replacement URL and loaded image after refresh at widths 1280 and 375; screenshots visually inspected |
| Duplicate prevention | Exactly one contestant with the original QA marker; hosted acceptance submitted no new registration |
| Storage ownership | Exactly two objects under the owned QA prefix; both match operation-journal keys |
| Current/retired object state | Current image ATTACHED; previous QA image CLEANUP under the existing grace period; no pending/untracked QA objects |
| Other records | Acceptance mutation requests targeted only the QA ID; other pointers were preserved during read-only final verification |
| Payments/features/authentication | Payment counts unchanged; existing two-video profile and three voting packages available; admin session and logout passed |
| Development-server stability | Zero page exceptions and zero forced HMR reloads |
| Production build with selected public image origin | Exit 0; no storage credential passed to build; live payments disabled. This was build validation, not a hosted deployment |

No existing image was deleted. The two necessary QA images remain journal-tracked; the former QA version is retained under the existing retirement policy. No cleanup task was run, no storage bucket/policy was altered, no production application records were changed, and no live payment was enabled. The read-only policy database was confirmed to match the selected storage project.

The first hosted probe completed all three image requests (400, 200, 200) and persistence checks, then stopped because its read-only Node-response inspection incorrectly called `status()` instead of reading `status`. Remaining checks resumed without uploads. An initial preservation assertion also incorrectly assumed there were no image journal entries for any other contestant in this active application. It was replaced with the relevant checks: acceptance requests target only the QA ID and other saved pointers remain unchanged across read-only verification. Those existing entries were preserved. No extra upload, deletion, restart or product-code change was used to get a pass.

The final read-only acceptance process exited 0 with all checks true. Evidence:

- `%TEMP%/talenthunt-image-hosted-bxn9dP/result.json`: actual 400/200/200 responses, image URLs and initial persistence checks, plus the initial probe error.
- `%TEMP%/talenthunt-image-hosted-final-PaLoPN/result.json`: complete passing combined evidence, explicitly recording read-only continuation.
- `%TEMP%/talenthunt-image-hosted-final-PaLoPN/public-profile-1280.png` and `public-profile-375.png`: visually inspected real hosted-image screenshots.
- `%TEMP%/talenthunt-image-hosted-final-2.log`: final acceptance output and success checks.
- `%TEMP%/talenthunt-image-configured-production-build.log`: production build with the selected public image origin, exit 0.
