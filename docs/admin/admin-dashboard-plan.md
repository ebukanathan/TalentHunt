# Admin-first sequence and ADMIN-01 implementation proposal

Prepared 27 October 2026 (Africa/Lagos). **Approved by the user; ADMIN-01 implemented on feat/admin-01-auth-dashboard for review.** See [configuration, provisioning, API and test instructions](authentication.md). No merge, hosted migration, real administrator provisioning or ADMIN-02 implementation is authorized by this status.

## Scope and sequence

Prioritize ADMIN-01 authentication and dashboard foundation, then ADMIN-02 contestant CRUD after ADMIN-01 is reviewed, followed by ADMIN-03 secure Supabase Storage photographs and ADMIN-04 competition/package management. Existing issue IDs are reused where suitable. Further Paystack development is deferred; completed PAY-01 remains intact. Do not change payment code except a demonstrated compatibility fix, and do not implement other admin issues in ADMIN-01.

Existing foundations inspected: Next.js 16.4.2 App Router (Cache Components enabled), Express 5, Prisma/PostgreSQL, AdminUser credentials/active state, Competition, Contestant, VotePackage and AuditLog. Current public REST routes and test checkout do not provide admin authentication. The root web layout currently wraps every page in the public header/main/footer. Repository work starts from main; apps/web/AGENTS.md requires consulting installed Next.js documentation before editing framework code. Local authentication/cookies documentation has been reviewed.

## Authentication strategy

Express owns credential verification, sessions and authorization. Next.js provides the login form and protected dashboard. The browser sends same-origin requests to a small allowlisted Next.js route-handler facade, which forwards to the configured Express API. This avoids cross-site cookies and an authentication dependency on permissive CORS. The facade forwards only the admin cookie and required CSRF/origin headers, propagates Set-Cookie safely, has fixed upstream paths, never accepts an arbitrary proxy destination and never logs auth headers.

Use opaque database sessions instead of browser-stored bearer tokens. Generate a cryptographically random 32-byte session token and persist only its SHA-256 hash in a new AdminSession table. Rotate the token on login, revoke on logout, check AdminUser.isActive on every authenticated backend request and fail closed when session storage is unavailable. Reusing an expired/revoked/forged token must fail. Login/session responses expose only a minimal safe admin DTO, never password hashes or raw tokens.

Proposed defaults: **30-minute server-enforced idle timeout and 8-hour absolute lifetime**. The cookie cannot outlive the absolute limit; server-side idle expiry remains authoritative. Avoid time-based refresh that resurrects expired sessions. Session checks must be request-time and uncached; request-local reuse is acceptable, persistent caching of authorization is not.

Production cookie: host-only `__Host-talenthunt_admin`, HttpOnly, Secure, SameSite=Lax, Path=/, no Domain, bounded expiry. Plain HTTP is permitted only for explicit loopback development using a distinct development cookie name; production requires HTTPS. No session token/password/CSRF token in URLs, localStorage, analytics or logs. Logout removes the server-side session and clears cookies; the UI also clears its authenticated state.

Use CSRF protection on login, logout and every future admin mutation. Propose a signed, short-lived pre-login challenge bound to a host-only HttpOnly cookie; after login, a CSRF token is bound to the authenticated session. Return the request token through a no-store same-origin endpoint and require it in X-CSRF-Token for unsafe methods. Validate exact configured Origin, JSON content type and Fetch Metadata where available. Missing/invalid CSRF or cross-origin mutation is rejected. SameSite is defense in depth, not the only check. All CSRF signing secrets stay server-side and are validated configuration. Production proxy trust must be explicit; do not blindly trust client-supplied forwarding headers.

Implement shared Express requireAdminSession and unsafe-method CSRF guards before protected admin handlers, including future CRUD. Do not rely on a hidden navigation link, a Next.js layout check alone or a frontend redirect for authorization. Backend APIs return 401 for unauthenticated/expired/inactive sessions and 403 for invalid origin/CSRF. The dashboard performs server-side session verification; login stays outside the protected route group to avoid a redirect loop. Backend unavailable means an unavailable state, never an authenticated dashboard.

## Initial provisioning and login abuse protection

One administrator for the MVP. Add a one-time local CLI command using the existing AdminUser model, a masked password prompt or protected stdin and an explicitly selected database target. No default password, public registration, automatic startup provisioning, committed credentials, password arguments in shell history, or silent password overwrite.

Proposed password policy: at least 16 characters with an explicit generous maximum, no silent truncation. Store a versioned salted Node.js crypto.scrypt hash using OWASP's recommended scrypt work factor (N=2^17, r=8, p=1) and appropriate max-memory bounds. Use constant-time verification and comparable dummy verification for unknown accounts. Password text is never trimmed or logged. Require a strong password at provisioning; normal login uses generic invalid-credentials errors.

Provisioning takes a database lock, checks that no administrator exists, then creates the administrator and audit entry atomically. Concurrent invocations cannot provision two administrators. If an administrator already exists, refuse instead of upserting/overwriting; if unexpected multiple accounts exist, stop for operator review without deleting historical data. Password recovery/rotation is a future explicit operator flow, not an unauthenticated API.

Login is throttled before expensive password verification using shared, persistent limits keyed by privacy-safe account/IP identifiers. Bounded cooldowns, concurrency-safe counters and no reliance on a single process's memory prevent a restart/second worker bypass. IP extraction follows explicit trusted-proxy settings. Do not permanently lock out the sole admin. Record sanitized provisioning, successful login and logout events in AuditLog; limit failure details and retention. Database errors cannot bypass throttling or session checks.

## Proposed Express contracts

| Endpoint | Purpose |
| --- | --- |
| GET /api/v1/admin/auth/csrf | No-store login/session-bound CSRF challenge bootstrap |
| POST /api/v1/admin/auth/login | Strict Zod email/password, CSRF/origin validation and throttle; rotate/create session and set cookie |
| GET /api/v1/admin/auth/session | Validate session and active administrator; return minimal admin information |
| POST /api/v1/admin/auth/logout | CSRF-protected revocation and cookie clearing |

Only the CSRF bootstrap and credential-authenticated login are unauthenticated entry points. There is no registration endpoint. A shared protected router guards all other admin resources. Routes reuse the existing error envelope and redact authentication details. Public REST/Paystack contracts remain unchanged. Admin configuration is validated separately; an unconfigured admin subsystem is unavailable while public features still run.

## Proposed Prisma changes

- Reuse AdminUser.email/passwordHash/isActive/lastLoginAt and AuditLog. Do not replace them with a second identity provider/model.
- Add AdminSession: random record ID, required admin relation, unique token hash, created/last-seen timestamps, idle and absolute expiry, optional revocation metadata and appropriate admin/expiry indexes. Keep raw session material out of PostgreSQL.
- Add a small shared AdminAuthRateLimit table for hashed throttle keys, counters/window and expiry. Define bounded retention/cleanup.
- Add only a new reviewed forward migration. No historical migration edits/removal, no payment or vote mutations, no automatic hosted migration and no admin bootstrap as part of a demo seed. Existing rows must remain unchanged.

## Proposed file changes for ADMIN-01

| Files | Change |
| --- | --- |
| apps/api/src/config/admin.ts, config/env.ts; .env.example | Validated origins, CSRF secret, cookie/expiry/rate-limit settings; placeholders only |
| apps/api/src/auth/* | Password hashing, opaque sessions, CSRF challenge handling and shared throttling |
| apps/api/src/middleware/admin-auth.ts | Session/active-admin and unsafe-method guards |
| apps/api/src/routes/admin-auth.routes.ts, controllers/admin-auth.controller.ts, services/admin-auth.service.ts | Login, logout, verification and bootstrap contracts |
| apps/api/src/app.ts, server.ts, http/errors.ts | Injectable admin wiring and sanitized status handling without altering payment logic |
| apps/api/scripts/provision-admin.ts; package scripts | Explicit one-time secure provisioning command |
| prisma/schema.prisma; one new migration | Session/throttle persistence and AdminUser relation |
| apps/web/src/app/api/admin/auth/*/route.ts; src/lib/admin/* | Fixed-path same-origin facade, server-only session client and per-request authorization |
| apps/web/src/app/admin/(auth)/login/* | Accessible login form, validation, generic errors and safe internal return destinations |
| apps/web/src/app/admin/(dashboard)/layout.tsx and pages | Protected Overview, Contestants, Competition, Vote Packages and Payments placeholders; login/logout navigation |
| apps/web/src/components/admin/*; admin-scoped styles | Responsive accessible sidebar/header, session/error states; no CRUD forms or payment actions |
| apps/web/src/app/layout.tsx; app/(public)/* | Move public chrome/pages into a route group so public URLs/design remain intact and admin has its own shell; account for loading/error/not-found layout behavior |
| API/web tests, test scripts, docs/admin/* and web .env.example | Auth/CSRF/session/provisioning tests, browser flow checks and setup documentation |

Use installed Next.js authentication, cookies, route handler and Cache Components guidance during implementation. Protected server pages/data access and every route handler verify authorization; layouts may be reused during client navigation. Authentication responses and rendered private data must not leak through static prerendering or shared caches. Existing public URLs, imagery fallbacks and competition reads must continue working.

## Dashboard scope

Overview may show the signed-in administrator and setup/placeholder information. Contestants, Competition, Vote Packages and Payments are clearly labeled placeholders with no enabled write, upload or money controls. Do not imply statistics, CRUD, payment verification or uploads exist. Login failures preserve only safe form state, use accessible labels/focus and do not disclose whether an account exists. Reject external return URLs. Server/API checks remain authoritative even if client navigation is bypassed.

## Automated evidence required

- Correct/wrong/unknown/inactive credentials, password redaction and login throttling, including concurrent attempts and shared state.
- Cookie flags, session rotation/fixation prevention, expiry boundaries, idle versus absolute expiry, tampered/revoked sessions, logout replay and inactive-admin revocation.
- Missing/invalid/expired CSRF, forged/missing origin, cross-site login/logout, safe GET behavior and direct protected API requests without session/CSRF.
- Provisioning with no default credentials, duplicate/concurrent bootstrap refusal and no changes to existing admin/payment rows.
- Real HTTP/PostgreSQL integration on fresh guarded localhost test databases, plus migration-history preservation and provider-independent regression checks.
- Actual Next.js login-to-dashboard-to-logout flow, unauthenticated redirects/direct route access, expired sessions and upstream outage; no cached private content after logout.
- API build/typechecks, frontend tests/lint/typecheck/build, relevant existing public/payment/seed regressions and mobile/keyboard checks. No hosted test writes or real admin account provisioned automatically.

## Later issue boundaries

ADMIN-02 reuses Contestant fields for name, number, bio, managed image reference and active status, with protected backend CRUD, same-competition uniqueness, audit events and history-safe deletion/deactivation. It does not start until ADMIN-01 is reviewed.

ADMIN-03 uses Supabase Storage for JPEG/PNG/WebP photographs, with a proposed 5 MB input limit plus decoded pixel/resource limits. Validate magic bytes and actual decode, re-encode/strip metadata, generate random safe object names, and authorize upload/replace/delete through Express before storage access. A public bucket may serve images, while anonymous write policies are denied. Server credentials never reach the browser; PostgreSQL stores references only. Upload a new object before updating the reference; clean up obsolete/orphaned objects safely without deleting shared/current references. No Storage account/bucket changes occur in ADMIN-01.

ADMIN-04 reuses Competition/VotePackage for lifecycle, UTC voting windows and validated integer-kobo packages. Protect/audit all writes and preserve immutable existing payment snapshots. No Paystack expansion is included.

## Review boundary

After explicit approval: create feat/admin-01-auth-dashboard from current main, implement ADMIN-01 only, run the checks, commit/push and open a PR linked to its issue. Do not merge without approval or begin ADMIN-02 before ADMIN-01 review. Do not request or publish real admin passwords/session secrets in chat.

## References

- https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- https://supabase.com/docs/guides/storage/security/access-control
- https://supabase.com/docs/guides/storage/buckets/fundamentals
