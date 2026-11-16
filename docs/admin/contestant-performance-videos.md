# Contestant performance videos

Issue [#46](https://github.com/ebukanathan/TalentHunt/issues/46). Each contestant has zero, one, or two ordered YouTube videos. Videos are optional on both registration and edit forms. Paste or edit a URL to add or replace a video; clear it or use its Remove button and save to remove it. Empty positions are compacted when saved.

## Input and API contract

The existing protected `POST /api/v1/admin/contestants` and `PATCH /api/v1/admin/contestants/:id` accept `videoUrls`, an optional array containing at most two URL strings. The same-origin Next.js facade forwards it through the existing session, active-admin, Origin and CSRF guards. No separate video write endpoint is exposed.

```json
{
  "videoUrls": [
    "https://www.youtube.com/watch?v=aB0_-123456",
    "https://youtu.be/ZyX98765432"
  ]
}
```

- On create, omitted or empty `videoUrls` creates no videos.
- On PATCH, omission preserves existing videos. `[]` removes all. A supplied array replaces the entire ordered set, atomically with any other contestant fields.
- Blank strings represent optional form slots and are removed after validation. Indexed errors retain their original input slot, for example `videoUrls.1`.
- Duplicate canonical IDs are rejected even if their URL forms differ. Invalid input returns the existing 400 validation envelope without partial writes. Identical replacements preserve row IDs and produce no extra audit entry.

Parsing uses the standard URL parser locally, without network requests, redirects, metadata lookup, or thumbnails. HTTP and HTTPS are accepted; credentials, nonstandard ports, whitespace/control characters within a URL, overlong values and invalid IDs are rejected. Video IDs must match `[A-Za-z0-9_-]{11}`.

| Exact allowed hostname | Supported paths |
| --- | --- |
| `youtube.com`, `www.youtube.com`, `m.youtube.com` | `/watch?v=ID`, `/shorts/ID`, `/embed/ID` |
| `youtu.be` | `/ID` |
| `youtube-nocookie.com`, `www.youtube-nocookie.com` | `/embed/ID` |

Hostnames are case insensitive through URL parsing. Short/embed paths permit an optional trailing slash. Watch links must contain exactly one `v` parameter. Other query parameters and fragments are discarded when extracting the ID. Lookalike hosts, redirects, playlists without a video, and unsupported paths are rejected. Validation establishes URL syntax and identity; private, deleted, age-restricted, or embedding-disabled YouTube videos can still be unavailable in the player.

All existing admin and public contestant list/detail endpoints return `videos`, ordered by ascending position, with this projection:

```json
{
  "videos": [
    { "id": "generated-video-row-id", "youtubeVideoId": "aB0_-123456", "position": 1 }
  ]
}
```

Zero videos returns `[]`. URLs are never persisted or returned. Public competition/activity visibility rules are unchanged; inactive contestants and draft competitions do not expose videos.

## Database and concurrency

The additive `20261116090000_add_contestant_videos` migration adds `ContestantVideo` with a cascading contestant foreign key. It leaves every prior migration and payment model intact. CHECK constraints permit only positions 1 and 2 and valid video IDs. Unique `(contestantId, position)` and `(contestantId, youtubeVideoId)` indexes enforce two slots and no duplicates, including direct concurrent database writes.

PATCH acquires the existing contestant `FOR UPDATE` lock before reading the previous set. Changed videos are deleted and recreated under that lock so position swaps work without intermediate uniqueness conflicts. The contestant update and before/after audit records commit in the same transaction. Audit failure rolls everything back. Concurrent replacements serialize, with the last committed complete set winning; they cannot interleave two lists or exceed two videos. Scalar-only PATCH requests preserve videos.

## Public display

The profile hides the entire Performance Videos section when empty. Players use a responsive 16:9 container, lazy loading, contestant-specific titles and fullscreen support. Iframe sources use a fixed `https://www.youtube-nocookie.com/embed/` origin plus a validated video ID. The web response schema validates count, IDs, uniqueness and order; the rendering boundary also validates IDs. No submitted URL becomes an iframe source.

## Verification

From the repository root, `powershell -NoProfile -File scripts/test-admin-images.ps1` starts a fresh loopback-only PostgreSQL cluster, creates separate guarded databases, applies all migrations, validates/generates Prisma, runs API build/typechecks and the full API and real Next/Express/PostgreSQL integration suites, checks schema drift, then stops the cluster. It does not use the configured development database. PostgreSQL 18 binaries are expected at the path specified in the script.

For a focused run after applying migrations to an explicit fresh local `talenthunt_videos_test[_suffix]` database, set `CONTESTANT_VIDEOS_TEST_DATABASE_URL` and run `npm run test:contestant:videos --workspace=apps/api`. Tests refuse production, hosted/routed targets, incorrect database names, and populated databases. Frontend checks: `npm test --workspace=apps/web`, lint, typecheck and production build. New API tests create no payment records or provider requests.
