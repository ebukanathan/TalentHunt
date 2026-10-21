# TalentHunt — Development Roadmap

Prepared 21 October 2026 (Africa/Lagos). Repository: ebukanathan/TalentHunt.

## Setup status

Created through GitHub CLI: [Kanban board](https://github.com/users/ebukanathan/projects/3/views/2), 24 detailed issues, six milestones, seven area labels and the Status/Phase/Priority fields. Verified initial state: 2 Done, database seeding alone in Next, 21 Backlog. Both API and web production builds passed.

The following baseline and proposed boundary record the original review. Source publication was subsequently authorized and is tracked in F04; that issue stays open until every setup/reproducibility criterion is verified.

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
