# PROPOSAL ONLY — do not execute before approval
# Run from the repository root. Generated IDs are placeholders in the preview.
# PowerShell-safe quoting is used for review; the runner invokes gh directly with argument arrays.
gh 'auth' 'status'

gh 'repo' 'view' 'ebukanathan/TalentHunt' '--json' 'nameWithOwner,hasIssuesEnabled'

gh 'project' 'list' '--owner' 'ebukanathan' '--limit' '100' '--format' 'json'

gh 'project' 'create' '--owner' 'ebukanathan' '--title' 'TalentHunt — Development Roadmap' '--format' 'json'

gh 'project' 'link' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--repo' 'ebukanathan/TalentHunt'

gh 'project' 'edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--visibility' 'PRIVATE' '--description' 'Solo-developer MVP roadmap: verified foundations, safe paid voting and evidence-based launch.' '--readme' '# TalentHunt — Development Roadmap

Prepared 21 October 2026 (Africa/Lagos). Repository: ebukanathan/TalentHunt.

## Verified baseline

- Root npm workspaces, a generated Next.js starter and an Express /api/v1/health scaffold exist. API TypeScript and frontend lint passed; a live ephemeral-port health check returned HTTP 200/status ok.
- Prisma defines eight models and two enums. Schema validation passed; the configured database reports the initial migration applied. Read-only comparison against the live database found no schema difference.
- Checks establish the local scaffold and configured database on 21 October 2026. A production web build, production environment and application features are not certified.
- No seed, business feature routes, email provider, Paystack integration, admin UI, automated tests or CI workflow was found. Root/API test scripts are failing placeholders.
- Local Git has no commits or remote and all application files are untracked. The existing GitHub repository is public and empty, with no issues/milestones. Done issues retain this local provenance until F04 publishes source.

## Solo workflow

One board, six phase milestones, and three fields: Status, Phase, Priority. Use existing Labels/Milestone metadata. No epics, sprints, estimates or duplicate phase/priority labels.

Columns: **Backlog → Next → In Progress → Done**.

- Backlog: identified work, including unmet dependencies.
- Next: ready to start; initially only F03 database seeding.
- In Progress: actively developed; work-in-progress limit one.
- Done: acceptance criteria have evidence, appropriate checks pass and required migrations are verified on the stated target. Close the issue as completed and update project Status together.
- Dependencies are linked in issue bodies. Record blockers there and leave the task in Backlog rather than adding another workflow state.
- P0: money integrity/security/launch safety. P1: required MVP delivery. P2: optional improvement. Dependencies govern execution; seeding is next even though later safety work is P0.
- Reference an issue in each branch/PR; link validation evidence before closing. Review the next ready task after completion, risks weekly and launch gates before release.
- Initial status/closure updates are explicit and manual. No repository automation is installed by this setup.

## Milestones and roadmap

Each phase has a milestone with the exit criteria below. Dates are intentionally unset until availability and throughput support estimates. Phase themes do not prevent pulling a prerequisite forward.

| Phase / milestone | Issues | Exit gate |
| --- | --- | --- |
| Project Foundation | F01, F02, F03, F04, F05 | Scaffold and initial migration verified; safe repeatable seed, reproducible source/environment setup and API lifecycle ready. |
| Competition and Contestant Management | C01, C02, C03 | Protected management and public browsing enforce competition membership, lifecycle and voting windows. |
| Email Verification | E01, E02, E03 | Deliver, verify, expire, throttle and consume email verification securely; voter verification UI works. |
| Payments and Vote Allocation | P01, P02, P03, P04, P05 | Server-owned checkout, authenticated verified payments, atomic idempotent votes and reconciliation/refund handling pass. |
| Admin Dashboard | A01, A02, A03 | Protected management/reporting and auditable operator actions work. |
| Testing, CI/CD and Deployment | T01, T02, T03, T04, T05 | Critical tests pass in CI; staging, database restore, monitoring and launch rehearsal pass. |

Sequence: **F03 → F04/F05 → A01 → C01/C02 → C03 and E01/E02/E03 → P01/P02/P03/P04/P05 → A02/A03 → staging/launch gates**. Start T02 after F04; build feature tests with each feature. A01 is intentionally pulled forward so management APIs are protected before use. No dates or production readiness are implied.

Initial totals: **24 issues: 2 Done, 1 Next, 0 In Progress, 21 Backlog**.

## Risk register

Owner: **ebukanathan** for every risk. Initial status: **open**. These are prospective risk assessments, not claims of an observed incident. Close or reduce risks only with linked evidence.

| Risk | Likelihood / impact | Prevention/detection | Recovery / release gate | Issues |
| --- | --- | --- | --- | --- |
| R1: Forged, repeated or concurrent payment events grant unpaid/excess votes | High / Critical | Signed webhooks, verified provider facts, immutable snapshots, atomic allocation and race tests | Reconcile ledger/counters; pause checkout if integrity is uncertain. No launch before replay/race tests pass. | P01/P02/P03/T01 |
| R2: Missed callbacks, provider failure or refunds desynchronize money and votes | Medium / Critical | Shared idempotent finalizer, reconciliation, old-pending alerts and explicit late/refund policy | Audited reconciliation/reversals and provider recovery procedure | P05/A03/T04 |
| R3: OTP replay/brute force, compromised admin sessions, secrets or direct Supabase access | High / Critical | Expiry/attempt limits, atomic consumption, secure sessions, CSRF/origin checks, secret scan and least-privilege grants/RLS | Revoke sessions/keys; unresolved critical security issues block release | E01/E02/A01/F04/T03/T05 |
| R4: Bad deployment configuration or unsafe migrations break checkout | Medium / High | Isolated environments, CI, explicit migrations and staging rehearsal | Stop release; restore compatible app and apply reviewed recovery migration; no destructive automatic rollback | F04/T02/T03/T05 |
| R5: Database loss, exhaustion, drift or unproven restore corrupts availability/accounting | Medium / Critical | Correct pooling/limits, reviewed migrations/constraints, backups, restore drill and ledger checks | Restore isolated target, verify ledger and reconcile provider facts; approve RPO/RTO | C01/C02/P03/P05/T03/T04 |
| R6: Code exists only locally and completion cannot be traced to remote source | High / High | Secret-reviewed first commit/push and reproducible setup | Remote source history; preserve explicit local provenance until published | F04 |

## Sources

Payment criteria use official [Paystack webhooks](https://paystack.com/docs/payments/webhooks/) and [payment verification](https://paystack.com/docs/payments/verify-payments/) documentation. GitHub flags were checked with installed gh 2.102.0 help; field/view API input types were inspected read-only through gh api graphql.

## Proposed execution boundary

After explicit approval, the script creates or reuses the exact-title project, links the repository, writes this project README, configures Status/Phase/Priority, creates a Kanban board, creates seven missing area labels and six milestones, creates 24 detailed issues, adds them to the project and closes F01/F02 with evidence.

The project will be private. The existing repository remains public, so issue bodies and milestones will be public. No secrets or connection strings appear in these artifacts.

No application code is changed, committed or pushed; no database seed/migration runs; repository visibility and unrelated projects remain unchanged. Default script execution is a local command preview with no GitHub requests. --apply is reserved for approval after reviewing the proposal.
'

gh 'project' 'field-list' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--limit' '100' '--format' 'json'

gh 'api' 'graphql' '--input' 'docs/project-management/generated/status-options.json'

gh 'project' 'field-create' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--name' 'Phase' '--data-type' 'SINGLE_SELECT' '--single-select-options' 'Project Foundation,Competition and Contestant Management,Email Verification,Payments and Vote Allocation,Admin Dashboard,Testing, CI/CD and Deployment' '--format' 'json'

gh 'project' 'field-create' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--name' 'Priority' '--data-type' 'SINGLE_SELECT' '--single-select-options' 'P0,P1,P2' '--format' 'json'

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

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_F01>' '--field' 'Status' '--value' 'Done'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_F01>' '--field' 'Phase' '--value' 'Project Foundation'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_F01>' '--field' 'Priority' '--value' 'P1'

gh 'issue' 'close' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_F01>' '--repo' 'ebukanathan/TalentHunt' '--reason' 'completed'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[F02] Define initial Prisma models and verify initial database migration' '--body-file' 'docs/project-management/generated/F02.md' '--label' 'area:database' '--milestone' 'Project Foundation'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_F02>' '--format' 'json'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_F02>' '--field' 'Status' '--value' 'Done'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_F02>' '--field' 'Phase' '--value' 'Project Foundation'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_F02>' '--field' 'Priority' '--value' 'P1'

gh 'issue' 'close' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_F02>' '--repo' 'ebukanathan/TalentHunt' '--reason' 'completed'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[F03] Implement repeatable development database seeding' '--body-file' 'docs/project-management/generated/F03.md' '--label' 'area:database' '--milestone' 'Project Foundation'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_F03>' '--format' 'json'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_F03>' '--field' 'Status' '--value' 'Next'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_F03>' '--field' 'Phase' '--value' 'Project Foundation'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_F03>' '--field' 'Priority' '--value' 'P1'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[F04] Publish a reproducible source and environment baseline' '--body-file' 'docs/project-management/generated/F04.md' '--label' 'area:delivery,documentation' '--milestone' 'Project Foundation'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_F04>' '--format' 'json'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_F04>' '--field' 'Status' '--value' 'Backlog'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_F04>' '--field' 'Phase' '--value' 'Project Foundation'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_F04>' '--field' 'Priority' '--value' 'P1'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[F05] Add API configuration, Prisma lifecycle and safe error handling' '--body-file' 'docs/project-management/generated/F05.md' '--label' 'area:api,area:security' '--milestone' 'Project Foundation'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_F05>' '--format' 'json'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_F05>' '--field' 'Status' '--value' 'Backlog'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_F05>' '--field' 'Phase' '--value' 'Project Foundation'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_F05>' '--field' 'Priority' '--value' 'P1'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[E01] Send verification codes with expiry and abuse controls' '--body-file' 'docs/project-management/generated/E01.md' '--label' 'area:api,area:security' '--milestone' 'Email Verification'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_E01>' '--format' 'json'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_E01>' '--field' 'Status' '--value' 'Backlog'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_E01>' '--field' 'Phase' '--value' 'Email Verification'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_E01>' '--field' 'Priority' '--value' 'P1'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[E02] Verify email and atomically consume checkout authorization' '--body-file' 'docs/project-management/generated/E02.md' '--label' 'area:api,area:security' '--milestone' 'Email Verification'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_E02>' '--format' 'json'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_E02>' '--field' 'Status' '--value' 'Backlog'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_E02>' '--field' 'Phase' '--value' 'Email Verification'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_E02>' '--field' 'Priority' '--value' 'P0'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[A01] Implement administrator authentication and protected API access' '--body-file' 'docs/project-management/generated/A01.md' '--label' 'area:security,area:api' '--milestone' 'Admin Dashboard'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_A01>' '--format' 'json'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_A01>' '--field' 'Status' '--value' 'Backlog'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_A01>' '--field' 'Phase' '--value' 'Admin Dashboard'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_A01>' '--field' 'Priority' '--value' 'P0'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[C01] Implement protected competition lifecycle and vote-package management' '--body-file' 'docs/project-management/generated/C01.md' '--label' 'area:api,area:database' '--milestone' 'Competition and Contestant Management'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_C01>' '--format' 'json'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_C01>' '--field' 'Status' '--value' 'Backlog'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_C01>' '--field' 'Phase' '--value' 'Competition and Contestant Management'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_C01>' '--field' 'Priority' '--value' 'P1'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[C02] Implement protected contestant management and cross-competition guards' '--body-file' 'docs/project-management/generated/C02.md' '--label' 'area:api,area:database' '--milestone' 'Competition and Contestant Management'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_C02>' '--format' 'json'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_C02>' '--field' 'Status' '--value' 'Backlog'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_C02>' '--field' 'Phase' '--value' 'Competition and Contestant Management'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_C02>' '--field' 'Priority' '--value' 'P1'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[C03] Build public competition pages, contestant profiles and leaderboard' '--body-file' 'docs/project-management/generated/C03.md' '--label' 'area:web,area:api' '--milestone' 'Competition and Contestant Management'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_C03>' '--format' 'json'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_C03>' '--field' 'Status' '--value' 'Backlog'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_C03>' '--field' 'Phase' '--value' 'Competition and Contestant Management'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_C03>' '--field' 'Priority' '--value' 'P1'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[E03] Build the voter email-verification flow' '--body-file' 'docs/project-management/generated/E03.md' '--label' 'area:web' '--milestone' 'Email Verification'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_E03>' '--format' 'json'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_E03>' '--field' 'Status' '--value' 'Backlog'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_E03>' '--field' 'Phase' '--value' 'Email Verification'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_E03>' '--field' 'Priority' '--value' 'P1'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[P01] Initialize Paystack checkout using server-owned payment snapshots' '--body-file' 'docs/project-management/generated/P01.md' '--label' 'area:payments,area:api' '--milestone' 'Payments and Vote Allocation'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_P01>' '--format' 'json'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_P01>' '--field' 'Status' '--value' 'Backlog'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_P01>' '--field' 'Phase' '--value' 'Payments and Vote Allocation'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_P01>' '--field' 'Priority' '--value' 'P0'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[P02] Authenticate Paystack webhooks and verify payment facts' '--body-file' 'docs/project-management/generated/P02.md' '--label' 'area:payments,area:security' '--milestone' 'Payments and Vote Allocation'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_P02>' '--format' 'json'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_P02>' '--field' 'Status' '--value' 'Backlog'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_P02>' '--field' 'Phase' '--value' 'Payments and Vote Allocation'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_P02>' '--field' 'Priority' '--value' 'P0'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[P03] Allocate paid votes exactly once under concurrent delivery' '--body-file' 'docs/project-management/generated/P03.md' '--label' 'area:payments,area:database' '--milestone' 'Payments and Vote Allocation'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_P03>' '--format' 'json'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_P03>' '--field' 'Status' '--value' 'Backlog'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_P03>' '--field' 'Phase' '--value' 'Payments and Vote Allocation'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_P03>' '--field' 'Priority' '--value' 'P0'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[P04] Build checkout return, payment status and voter receipt screens' '--body-file' 'docs/project-management/generated/P04.md' '--label' 'area:web,area:payments' '--milestone' 'Payments and Vote Allocation'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_P04>' '--format' 'json'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_P04>' '--field' 'Status' '--value' 'Backlog'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_P04>' '--field' 'Phase' '--value' 'Payments and Vote Allocation'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_P04>' '--field' 'Priority' '--value' 'P1'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[P05] Reconcile payments and implement auditable refund/vote-reversal handling' '--body-file' 'docs/project-management/generated/P05.md' '--label' 'area:payments,area:database' '--milestone' 'Payments and Vote Allocation'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_P05>' '--format' 'json'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_P05>' '--field' 'Status' '--value' 'Backlog'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_P05>' '--field' 'Phase' '--value' 'Payments and Vote Allocation'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_P05>' '--field' 'Priority' '--value' 'P0'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[A02] Build admin management screens and audit trail' '--body-file' 'docs/project-management/generated/A02.md' '--label' 'area:web,area:api' '--milestone' 'Admin Dashboard'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_A02>' '--format' 'json'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_A02>' '--field' 'Status' '--value' 'Backlog'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_A02>' '--field' 'Phase' '--value' 'Admin Dashboard'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_A02>' '--field' 'Priority' '--value' 'P1'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[A03] Build admin payment, vote and reconciliation reporting' '--body-file' 'docs/project-management/generated/A03.md' '--label' 'area:web,area:payments' '--milestone' 'Admin Dashboard'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_A03>' '--format' 'json'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_A03>' '--field' 'Status' '--value' 'Backlog'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_A03>' '--field' 'Phase' '--value' 'Admin Dashboard'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_A03>' '--field' 'Priority' '--value' 'P1'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[T01] Establish security and payment-integrity regression tests' '--body-file' 'docs/project-management/generated/T01.md' '--label' 'area:quality,area:payments' '--milestone' 'Testing, CI/CD and Deployment'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_T01>' '--format' 'json'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_T01>' '--field' 'Status' '--value' 'Backlog'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_T01>' '--field' 'Phase' '--value' 'Testing, CI/CD and Deployment'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_T01>' '--field' 'Priority' '--value' 'P0'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[T02] Add pull-request CI checks and migration validation' '--body-file' 'docs/project-management/generated/T02.md' '--label' 'area:delivery,area:quality' '--milestone' 'Testing, CI/CD and Deployment'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_T02>' '--format' 'json'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_T02>' '--field' 'Status' '--value' 'Backlog'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_T02>' '--field' 'Phase' '--value' 'Testing, CI/CD and Deployment'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_T02>' '--field' 'Priority' '--value' 'P1'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[T03] Deploy staging with separated credentials and controlled migrations' '--body-file' 'docs/project-management/generated/T03.md' '--label' 'area:delivery,area:database,area:security' '--milestone' 'Testing, CI/CD and Deployment'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_T03>' '--format' 'json'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_T03>' '--field' 'Status' '--value' 'Backlog'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_T03>' '--field' 'Phase' '--value' 'Testing, CI/CD and Deployment'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_T03>' '--field' 'Priority' '--value' 'P0'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[T04] Prove database recovery and add monitoring/runbooks' '--body-file' 'docs/project-management/generated/T04.md' '--label' 'area:delivery,area:database' '--milestone' 'Testing, CI/CD and Deployment'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_T04>' '--format' 'json'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_T04>' '--field' 'Status' '--value' 'Backlog'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_T04>' '--field' 'Phase' '--value' 'Testing, CI/CD and Deployment'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_T04>' '--field' 'Priority' '--value' 'P0'

gh 'issue' 'create' '--repo' 'ebukanathan/TalentHunt' '--title' '[T05] Complete release rehearsal and approve paid-voting launch' '--body-file' 'docs/project-management/generated/T05.md' '--label' 'area:quality,area:delivery,area:security' '--milestone' 'Testing, CI/CD and Deployment'

gh 'project' 'item-add' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_T05>' '--format' 'json'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_T05>' '--field' 'Status' '--value' 'Backlog'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_T05>' '--field' 'Phase' '--value' 'Testing, CI/CD and Deployment'

gh 'project' 'item-edit' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--url' 'https://github.com/ebukanathan/TalentHunt/issues/<ISSUE_T05>' '--field' 'Priority' '--value' 'P0'

gh 'project' 'item-list' '<PROJECT_NUMBER>' '--owner' 'ebukanathan' '--limit' '1000' '--format' 'json'
