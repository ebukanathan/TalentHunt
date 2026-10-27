# PROPOSAL ONLY — do not execute before approval
# Run from the repository root. Generated IDs are placeholders in the preview.
# PowerShell-safe quoting is used for review; the runner invokes gh directly with argument arrays.
gh 'auth' 'status'

gh 'repo' 'view' 'ebukanathan/TalentHunt' '--json' 'nameWithOwner,hasIssuesEnabled'

gh 'project' 'list' '--owner' 'ebukanathan' '--limit' '100' '--format' 'json'

gh 'project' 'create' '--owner' 'ebukanathan' '--title' 'TalentHunt — Development Roadmap' '--format' 'json'

gh 'project' 'link' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--repo' 'ebukanathan/TalentHunt'

gh 'project' 'edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--visibility' 'PRIVATE' '--description' 'Solo-developer MVP roadmap: verified foundations, safe paid voting and evidence-based launch.' '--readme' '# TalentHunt - Development Roadmap

Updated 27 October 2026 (Africa/Lagos). Repository: [ebukanathan/TalentHunt](https://github.com/ebukanathan/TalentHunt). [GitHub Project](https://github.com/users/ebukanathan/projects/3).

## Admin-first priority - 27 October 2026

Further Paystack implementation is deferred; completed PAY-01 remains unchanged. Prioritize the existing Next.js/Express Admin Dashboard.

| Issue | Scope | Status |
| --- | --- | --- |
| [ADMIN-01 #8](https://github.com/ebukanathan/TalentHunt/issues/8) | Admin authentication and protected dashboard layout | In Progress - approved; implementation submitted for review |
| [ADMIN-02 #10](https://github.com/ebukanathan/TalentHunt/issues/10) | Contestant CRUD - name, contestant number, bio, image reference, active status | Backlog |
| [ADMIN-03 #35](https://github.com/ebukanathan/TalentHunt/issues/35) | Secure contestant image upload using Supabase Storage | Backlog |
| [ADMIN-04 #9](https://github.com/ebukanathan/TalentHunt/issues/9) | Competition configuration and vote-package management | Backlog |

The user approved the [ADMIN-01 authentication/security/file proposal](../admin/admin-dashboard-plan.md). ADMIN-01 is implemented on its feature branch for review; see [setup and verification](../admin/authentication.md). ADMIN-02 cannot start before ADMIN-01 review. Do not merge without approval. Tests migrate/provision only fresh disposable local databases; no hosted migration, real administrator provisioning or Storage changes have run.

## Confirmed product requirements

Checkout requires an email address for payment receipts, successful voting confirmations, transaction-related communication and customer support. Voters do not need an account, email OTP or verification link. Keep Payment.contactEmail required. Checkout must not enroll anyone in marketing; any future marketing needs separate appropriate consent.

Paystack payment verification and atomic vote allocation operate independently of email delivery. After confirmed payment and successful allocation, create one durable confirmation intent in the same database transaction; a background worker sends a combined receipt/voting confirmation through a reliable provider. Permanent unique intent keys, provider idempotency, leases and bounded retries prevent duplicate submissions. Resend is proposed; its 24-hour idempotency window requires reconciliation of uncertain sends before retrying beyond the safe deadline.

Requirements and API artifacts: [product requirements](../product/paid-voting-requirements.md), [proposed Paystack/API/schema plan](../api/checkout-and-confirmations.md), [implemented read API](../api/core-rest-api.md). The broader plan remains a proposal; the approved PAY-01 contract, retry limitations and test instructions are documented in [payment initialization](../api/payment-initialization.md). These payment changes and the public homepage are now merged into main.

## Current baseline and work in progress

The repository is published. Foundation/seed/public read API are complete (F01/F02/F03 and #27). The public homepage/list (#29, PR #33) and PAY-01 test initialization (#13, PR #34) are merged and Done. Profiles #30, package selection #31 and leaderboard #32 remain separate Backlog work. Broader setup/configuration/admin issues stay open; no unimplemented admin scope is complete.

PAY-01 test checkout initialization is merged; further Paystack implementation is paused. payment finalization, webhook processing, votes and transactional email remain unimplemented. The existing ContactVerification model is legacy scaffolding. The seed integration test still counts it and must be adjusted with any reviewed future removal.

Read-only configured development database review on 24 October 2026: 0 payments, 0 non-null Payment.verificationId links, 0 ContactVerification rows and 0 allocations. These aggregate counts do not authorize removal in other environments. No database records were modified.

## Solo workflow and next issue

Columns: **Backlog -> Next -> In Progress -> Done**. Keep one item In Progress. Completion requires linked implementation/check evidence and appropriate migration validation. Requirements changes alone do not complete implementation issues.

**Current implementation: [ADMIN-01 #8](https://github.com/ebukanathan/TalentHunt/issues/8), P0, In Progress for review.** ADMIN-02 #10 is next only after ADMIN-01 review. E02 and future payment work remain Backlog. Only ADMIN-01 is In Progress.

E02 replaces its obsolete OTP-authorization scope. E01 #6 becomes the confirmation delivery worker/provider integration; E03 #12 becomes required-email checkout UI. Preserve issue IDs and history. All three stay open. The phase/milestone formerly called Email Verification is renamed **Checkout Email and Transactional Confirmations**, retaining its existing identity and item assignments.

## Milestones and sequence

| Phase / milestone | Issues | Exit gate |
| --- | --- | --- |
| Project Foundation | F01-F05 | Repeatable environment, seed, database lifecycle and safe API configuration. |
| Competition and Contestant Management | C03, #27, #29-#32 | Protected management and real public browsing with honest voting-window state. |
| Checkout Email and Transactional Confirmations | E01-E03 | Required contact email without OTP/link verification; safe schema transition; deduplicated post-allocation confirmations; transactional-only messaging. |
| Payments and Vote Allocation | P01-P05 | Server-owned checkout, authenticated and verified Paystack facts, atomic votes/outbox, separate delivery status and reconciliation/refund handling. |
| Admin Dashboard | ADMIN-01 to ADMIN-04; later A02/A03 follow-ups | Secure sessions/CSRF, contestant management, authorized Supabase photographs and audited competition/package configuration. Later payment reporting stays deferred. |
| Testing, CI/CD and Deployment | T01-T05 | Integrity and delivery-failure tests, CI, staging, recovery, monitoring and launch rehearsal. |

Current sequence: **ADMIN-01 approval/implementation/review -> ADMIN-02 -> ADMIN-03 -> ADMIN-04**. Reuse AdminUser, Competition, Contestant, VotePackage and AuditLog; one administrator, no public registration. Proposed database sessions and shared login throttling use new forward migration(s), with server-side authorization on every admin write. Paystack #14-#17 and related future delivery/payment work remain Backlog until a later decision resumes them.

## Schema and migration rules

ADMIN-01 adds only AdminSession and shared auth-throttle persistence alongside existing AdminUser/AuditLog through a new forward migration. The migration passed isolated local tests preserving historical rows; no hosted migration or real credential provisioning has run. ADMIN-03 will store image bytes in Supabase Storage and references in PostgreSQL; reads may be public, but upload/replace/delete require authorization and content/type/size/filename validation.

Keep Payment.contactEmail, immutable money/vote/attribution snapshots, historical payments and allocations. Add empty TransactionEmail/EmailDeliveryEvent tables for permanent unique logical confirmations, immutable recipient/payload snapshots, provider IDs/events, leases, retry deadlines and delivery state. PAY-01 adds PaymentInitialization retry state; later session/receipt extensions and P02 webhook inbox remain separate work.

PAY-01 adds only PaymentInitialization retry state and preserves all legacy schema. ContactVerification and Payment.verificationId/relation/index/FK can be removed only by a new reviewed forward migration after proving all intended targets have no historical verification rows/links and all consumers are compatible. Lock and assert the preconditions. If any target has history, retain/deprecate the legacy schema and use the same additive migration history across environments. Never clear links, alter existing payments, auto-enqueue historical confirmations, delete data, reset the database or edit/remove historical migrations to make this transition pass.

## Risk register

Owner: ebukanathan. Prospective risks remain open until evidence closes them.

| Risk | Control / release evidence | Issues |
| --- | --- | --- |
| Forged or repeated payment grants unpaid/excess votes | Signed raw-body webhooks, server verification of amount/currency/reference/environment, unique provider IDs and PostgreSQL atomicity/concurrency tests. | P01/P02/P03/T01 |
| Missed events, late payment or refunds desynchronize money/votes | Shared idempotent finalizer, verified payment-time policy, reconciliation and audited reversal ledger preserving original allocations. | P05/A03/T04 |
| Unverified contact misuse, receipt enumeration or compromised admin access | Input/rate/origin controls, scoped receipt capability independent of email ownership, restricted contacts, secure admin sessions and no marketing without consent. | E03/P01/P04/A01/T05 |
| Duplicate or lost confirmation after outage/crash | Transactional outbox, permanent unique intent, immutable provider payload/key, 23-hour conservative retry deadline within proposed provider''s 24-hour retention, lease races/crash tests, reconciliation before ambiguous later resend. | E02/P03/E01/T01/T04 |
| Legacy removal destroys history or breaks an old client | Per-target read-only inventory, one compatible migration history, locked empty-data assertions, retain populated legacy objects, snapshot/checksum comparison and staged rollout. | E02/T01/T03 |
| Database loss or unsafe deployment breaks accounting | Isolated environments, reviewed forward migrations, backup/restore rehearsal, least privilege, monitored pools and ledger checks. | F04/T02/T03/T04/T05 |

## Sources and planning tooling

Provider plans use official [Paystack transactions](https://paystack.com/docs/api/transaction/), [webhooks](https://paystack.com/docs/payments/webhooks/), [verification](https://paystack.com/docs/payments/verify-payments/) and [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys) documentation checked on 24 October 2026.

backlog.json and proposed-backlog.md track the original keyed issues with updated requirements; Stage 3 child issues and their live progress remain on GitHub. created-resources.json records the historical project setup and must not be treated as current requirements. The original github-roadmap.mjs is a setup/preview tool, not a routine live-project synchronizer. Its --plan mode makes no GitHub requests. Do not run --apply to replay old statuses or recreate the Project. This change uses targeted issue/milestone/field edits, preserving unrelated progress and public/private visibility.
'

gh 'api' 'graphql' '--input' 'docs/project-management/generated/read-fields.json'

gh 'api' 'graphql' '--input' 'docs/project-management/generated/status-options.json'

gh 'project' 'field-create' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--name' 'Phase' '--data-type' 'SINGLE_SELECT' '--single-select-options' '"Project Foundation","Competition and Contestant Management","Checkout Email and Transactional Confirmations","Payments and Vote Allocation","Admin Dashboard","Testing, CI/CD and Deployment"' '--format' 'json'

gh 'project' 'field-create' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--name' 'Priority' '--data-type' 'SINGLE_SELECT' '--single-select-options' '"P0","P1","P2"' '--format' 'json'

gh 'api' 'graphql' '--input' 'docs/project-management/generated/read-fields.json'

gh 'project' 'item-list' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--limit' '1000' '--format' 'json'

gh 'api' 'graphql' '--input' 'docs/project-management/generated/read-views.json'

gh 'api' 'graphql' '--input' 'docs/project-management/generated/create-kanban.json'

gh 'label' 'list' '--repo' 'ebukanathan/TalentHunt' '--limit' '1000' '--json' 'name'

gh 'label' 'create' 'area:api' '--repo' 'ebukanathan/TalentHunt' '--color' '1D76DB' '--description' 'Express API and backend services'

gh 'label' 'create' 'area:web' '--repo' 'ebukanathan/TalentHunt' '--color' '5319E7' '--description' 'Next.js public and admin interfaces'

gh 'label' 'create' 'area:database' '--repo' 'ebukanathan/TalentHunt' '--color' '006B75' '--description' 'Prisma, migrations and database integrity'

gh 'label' 'create' 'area:payments' '--repo' 'ebukanathan/TalentHunt' '--color' 'B60205' '--description' 'Paystack, payment lifecycle and vote accounting'

gh 'label' 'create' 'area:security' '--repo' 'ebukanathan/TalentHunt' '--color' 'D93F0B' '--description' 'Authentication, authorization and abuse prevention'

gh 'label' 'create' 'area:delivery' '--repo' 'ebukanathan/TalentHunt' '--color' '0E8A16' '--description' 'CI, environments, releases and operations'

gh 'label' 'create' 'area:quality' '--repo' 'ebukanathan/TalentHunt' '--color' 'FBCA04' '--description' 'Automated tests and release verification'

gh 'api' 'repos/ebukanathan/TalentHunt/milestones?state=all&per_page=100' '--paginate' '--slurp'

gh 'api' '--method' 'POST' 'repos/ebukanathan/TalentHunt/milestones' '--input' 'docs/project-management/generated/milestone-1.json'

gh 'api' '--method' 'POST' 'repos/ebukanathan/TalentHunt/milestones' '--input' 'docs/project-management/generated/milestone-2.json'

gh 'api' '--method' 'POST' 'repos/ebukanathan/TalentHunt/milestones' '--input' 'docs/project-management/generated/milestone-3.json'

gh 'api' '--method' 'POST' 'repos/ebukanathan/TalentHunt/milestones' '--input' 'docs/project-management/generated/milestone-4.json'

gh 'api' '--method' 'POST' 'repos/ebukanathan/TalentHunt/milestones' '--input' 'docs/project-management/generated/milestone-5.json'

gh 'api' '--method' 'POST' 'repos/ebukanathan/TalentHunt/milestones' '--input' 'docs/project-management/generated/milestone-6.json'

gh 'issue' 'list' '--repo' 'ebukanathan/TalentHunt' '--state' 'all' '--limit' '1000' '--json' 'number,title,state,url'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[F01] Create workspace, Next.js starter and Express health scaffold' '--body-file' 'docs/project-management/generated/F01.md' '--label' 'area:api,area:web' '--milestone' 'Project Foundation'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_F01>' '--format' 'json'

gh 'project' 'item-edit' '--id' '<ITEM_F01>' '--project-id' '<PROJECT_ID>' '--field-id' '<STATUS_FIELD_ID>' '--single-select-option-id' '<STATUS_Done>'

gh 'project' 'item-edit' '--id' '<ITEM_F01>' '--project-id' '<PROJECT_ID>' '--field-id' '<PHASE_FIELD_ID>' '--single-select-option-id' '<PHASE_Project Foundation>'

gh 'project' 'item-edit' '--id' '<ITEM_F01>' '--project-id' '<PROJECT_ID>' '--field-id' '<PRIORITY_FIELD_ID>' '--single-select-option-id' '<PRIORITY_P1>'

gh 'issue' 'close' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_F01>' '--repo' 'ebukanathan/TalentHunt' '--reason' 'completed'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[F02] Define initial Prisma models and verify initial database migration' '--body-file' 'docs/project-management/generated/F02.md' '--label' 'area:database' '--milestone' 'Project Foundation'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_F02>' '--format' 'json'

gh 'project' 'item-edit' '--id' '<ITEM_F02>' '--project-id' '<PROJECT_ID>' '--field-id' '<STATUS_FIELD_ID>' '--single-select-option-id' '<STATUS_Done>'

gh 'project' 'item-edit' '--id' '<ITEM_F02>' '--project-id' '<PROJECT_ID>' '--field-id' '<PHASE_FIELD_ID>' '--single-select-option-id' '<PHASE_Project Foundation>'

gh 'project' 'item-edit' '--id' '<ITEM_F02>' '--project-id' '<PROJECT_ID>' '--field-id' '<PRIORITY_FIELD_ID>' '--single-select-option-id' '<PRIORITY_P1>'

gh 'issue' 'close' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_F02>' '--repo' 'ebukanathan/TalentHunt' '--reason' 'completed'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[F03] Implement repeatable development database seeding' '--body-file' 'docs/project-management/generated/F03.md' '--label' 'area:database' '--milestone' 'Project Foundation'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_F03>' '--format' 'json'

gh 'project' 'item-edit' '--id' '<ITEM_F03>' '--project-id' '<PROJECT_ID>' '--field-id' '<STATUS_FIELD_ID>' '--single-select-option-id' '<STATUS_Done>'

gh 'project' 'item-edit' '--id' '<ITEM_F03>' '--project-id' '<PROJECT_ID>' '--field-id' '<PHASE_FIELD_ID>' '--single-select-option-id' '<PHASE_Project Foundation>'

gh 'project' 'item-edit' '--id' '<ITEM_F03>' '--project-id' '<PROJECT_ID>' '--field-id' '<PRIORITY_FIELD_ID>' '--single-select-option-id' '<PRIORITY_P1>'

gh 'issue' 'close' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_F03>' '--repo' 'ebukanathan/TalentHunt' '--reason' 'completed'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[F04] Publish a reproducible source and environment baseline' '--body-file' 'docs/project-management/generated/F04.md' '--label' 'area:delivery,documentation' '--milestone' 'Project Foundation'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_F04>' '--format' 'json'

gh 'project' 'item-edit' '--id' '<ITEM_F04>' '--project-id' '<PROJECT_ID>' '--field-id' '<STATUS_FIELD_ID>' '--single-select-option-id' '<STATUS_Backlog>'

gh 'project' 'item-edit' '--id' '<ITEM_F04>' '--project-id' '<PROJECT_ID>' '--field-id' '<PHASE_FIELD_ID>' '--single-select-option-id' '<PHASE_Project Foundation>'

gh 'project' 'item-edit' '--id' '<ITEM_F04>' '--project-id' '<PROJECT_ID>' '--field-id' '<PRIORITY_FIELD_ID>' '--single-select-option-id' '<PRIORITY_P1>'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[F05] Add API configuration, Prisma lifecycle and safe error handling' '--body-file' 'docs/project-management/generated/F05.md' '--label' 'area:api,area:security' '--milestone' 'Project Foundation'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_F05>' '--format' 'json'

gh 'project' 'item-edit' '--id' '<ITEM_F05>' '--project-id' '<PROJECT_ID>' '--field-id' '<STATUS_FIELD_ID>' '--single-select-option-id' '<STATUS_Backlog>'

gh 'project' 'item-edit' '--id' '<ITEM_F05>' '--project-id' '<PROJECT_ID>' '--field-id' '<PHASE_FIELD_ID>' '--single-select-option-id' '<PHASE_Project Foundation>'

gh 'project' 'item-edit' '--id' '<ITEM_F05>' '--project-id' '<PROJECT_ID>' '--field-id' '<PRIORITY_FIELD_ID>' '--single-select-option-id' '<PRIORITY_P1>'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[C03] Build public competition pages, contestant profiles and leaderboard' '--body-file' 'docs/project-management/generated/C03.md' '--label' 'area:web,area:api' '--milestone' 'Competition and Contestant Management'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_C03>' '--format' 'json'

gh 'project' 'item-edit' '--id' '<ITEM_C03>' '--project-id' '<PROJECT_ID>' '--field-id' '<STATUS_FIELD_ID>' '--single-select-option-id' '<STATUS_Backlog>'

gh 'project' 'item-edit' '--id' '<ITEM_C03>' '--project-id' '<PROJECT_ID>' '--field-id' '<PHASE_FIELD_ID>' '--single-select-option-id' '<PHASE_Competition and Contestant Management>'

gh 'project' 'item-edit' '--id' '<ITEM_C03>' '--project-id' '<PROJECT_ID>' '--field-id' '<PRIORITY_FIELD_ID>' '--single-select-option-id' '<PRIORITY_P1>'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[E02] Prepare history-preserving checkout email and confirmation schema' '--body-file' 'docs/project-management/generated/E02.md' '--label' 'area:database,area:api,area:security' '--milestone' 'Checkout Email and Transactional Confirmations'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_E02>' '--format' 'json'

gh 'project' 'item-edit' '--id' '<ITEM_E02>' '--project-id' '<PROJECT_ID>' '--field-id' '<STATUS_FIELD_ID>' '--single-select-option-id' '<STATUS_Backlog>'

gh 'project' 'item-edit' '--id' '<ITEM_E02>' '--project-id' '<PROJECT_ID>' '--field-id' '<PHASE_FIELD_ID>' '--single-select-option-id' '<PHASE_Checkout Email and Transactional Confirmations>'

gh 'project' 'item-edit' '--id' '<ITEM_E02>' '--project-id' '<PROJECT_ID>' '--field-id' '<PRIORITY_FIELD_ID>' '--single-select-option-id' '<PRIORITY_P0>'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[P01] PAY-01: Paystack test configuration and payment initialization' '--body-file' 'docs/project-management/generated/P01.md' '--label' 'area:payments,area:api' '--milestone' 'Payments and Vote Allocation'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_P01>' '--format' 'json'

gh 'project' 'item-edit' '--id' '<ITEM_P01>' '--project-id' '<PROJECT_ID>' '--field-id' '<STATUS_FIELD_ID>' '--single-select-option-id' '<STATUS_Done>'

gh 'project' 'item-edit' '--id' '<ITEM_P01>' '--project-id' '<PROJECT_ID>' '--field-id' '<PHASE_FIELD_ID>' '--single-select-option-id' '<PHASE_Payments and Vote Allocation>'

gh 'project' 'item-edit' '--id' '<ITEM_P01>' '--project-id' '<PROJECT_ID>' '--field-id' '<PRIORITY_FIELD_ID>' '--single-select-option-id' '<PRIORITY_P0>'

gh 'issue' 'close' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_P01>' '--repo' 'ebukanathan/TalentHunt' '--reason' 'completed'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[E03] Build required-email checkout without OTP or verification links' '--body-file' 'docs/project-management/generated/E03.md' '--label' 'area:web' '--milestone' 'Checkout Email and Transactional Confirmations'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_E03>' '--format' 'json'

gh 'project' 'item-edit' '--id' '<ITEM_E03>' '--project-id' '<PROJECT_ID>' '--field-id' '<STATUS_FIELD_ID>' '--single-select-option-id' '<STATUS_Backlog>'

gh 'project' 'item-edit' '--id' '<ITEM_E03>' '--project-id' '<PROJECT_ID>' '--field-id' '<PHASE_FIELD_ID>' '--single-select-option-id' '<PHASE_Checkout Email and Transactional Confirmations>'

gh 'project' 'item-edit' '--id' '<ITEM_E03>' '--project-id' '<PROJECT_ID>' '--field-id' '<PRIORITY_FIELD_ID>' '--single-select-option-id' '<PRIORITY_P1>'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[P02] Authenticate Paystack webhooks and verify payment facts' '--body-file' 'docs/project-management/generated/P02.md' '--label' 'area:payments,area:security' '--milestone' 'Payments and Vote Allocation'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_P02>' '--format' 'json'

gh 'project' 'item-edit' '--id' '<ITEM_P02>' '--project-id' '<PROJECT_ID>' '--field-id' '<STATUS_FIELD_ID>' '--single-select-option-id' '<STATUS_Backlog>'

gh 'project' 'item-edit' '--id' '<ITEM_P02>' '--project-id' '<PROJECT_ID>' '--field-id' '<PHASE_FIELD_ID>' '--single-select-option-id' '<PHASE_Payments and Vote Allocation>'

gh 'project' 'item-edit' '--id' '<ITEM_P02>' '--project-id' '<PROJECT_ID>' '--field-id' '<PRIORITY_FIELD_ID>' '--single-select-option-id' '<PRIORITY_P0>'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[P03] Allocate paid votes exactly once under concurrent delivery' '--body-file' 'docs/project-management/generated/P03.md' '--label' 'area:payments,area:database' '--milestone' 'Payments and Vote Allocation'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_P03>' '--format' 'json'

gh 'project' 'item-edit' '--id' '<ITEM_P03>' '--project-id' '<PROJECT_ID>' '--field-id' '<STATUS_FIELD_ID>' '--single-select-option-id' '<STATUS_Backlog>'

gh 'project' 'item-edit' '--id' '<ITEM_P03>' '--project-id' '<PROJECT_ID>' '--field-id' '<PHASE_FIELD_ID>' '--single-select-option-id' '<PHASE_Payments and Vote Allocation>'

gh 'project' 'item-edit' '--id' '<ITEM_P03>' '--project-id' '<PROJECT_ID>' '--field-id' '<PRIORITY_FIELD_ID>' '--single-select-option-id' '<PRIORITY_P0>'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[E01] Deliver transactional voting confirmations with safe retries' '--body-file' 'docs/project-management/generated/E01.md' '--label' 'area:api,area:delivery,area:security' '--milestone' 'Checkout Email and Transactional Confirmations'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_E01>' '--format' 'json'

gh 'project' 'item-edit' '--id' '<ITEM_E01>' '--project-id' '<PROJECT_ID>' '--field-id' '<STATUS_FIELD_ID>' '--single-select-option-id' '<STATUS_Backlog>'

gh 'project' 'item-edit' '--id' '<ITEM_E01>' '--project-id' '<PROJECT_ID>' '--field-id' '<PHASE_FIELD_ID>' '--single-select-option-id' '<PHASE_Checkout Email and Transactional Confirmations>'

gh 'project' 'item-edit' '--id' '<ITEM_E01>' '--project-id' '<PROJECT_ID>' '--field-id' '<PRIORITY_FIELD_ID>' '--single-select-option-id' '<PRIORITY_P1>'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[P04] Build checkout return, payment status and voter receipt screens' '--body-file' 'docs/project-management/generated/P04.md' '--label' 'area:web,area:payments' '--milestone' 'Payments and Vote Allocation'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_P04>' '--format' 'json'

gh 'project' 'item-edit' '--id' '<ITEM_P04>' '--project-id' '<PROJECT_ID>' '--field-id' '<STATUS_FIELD_ID>' '--single-select-option-id' '<STATUS_Backlog>'

gh 'project' 'item-edit' '--id' '<ITEM_P04>' '--project-id' '<PROJECT_ID>' '--field-id' '<PHASE_FIELD_ID>' '--single-select-option-id' '<PHASE_Payments and Vote Allocation>'

gh 'project' 'item-edit' '--id' '<ITEM_P04>' '--project-id' '<PROJECT_ID>' '--field-id' '<PRIORITY_FIELD_ID>' '--single-select-option-id' '<PRIORITY_P1>'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[P05] Reconcile payments and implement auditable refund/vote-reversal handling' '--body-file' 'docs/project-management/generated/P05.md' '--label' 'area:payments,area:database' '--milestone' 'Payments and Vote Allocation'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_P05>' '--format' 'json'

gh 'project' 'item-edit' '--id' '<ITEM_P05>' '--project-id' '<PROJECT_ID>' '--field-id' '<STATUS_FIELD_ID>' '--single-select-option-id' '<STATUS_Backlog>'

gh 'project' 'item-edit' '--id' '<ITEM_P05>' '--project-id' '<PROJECT_ID>' '--field-id' '<PHASE_FIELD_ID>' '--single-select-option-id' '<PHASE_Payments and Vote Allocation>'

gh 'project' 'item-edit' '--id' '<ITEM_P05>' '--project-id' '<PROJECT_ID>' '--field-id' '<PRIORITY_FIELD_ID>' '--single-select-option-id' '<PRIORITY_P0>'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[ADMIN-01] Admin authentication and protected dashboard layout' '--body-file' 'docs/project-management/generated/ADMIN-01.md' '--label' 'area:api,area:web,area:security,area:database' '--milestone' 'Admin Dashboard'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_ADMIN-01>' '--format' 'json'

gh 'project' 'item-edit' '--id' '<ITEM_ADMIN-01>' '--project-id' '<PROJECT_ID>' '--field-id' '<STATUS_FIELD_ID>' '--single-select-option-id' '<STATUS_In Progress>'

gh 'project' 'item-edit' '--id' '<ITEM_ADMIN-01>' '--project-id' '<PROJECT_ID>' '--field-id' '<PHASE_FIELD_ID>' '--single-select-option-id' '<PHASE_Admin Dashboard>'

gh 'project' 'item-edit' '--id' '<ITEM_ADMIN-01>' '--project-id' '<PROJECT_ID>' '--field-id' '<PRIORITY_FIELD_ID>' '--single-select-option-id' '<PRIORITY_P0>'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[ADMIN-02] Contestant CRUD - name, contestant number, bio, image reference, active status' '--body-file' 'docs/project-management/generated/ADMIN-02.md' '--label' 'area:api,area:web,area:database,area:security' '--milestone' 'Admin Dashboard'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_ADMIN-02>' '--format' 'json'

gh 'project' 'item-edit' '--id' '<ITEM_ADMIN-02>' '--project-id' '<PROJECT_ID>' '--field-id' '<STATUS_FIELD_ID>' '--single-select-option-id' '<STATUS_Backlog>'

gh 'project' 'item-edit' '--id' '<ITEM_ADMIN-02>' '--project-id' '<PROJECT_ID>' '--field-id' '<PHASE_FIELD_ID>' '--single-select-option-id' '<PHASE_Admin Dashboard>'

gh 'project' 'item-edit' '--id' '<ITEM_ADMIN-02>' '--project-id' '<PROJECT_ID>' '--field-id' '<PRIORITY_FIELD_ID>' '--single-select-option-id' '<PRIORITY_P1>'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[A03] Build admin payment, vote and reconciliation reporting' '--body-file' 'docs/project-management/generated/A03.md' '--label' 'area:web,area:payments' '--milestone' 'Admin Dashboard'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_A03>' '--format' 'json'

gh 'project' 'item-edit' '--id' '<ITEM_A03>' '--project-id' '<PROJECT_ID>' '--field-id' '<STATUS_FIELD_ID>' '--single-select-option-id' '<STATUS_Backlog>'

gh 'project' 'item-edit' '--id' '<ITEM_A03>' '--project-id' '<PROJECT_ID>' '--field-id' '<PHASE_FIELD_ID>' '--single-select-option-id' '<PHASE_Admin Dashboard>'

gh 'project' 'item-edit' '--id' '<ITEM_A03>' '--project-id' '<PROJECT_ID>' '--field-id' '<PRIORITY_FIELD_ID>' '--single-select-option-id' '<PRIORITY_P1>'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[T01] Establish security and payment-integrity regression tests' '--body-file' 'docs/project-management/generated/T01.md' '--label' 'area:quality,area:payments' '--milestone' 'Testing, CI/CD and Deployment'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_T01>' '--format' 'json'

gh 'project' 'item-edit' '--id' '<ITEM_T01>' '--project-id' '<PROJECT_ID>' '--field-id' '<STATUS_FIELD_ID>' '--single-select-option-id' '<STATUS_Backlog>'

gh 'project' 'item-edit' '--id' '<ITEM_T01>' '--project-id' '<PROJECT_ID>' '--field-id' '<PHASE_FIELD_ID>' '--single-select-option-id' '<PHASE_Testing, CI/CD and Deployment>'

gh 'project' 'item-edit' '--id' '<ITEM_T01>' '--project-id' '<PROJECT_ID>' '--field-id' '<PRIORITY_FIELD_ID>' '--single-select-option-id' '<PRIORITY_P0>'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[T02] Add pull-request CI checks and migration validation' '--body-file' 'docs/project-management/generated/T02.md' '--label' 'area:delivery,area:quality' '--milestone' 'Testing, CI/CD and Deployment'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_T02>' '--format' 'json'

gh 'project' 'item-edit' '--id' '<ITEM_T02>' '--project-id' '<PROJECT_ID>' '--field-id' '<STATUS_FIELD_ID>' '--single-select-option-id' '<STATUS_Backlog>'

gh 'project' 'item-edit' '--id' '<ITEM_T02>' '--project-id' '<PROJECT_ID>' '--field-id' '<PHASE_FIELD_ID>' '--single-select-option-id' '<PHASE_Testing, CI/CD and Deployment>'

gh 'project' 'item-edit' '--id' '<ITEM_T02>' '--project-id' '<PROJECT_ID>' '--field-id' '<PRIORITY_FIELD_ID>' '--single-select-option-id' '<PRIORITY_P1>'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[ADMIN-03] Secure contestant image upload using Supabase Storage' '--body-file' 'docs/project-management/generated/ADMIN-03.md' '--label' 'area:api,area:web,area:security,area:delivery' '--milestone' 'Admin Dashboard'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_ADMIN-03>' '--format' 'json'

gh 'project' 'item-edit' '--id' '<ITEM_ADMIN-03>' '--project-id' '<PROJECT_ID>' '--field-id' '<STATUS_FIELD_ID>' '--single-select-option-id' '<STATUS_Backlog>'

gh 'project' 'item-edit' '--id' '<ITEM_ADMIN-03>' '--project-id' '<PROJECT_ID>' '--field-id' '<PHASE_FIELD_ID>' '--single-select-option-id' '<PHASE_Admin Dashboard>'

gh 'project' 'item-edit' '--id' '<ITEM_ADMIN-03>' '--project-id' '<PROJECT_ID>' '--field-id' '<PRIORITY_FIELD_ID>' '--single-select-option-id' '<PRIORITY_P1>'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[ADMIN-04] Competition configuration and vote-package management' '--body-file' 'docs/project-management/generated/ADMIN-04.md' '--label' 'area:api,area:web,area:database,area:security' '--milestone' 'Admin Dashboard'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_ADMIN-04>' '--format' 'json'

gh 'project' 'item-edit' '--id' '<ITEM_ADMIN-04>' '--project-id' '<PROJECT_ID>' '--field-id' '<STATUS_FIELD_ID>' '--single-select-option-id' '<STATUS_Backlog>'

gh 'project' 'item-edit' '--id' '<ITEM_ADMIN-04>' '--project-id' '<PROJECT_ID>' '--field-id' '<PHASE_FIELD_ID>' '--single-select-option-id' '<PHASE_Admin Dashboard>'

gh 'project' 'item-edit' '--id' '<ITEM_ADMIN-04>' '--project-id' '<PROJECT_ID>' '--field-id' '<PRIORITY_FIELD_ID>' '--single-select-option-id' '<PRIORITY_P1>'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[A02] Build admin management screens and audit trail' '--body-file' 'docs/project-management/generated/A02.md' '--label' 'area:web,area:api' '--milestone' 'Admin Dashboard'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_A02>' '--format' 'json'

gh 'project' 'item-edit' '--id' '<ITEM_A02>' '--project-id' '<PROJECT_ID>' '--field-id' '<STATUS_FIELD_ID>' '--single-select-option-id' '<STATUS_Backlog>'

gh 'project' 'item-edit' '--id' '<ITEM_A02>' '--project-id' '<PROJECT_ID>' '--field-id' '<PHASE_FIELD_ID>' '--single-select-option-id' '<PHASE_Admin Dashboard>'

gh 'project' 'item-edit' '--id' '<ITEM_A02>' '--project-id' '<PROJECT_ID>' '--field-id' '<PRIORITY_FIELD_ID>' '--single-select-option-id' '<PRIORITY_P1>'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[T03] Deploy staging with separated credentials and controlled migrations' '--body-file' 'docs/project-management/generated/T03.md' '--label' 'area:delivery,area:database,area:security' '--milestone' 'Testing, CI/CD and Deployment'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_T03>' '--format' 'json'

gh 'project' 'item-edit' '--id' '<ITEM_T03>' '--project-id' '<PROJECT_ID>' '--field-id' '<STATUS_FIELD_ID>' '--single-select-option-id' '<STATUS_Backlog>'

gh 'project' 'item-edit' '--id' '<ITEM_T03>' '--project-id' '<PROJECT_ID>' '--field-id' '<PHASE_FIELD_ID>' '--single-select-option-id' '<PHASE_Testing, CI/CD and Deployment>'

gh 'project' 'item-edit' '--id' '<ITEM_T03>' '--project-id' '<PROJECT_ID>' '--field-id' '<PRIORITY_FIELD_ID>' '--single-select-option-id' '<PRIORITY_P0>'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[T04] Prove database recovery and add monitoring/runbooks' '--body-file' 'docs/project-management/generated/T04.md' '--label' 'area:delivery,area:database' '--milestone' 'Testing, CI/CD and Deployment'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_T04>' '--format' 'json'

gh 'project' 'item-edit' '--id' '<ITEM_T04>' '--project-id' '<PROJECT_ID>' '--field-id' '<STATUS_FIELD_ID>' '--single-select-option-id' '<STATUS_Backlog>'

gh 'project' 'item-edit' '--id' '<ITEM_T04>' '--project-id' '<PROJECT_ID>' '--field-id' '<PHASE_FIELD_ID>' '--single-select-option-id' '<PHASE_Testing, CI/CD and Deployment>'

gh 'project' 'item-edit' '--id' '<ITEM_T04>' '--project-id' '<PROJECT_ID>' '--field-id' '<PRIORITY_FIELD_ID>' '--single-select-option-id' '<PRIORITY_P0>'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[T05] Complete release rehearsal and approve paid-voting launch' '--body-file' 'docs/project-management/generated/T05.md' '--label' 'area:quality,area:delivery,area:security' '--milestone' 'Testing, CI/CD and Deployment'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_T05>' '--format' 'json'

gh 'project' 'item-edit' '--id' '<ITEM_T05>' '--project-id' '<PROJECT_ID>' '--field-id' '<STATUS_FIELD_ID>' '--single-select-option-id' '<STATUS_Backlog>'

gh 'project' 'item-edit' '--id' '<ITEM_T05>' '--project-id' '<PROJECT_ID>' '--field-id' '<PHASE_FIELD_ID>' '--single-select-option-id' '<PHASE_Testing, CI/CD and Deployment>'

gh 'project' 'item-edit' '--id' '<ITEM_T05>' '--project-id' '<PROJECT_ID>' '--field-id' '<PRIORITY_FIELD_ID>' '--single-select-option-id' '<PRIORITY_P0>'

gh 'project' 'item-list' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--limit' '1000' '--format' 'json'
