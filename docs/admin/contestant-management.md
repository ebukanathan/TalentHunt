# ADMIN-02: contestant management

ADMIN-01 is merged in [PR #36](https://github.com/ebukanathan/TalentHunt/pull/36). ADMIN-02 uses its Express session, active-admin and CSRF guards. Sign in at `/admin/login`, then visit:

- `/admin/contestants`: paginated list, name/number/slug search, all/active/inactive filters and activation controls.
- `/admin/contestants/new`: register a contestant.
- `/admin/contestants/[id]/edit`: edit an existing contestant, including inactive contestants.

The implementation plan was presented before coding. Authentication was checked on the running applications: anonymous requests returned 401, authenticated writes without CSRF and cross-origin writes returned 403, and login, protected page access, logout and revoked-session rejection worked. Verification performed no contestant writes in the configured hosted database. CRUD fixtures run only in guarded disposable localhost databases.

## Scope and data ownership

Reuse the existing Contestant, Competition and AuditLog models. No schema or migration changes are needed: PostgreSQL already enforces `@@unique([competitionId, number])` and `@@unique([competitionId, slug])`.

All management requests use the same **server-selected competition** as the public REST service: `PUBLIC_COMPETITION_SLUG` when configured, otherwise the deterministic newest competition. Missing configuration/data produces an explicit no-competition state. The administrator cannot move contestants between competitions or supply a different competition ID. Competition creation/selection management remains ADMIN-04; the list/form shows the selected competition name.

Only name, number, slug, bio, imageUrl and isActive are editable. Create omits totalVotes so PostgreSQL supplies zero. Strict Zod validation rejects extra fields, including totalVotes, id, competitionId, payment/allocation relations and client audit identities. PATCH requires at least one editable field and preserves omitted fields. IDs and competition membership remain stable.

Numbers are trimmed text identifiers, with leading zeros preserved (`001` remains `001`), unique by stored value within a competition. Slugs are trimmed/lowercased and validated as ASCII words joined by single hyphens. The registration form suggests a slug from the name until manually edited; an existing slug stays stable unless explicitly edited. PostgreSQL constraints remain authoritative under concurrent requests. A conflict returns 409 with a field-specific code; no duplicate audit is written for a failed transaction.

Limits: name 1–120 characters; number 1–20; slug 1–120; optional biography up to 5,000; optional image URL up to 2,048. Empty biography/image values become null. Names/numbers reject control characters; biographies allow normal line breaks and are rendered as plain text, never HTML. `isActive` must be a JSON boolean.

`imageUrl` is an existing optional HTTPS image reference without embedded credentials or a fragment. No file input, upload endpoint, object replacement, Storage policy/bucket change or server-side image fetch is implemented. Public portrait rendering already validates URLs and provides a missing/broken-image fallback. Storage uploads and managed object authorization remain ADMIN-03.

There is **no delete endpoint**, including for contestants without history. Deactivation hides a contestant from public list/detail reads while preserving its identity, votes, payments and allocations. Public endpoints still filter `isActive=true`; payment initialization code and contracts are unchanged.

## REST contract

All routes below require an active admin session. POST/PATCH additionally require JSON, the exact configured Origin and a session-bound `X-CSRF-Token`. These routes are mounted after the shared middleware; the frontend is never the authorization boundary. See [authentication setup and cookies](authentication.md).

| Express endpoint | Purpose |
| --- | --- |
| GET `/api/v1/admin/contestants` | List selected-competition contestants, including inactive by default |
| GET `/api/v1/admin/contestants/:id` | Load one selected-competition contestant, including inactive |
| POST `/api/v1/admin/contestants` | Register; returns 201 |
| PATCH `/api/v1/admin/contestants/:id` | Update editable fields/status; returns 200 |

List query: `q` (trimmed, maximum 100, literal case-insensitive text), `status=all|active|inactive` (default all), `page` (1–100000, default 1), `pageSize` (1–100, default 25). Search rejects control characters and escapes LIKE wildcards. Invalid/repeated/unknown query fields return 400. Results sort by number then ID, with count/items read in one repeatable-read transaction. No matching rows returns 200 with an empty array. A page beyond the last page is empty and includes pagination metadata.

Responses use the existing `{status:"success",data:...}` envelope:

```json
{
  "competition": { "id": "show-id", "name": "Show", "slug": "show", "description": null, "status": "DRAFT", "votingOpens": null, "votingCloses": null, "currency": "NGN" },
  "items": [],
  "pagination": { "page": 1, "pageSize": 25, "total": 0, "pages": 0 }
}
```

Detail data is `{competition,contestant}`. Mutation data is the contestant DTO: id, competitionId, name, number, slug, bio, imageUrl, isActive, totalVotes, createdAt, updatedAt. **totalVotes is an exact decimal string**, including beyond JavaScript's safe integer range. Dates are ISO strings. Payment/contact/admin credential relations are never included.

Example create body:

```json
{
  "name": "Example Performer",
  "number": "004",
  "slug": "example-performer",
  "bio": "A short plain-text biography.",
  "imageUrl": null,
  "isActive": true
}
```

Example deactivation body for PATCH `/:id`: `{"isActive":false}`. Fetch the CSRF token using the authenticated cookie before sending either mutation. The browser uses fixed-path same-origin `/api/admin/contestants` and `/api/admin/contestants/:id` facades. They allow only GET/POST or GET/PATCH respectively, preserve the existing auth forwarding allowlist, restrict IDs, bound contestant mutation streams to 32 KiB and keep the original 4 KiB auth limit. No arbitrary proxy destination or client-IP forwarding is supported.

Errors follow the existing envelope: 400 validation with field/message details, 401 missing/expired/inactive session, 403 CSRF/origin failure, 404 unknown/cross-competition contestant or missing competition, 409 `CONTESTANT_NUMBER_EXISTS` / `CONTESTANT_SLUG_EXISTS`, sanitized 500/503 for unexpected/unavailable service errors. Authenticated DELETE requests reach no handler and return 404; unauthenticated attempts still fail the shared guards. All admin data/auth responses are no-store.

## Auditing and UI behavior

Create writes `CONTESTANT_CREATED` with the validated editable values. Content edits write `CONTESTANT_UPDATED` with exact before/after changes. A status transition writes `CONTESTANT_STATUS_CHANGED`. A combined content/status edit writes both events in the same transaction. Audit admin identity comes only from the verified session.

Edits lock the selected contestant row before reading its previous state, preventing misleading audit values under concurrent updates. If any audit insert fails, the contestant mutation rolls back. Saving identical values returns the existing row without duplicate audit events. Last committed edits win; this issue does not add an optimistic-concurrency revision protocol.

Every private page/data access verifies the session at request time. The small `connection()` compatibility change makes the request boundary explicit before session fetch timeouts, resolving the Next.js prerender-time warning observed during inspection. No persistent authorization cache is added.

Forms include labels, native required/type/length validation, field errors linked to a focused error summary, a disabled saving state and preserved input after failure. Successful saves perform a full navigation to a fresh list with a status message, discarding stale private form/router state. Status controls carry the contestant name in their accessible labels. Search/filter submissions reset pagination. Empty, invalid-filter, no-competition, missing-record, loading and unavailable states are distinct. The table scrolls horizontally on narrow screens; form columns collapse on mobile.

## Tests and review

Create a fresh migrated local database named `talenthunt_admin_contestants_test` or `_suffix`; set `ADMIN_CONTESTANTS_TEST_DATABASE_URL` explicitly. There is no fallback to DATABASE_URL, and the suite refuses production, hosted/routed URLs, incorrect names and populated targets.

```powershell
$env:ADMIN_CONTESTANTS_TEST_DATABASE_URL = 'postgresql://LOCAL_ROLE@127.0.0.1:5432/talenthunt_admin_contestants_test_run1'
# Point Prisma at this same disposable target and apply existing migrations first.
npm run test:admin:contestants --workspace=apps/api
npm run typecheck:test --workspace=apps/api
npm test --workspace=apps/web
```

API coverage includes authorization/expiry/CSRF, strict input and mass assignment, number/slug conflicts and duplicate races, filtering/pagination, cross-competition isolation, exact vote strings, partial/no-op edits, audit failure rollback, and preservation of paid history/allocations during deactivation/rejected deletion. A separate `ADMIN_WEB_TEST_DATABASE_URL` database exercises the real Next → Express → PostgreSQL facade, forms, filtering, activation/deactivation, public visibility and audit records. See its setup in [authentication](authentication.md).

Run API build/typecheck, full API regressions, frontend unit/lint/typecheck/build/public smoke checks, seed regressions and Prisma drift validation. No real Paystack call or hosted contestant fixture is needed. Browser automation had no available browser in this session; actual visual/mobile/keyboard interactions remain a manual review item. HTTP/rendered-HTML and static component tests do not claim browser interaction coverage.

ADMIN-02 is linked to issue #10 and remains open until PR review/merge. Do not merge without approval or begin uploads/competition management as part of this task.
