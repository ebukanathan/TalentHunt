# Leaderboard visibility and result publication

Issue [#32](https://github.com/ebukanathan/TalentHunt/issues/32). The approved policy distinguishes provisional visibility from publication of final results. New and existing competitions default to `HIDDEN`, with `resultsPublishedAt = null`. The additive `20261116120000_add_leaderboard_visibility` migration preserves existing totals and all historical migrations.

| State | Public leaderboard | Public contestant list/profile totals |
| --- | --- | --- |
| Unpublished `LIVE` | Provisional rankings and actual totals | Included |
| Unpublished `RANK_ONLY` | Provisional rankings; `totalVotes` omitted | Omitted |
| Unpublished `HIDDEN` | `HIDDEN`, empty items, no pagination/rank data | Omitted |
| Published | Final rankings and actual totals, `LIVE` | Included |

The entire public API enforces this policy even when an administrator visits it. Complete private standings are available only through the protected admin endpoint. Privacy is enforced before JSON serialization and before Next.js receives public data. Public contestant ordering stays contestant number/ID order and does not reveal hidden ranks. Responses use `Cache-Control: no-store`; database reads use one repeatable-read snapshot for policy and data.

## API contracts

Public `GET /api/v1/leaderboard?page=1&pageSize=25` returns the existing success envelope with:

```json
{
  "competition": { "id": "selected-show", "name": "Selected show" },
  "visibility": "RANK_ONLY",
  "publishedAt": null,
  "state": "PROVISIONAL",
  "items": [
    { "id": "person", "competitionId": "selected-show", "name": "Performer", "number": "001", "slug": "performer", "imageUrl": null, "rank": 1 }
  ],
  "pagination": { "page": 1, "pageSize": 25, "total": 1, "pages": 1 }
}
```

The abbreviated competition in this example also carries the existing public slug/description/status/voting dates/currency fields. `LIVE` and final entries add `totalVotes` as an exact decimal string. `HIDDEN`, `EMPTY`, and `NO_VOTES` have empty public `items` and `pagination: null`. Draft/missing selected competitions return 404 without falling back to another show. Page must be 1–100000 and pageSize 1–100. Unknown or repeated query parameters, including attempted visibility overrides, are rejected.

`GET /api/v1/admin/leaderboard` uses the same pagination controls, always returns exact totals, and includes inactive contestants with `isActive: false` and `rank: null`. Active contestants rank ahead of the inactive appendix. Draft competitions remain privately manageable. Session, active-admin and selected-competition checks apply, and private responses are no-store.

Existing public `GET /contestants` and `/contestants/:id` omit `totalVotes` entirely in `HIDDEN`/`RANK_ONLY`. Their private admin counterparts retain required totals. Public cards/profiles hide the vote display when that field is absent; they do not substitute a fabricated zero.

## Administration and publication

Competition Settings exposes `LIVE`, `RANK_ONLY`, and `HIDDEN`. Its existing protected `PATCH /api/v1/admin/competition` accepts `leaderboardVisibility` plus the current `expectedUpdatedAt`. The server serializes changes under the competition row lock, rejects stale saves, and writes `LEADERBOARD_VISIBILITY_CHANGED` as well as the existing settings event. No-op saves create no extra events.

Completing a competition does not publish it. The separate **Publish Results** control opens a native modal confirmation. The administrator must type the exact competition name and explicitly confirm. The protected `POST /api/v1/admin/competition/publish-results` requires:

```json
{
  "competitionId": "selected-show",
  "expectedUpdatedAt": "2026-11-16T12:00:00.000Z",
  "confirmationName": "Selected show"
}
```

The server requires a matching selected ID, exact current name, current revision, `COMPLETED` status, and positive actual votes for at least one active contestant. Missing/incorrect confirmation is rejected. Uncompleted, empty/all-zero, stale, or cross-selection attempts fail without publishing. Existing session, Origin, JSON and CSRF guards protect the action.

Publication sets `resultsPublishedAt` and `LIVE` together and writes `RESULTS_PUBLISHED`, plus a visibility audit when applicable, in one transaction. Audit failure rolls the change back. Concurrent confirmations create one publication; retries after a lost response return that same publication without duplicate events. Concurrent visibility/publication saves cannot overwrite a stale revision silently. Clients cannot set publication timestamps through ordinary PATCH.

Publication permanently releases full standings and locks visibility afterward. A database CHECK constraint permits a publication timestamp only with `COMPLETED` and `LIVE`. The activity feed displays both new audit event types. Visibility governs subsequent requests and cannot retract information already viewed or downloaded.

## Ranking and empty states

Only active contestants in the selected competition receive public ranks. PostgreSQL ranks exact stored `BigInt` totals before pagination; no totals are converted to floating point. Equal totals share competition ranks (1, 1, 3), with contestant number then ID determining display order within ties. Public pages link to profiles and include portrait fallbacks.

When all active totals are zero, the public view says **No votes have been recorded yet** and returns no meaningful ranks or winner claims. Private rows retain their actual zeros with null ranks. Publication is rejected for an empty/all-zero eligible roster. `HIDDEN` always shows only the unpublished/private message, without revealing whether votes exist.

Published views continue reading current stored totals and active membership; this feature does not create a historical result snapshot or freeze contestant records. No votes or financial records are generated at runtime. Payment processing remains paused. Pagination bounds response size, but the ranking window still evaluates the selected roster; large-scale/live polling optimizations require separate measurement.

## Verification and rollout

Run `powershell -NoProfile -File scripts/test-admin-images.ps1` from this checkout. It initializes fresh loopback-only PostgreSQL databases, applies migrations, validates/generates Prisma, runs API/test typechecks and regressions, real Next/Express/PostgreSQL checks, and schema drift verification, then stops the cluster. The new suite requires `LEADERBOARD_TEST_DATABASE_URL` to be a fresh migrated local `talenthunt_leaderboard_test[_suffix]` database and refuses hosted, routed, production, or populated targets. Focused command: `npm run test:leaderboard --workspace=apps/api`.

Run frontend tests, lint, typecheck, production build and HTTP smoke checks separately. See [verification evidence](leaderboard-verification.md).

No hosted database migration or real result publication is part of this delivery. Deploy the migration and updated API/frontend as a coordinated rollout, draining older API instances before making visibility controls available: the older public API does not enforce these rules. This branch includes current main and the video feature from merged PR #47; ordered video responses, management forms and embeds are retained. The existing running checkout and original workspace edits are preserved.
