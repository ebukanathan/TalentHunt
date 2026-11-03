# ADMIN-03 verification

Branch: `feat/admin-03-contestant-images`. Issue: [#35](https://github.com/ebukanathan/TalentHunt/issues/35).

- Full API suite: **72 passed**, including ADMIN-01, ADMIN-02, ADMIN-03, public reads and Paystack initialization regressions.
- Frontend suite: **18 passed**; frontend lint and TypeScript checks passed.
- API build and test TypeScript checks passed.
- Real Next.js → Express → PostgreSQL integration passed: login/session/CSRF, contestant CRUD, upload facade limits and validation, successful upload, replacement, removal, public listing/profile images, inactive visibility, logout, expiry and backend outage.
- All four migrations applied to fresh isolated PostgreSQL databases. Prisma schema diff reported no drift.
- Initial parallel API run passed 71/72; its existing provisioning subprocess exceeded its 10-second deadline under concurrent password/image work. The full test command now serializes test files; the subsequent complete run passed 72/72. Tests retain their actual concurrency scenarios within individual cases.
- Storage fixture tests cover upload uncertainty, audit/database rollback, concurrent replacements, retryable cleanup, attached/shared references and external URL preservation. Real hosted Supabase permissions and public retrieval remain deployment checks, not claims made by these fixtures.

The corrected backend key was verified against the selected Supabase project. The public `contestant-images` bucket now has a 5,000,000-byte limit and accepts stored WebP objects only. RLS is enabled, and the three restrictive policies for anon/authenticated INSERT, UPDATE and DELETE are installed. The additive image-journal migration was deployed after checking that all existing migration checksums matched.

A generated temporary image uploaded successfully, was retrieved publicly with matching bytes, and was removed. Its recovery journal remains as DELETED metadata. The reloaded local API passed administrator login, authenticated image-route validation and logout checks; no contestant photo or payment record was changed. The cleanup command ran successfully with no due objects. Direct hosted browser-role HTTP write attempts were not performed; policy definitions and active RLS were verified through database metadata.

Follow [contestant-images.md](contestant-images.md) for deployment instructions. Cleanup scheduling is still required for a continuously running deployment. Historical migrations and Paystack implementation files were not changed.
