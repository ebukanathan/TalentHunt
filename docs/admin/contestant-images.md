# ADMIN-03: contestant photographs

Issue: https://github.com/ebukanathan/TalentHunt/issues/35

## Setup

1. Run `supabase/contestant-images.sql` in the intended Supabase project. It creates a public `contestant-images` bucket with a 5,000,000-byte limit and WebP-only stored objects, and denies browser-role insert/update/delete even if other permissive policies exist. It refuses incompatible existing bucket settings. Originals are accepted by Express and re-encoded; only WebP reaches Storage.
2. Put `SUPABASE_URL=https://YOUR_PROJECT.supabase.co` and your `SUPABASE_SECRET_KEY=sb_secret_...` in the API environment only. Both blank disables image operations. Partial/unsafe settings fail startup with redacted errors. Do not put the secret in the web environment or any `NEXT_PUBLIC_*` variable. Legacy JWT service-role keys are not accepted.
3. Run `npx prisma migrate deploy` against the intended database, then regenerate the Prisma client and restart the API. The new migration adds only an image-operation journal; no existing records or historical migrations are modified.
4. Schedule `npm run images:cleanup --workspace apps/api` every minute on one backend worker. Each invocation examines at most 20 objects; adjust scheduling for backlog size. Alert on a growing PENDING/CLEANUP/DELETING backlog or repeated failures. The command prints counts only and exits nonzero for database/configuration failures.

The bucket and its restrictive policies must be provisioned before exposing uploads. Supabase-hosted credentials are not required by the automated test suite. For a deployment check, use a dedicated test project: verify public image GET succeeds, anon/authenticated direct upload/overwrite/delete fail, and backend upload/replace/cleanup work. Never run destructive storage checks against existing production objects.

## Admin flow

Register a contestant at `/admin/contestants/new`; successful creation opens the edit page. Choose a JPG/JPEG, PNG or WebP file, then Upload photograph. Preview is local until the server confirms success. The UI distinguishes transfer progress from processing/saving, supports retryable errors, and redirects expired sessions to login. Photograph operations and metadata saves are separate; retrying a failed image upload cannot create a second contestant. Existing legacy images remain readable until explicitly replaced or removed.

`POST /api/v1/admin/contestants/:id/image` accepts multipart with exactly one `image` file. `DELETE` at the same path accepts `{}` JSON. Both require a valid admin cookie, exact configured Origin, same-origin fetch metadata when supplied, and the session-bound `X-CSRF-Token`. Next forwards only its own session cookie to a fixed backend path, verifies authentication/CSRF before buffering, and bounds chunked input. Existing JSON routes retain their limits and CSRF requirements. Generic create cannot assign an image URL; patch can only preserve the current URL. Use the dedicated operations to change or remove it.

Files are checked against actual signatures and decoded content, declared MIME and extension; SVG, malformed/truncated images, animation and unsafe filenames are rejected. Limits: 5,000,000 input bytes, 16,000,000 pixels, 8192 pixels per side, two in-flight uploads per API process, 30-second multipart deadline, 10-second image processing deadline, 15-second provider request deadline. Re-encoding strips metadata, auto-orients, and fits within 2000 × 2000 without enlarging. No original bytes or image blobs enter PostgreSQL. UUID keys live under `contestants/<competitionId>/<contestantId>/` and never overwrite objects.

## Recovery and concurrency

The journal is written before provider dispatch. The pointer change, journal attachment, retirement of the old managed object and audit entry share one database transaction. Compare-and-swap prevents stale replacement or removal from overwriting a winner. Upload failure, timeout or transaction error leaves the old pointer intact unless a commit was already completed; ambiguous errors instruct the admin to reload. We never eagerly delete an object based on an uncertain commit result.

Unattached operations are quarantined for 24 hours to cover interrupted/unknown uploads. Retired objects have a one-hour grace period. Cleanup claims operations under a row lock before provider I/O; attachment only accepts PENDING operations. Claims expire after a minute; network operations are bounded to 15 seconds, and failed deletion uses capped exponential backoff. Deletion is idempotent. Cleanup checks all current contestant references, retains referenced objects, and accepts only journal-owned keys matching the configured canonical URL. It never fetches or deletes external/legacy URLs. DELETED journal metadata is retained for traceability. A shared legacy reference can prevent cleanup; retention is preferred over deleting a referenced photo.

Public `/contestants` and `/contestants/:id` read only active contestants in the selected competition. Both use the existing safe image/fallback component. Profiles display biography, competition context and exact vote totals; no payment/voting functionality is added.

## Verification

Run `npm run test:admin:images --workspace apps/api` with `ADMIN_IMAGES_TEST_DATABASE_URL` pointing to a **fresh migrated localhost** database named `talenthunt_images_test[_suffix]`. Tests refuse populated or non-local databases. Run the full API suite with its other dedicated test database variables, `npm test --workspace apps/web`, lint, frontend/API builds, and the Next/Express/PostgreSQL integration test. The integration tests use real HTTP/Prisma/PostgreSQL plus an injectable storage implementation for deterministic failure and concurrency tests; hosted Supabase access and RLS require the separate deployment check above.
