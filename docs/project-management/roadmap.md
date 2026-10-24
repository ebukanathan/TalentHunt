# TalentHunt - Development Roadmap

Updated 24 October 2026 (Africa/Lagos). Repository: [ebukanathan/TalentHunt](https://github.com/ebukanathan/TalentHunt). [GitHub Project](https://github.com/users/ebukanathan/projects/3).

## Confirmed product requirements

Checkout requires an email address for payment receipts, successful voting confirmations, transaction-related communication and customer support. Voters do not need an account, email OTP or verification link. Keep Payment.contactEmail required. Checkout must not enroll anyone in marketing; any future marketing needs separate appropriate consent.

Paystack payment verification and atomic vote allocation operate independently of email delivery. After confirmed payment and successful allocation, create one durable confirmation intent in the same database transaction; a background worker sends a combined receipt/voting confirmation through a reliable provider. Permanent unique intent keys, provider idempotency, leases and bounded retries prevent duplicate submissions. Resend is proposed; its 24-hour idempotency window requires reconciliation of uncertain sends before retrying beyond the safe deadline.

Detailed local artifacts: [product requirements](../product/paid-voting-requirements.md), [proposed Paystack/API/schema plan](../api/checkout-and-confirmations.md), [implemented read API](../api/core-rest-api.md). This is planning work. Review the integration and migration proposal before implementation. GitHub repository links to these new documents become available after publication.

## Current baseline and work in progress

The repository is published. The initial schema/migration, repeatable seed and public Express read API are complete (F01/F02/F03 and #27). Public Next.js homepage/list work is present locally; #29 remains open and In Progress with [PR #33](https://github.com/ebukanathan/TalentHunt/pull/33). Profiles #30, package selection #31 and leaderboard #32 remain separate Stage 3 work under #11. Broader setup/configuration/admin issues remain open; this update does not claim their completion.

No checkout, Paystack processing, voter email verification or transactional email provider is implemented. The existing ContactVerification model is legacy scaffolding. The seed integration test still counts it and must be adjusted with any reviewed future removal.

Read-only configured development database review on 24 October 2026: 0 payments, 0 non-null Payment.verificationId links, 0 ContactVerification rows and 0 allocations. These aggregate counts do not authorize removal in other environments. No database records were modified.

## Solo workflow and next issue

Columns: **Backlog -> Next -> In Progress -> Done**. Keep one item In Progress. Completion requires linked implementation/check evidence and appropriate migration validation. Requirements changes alone do not complete implementation issues.

**Next proposed issue: [E02 #7 - Prepare history-preserving checkout email and confirmation schema](https://github.com/ebukanathan/TalentHunt/issues/7), P0.** Review the proposal before implementing it; finish/review the existing #29 work before starting another feature. The board's Next designation records the proposed order and does not authorize database changes.

E02 replaces its obsolete OTP-authorization scope. E01 #6 becomes the confirmation delivery worker/provider integration; E03 #12 becomes required-email checkout UI. Preserve issue IDs and history. All three stay open. The phase/milestone formerly called Email Verification is renamed **Checkout Email and Transactional Confirmations**, retaining its existing identity and item assignments.

## Milestones and sequence

| Phase / milestone | Issues | Exit gate |
| --- | --- | --- |
| Project Foundation | F01-F05 | Repeatable environment, seed, database lifecycle and safe API configuration. |
| Competition and Contestant Management | C01-C03, #27, #29-#32 | Protected management and real public browsing with honest voting-window state. |
| Checkout Email and Transactional Confirmations | E01-E03 | Required contact email without OTP/link verification; safe schema transition; deduplicated post-allocation confirmations; transactional-only messaging. |
| Payments and Vote Allocation | P01-P05 | Server-owned checkout, authenticated and verified Paystack facts, atomic votes/outbox, separate delivery status and reconciliation/refund handling. |
| Admin Dashboard | A01-A03 | Protected management, restricted voter-contact access and audited payment/delivery support operations. |
| Testing, CI/CD and Deployment | T01-T05 | Integrity and delivery-failure tests, CI, staging, recovery, monitoring and launch rehearsal. |

Payment-change sequence: **review -> E02 -> P01 -> P02 -> P03 -> E01**. Build **E03** after #31 and P01, then **P04** after E03/P03. E01 is a launch gate, not a prerequisite for payment verification/allocation. Preserve C02/F05 prerequisites for P01 and existing admin-management dependencies. T01 includes the email worker, checkout and migration safety tests; staging T03 also depends on E01. No schedule or production readiness is implied.

## Schema and migration rules

Keep Payment.contactEmail, immutable money/vote/attribution snapshots, historical payments and allocations. Add empty TransactionEmail/EmailDeliveryEvent tables for permanent unique logical confirmations, immutable recipient/payload snapshots, provider IDs/events, leases, retry deadlines and delivery state. P01/P02 separately propose empty checkout-attempt/webhook-inbox tables.

ContactVerification and Payment.verificationId/relation/index/FK can be removed only by a new reviewed forward migration after proving all intended targets have no historical verification rows/links and all consumers are compatible. Lock and assert the preconditions. If any target has history, retain/deprecate the legacy schema and use the same additive migration history across environments. Never clear links, alter existing payments, auto-enqueue historical confirmations, delete data, reset the database or edit/remove historical migrations to make this transition pass.

## Risk register

Owner: ebukanathan. Prospective risks remain open until evidence closes them.

| Risk | Control / release evidence | Issues |
| --- | --- | --- |
| Forged or repeated payment grants unpaid/excess votes | Signed raw-body webhooks, server verification of amount/currency/reference/environment, unique provider IDs and PostgreSQL atomicity/concurrency tests. | P01/P02/P03/T01 |
| Missed events, late payment or refunds desynchronize money/votes | Shared idempotent finalizer, verified payment-time policy, reconciliation and audited reversal ledger preserving original allocations. | P05/A03/T04 |
| Unverified contact misuse, receipt enumeration or compromised admin access | Input/rate/origin controls, scoped receipt capability independent of email ownership, restricted contacts, secure admin sessions and no marketing without consent. | E03/P01/P04/A01/T05 |
| Duplicate or lost confirmation after outage/crash | Transactional outbox, permanent unique intent, immutable provider payload/key, 23-hour conservative retry deadline within proposed provider's 24-hour retention, lease races/crash tests, reconciliation before ambiguous later resend. | E02/P03/E01/T01/T04 |
| Legacy removal destroys history or breaks an old client | Per-target read-only inventory, one compatible migration history, locked empty-data assertions, retain populated legacy objects, snapshot/checksum comparison and staged rollout. | E02/T01/T03 |
| Database loss or unsafe deployment breaks accounting | Isolated environments, reviewed forward migrations, backup/restore rehearsal, least privilege, monitored pools and ledger checks. | F04/T02/T03/T04/T05 |

## Sources and planning tooling

Provider plans use official [Paystack transactions](https://paystack.com/docs/api/transaction/), [webhooks](https://paystack.com/docs/payments/webhooks/), [verification](https://paystack.com/docs/payments/verify-payments/) and [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys) documentation checked on 24 October 2026.

backlog.json and proposed-backlog.md track the original keyed issues with updated requirements; Stage 3 child issues and their live progress remain on GitHub. created-resources.json records the historical project setup and must not be treated as current requirements. The original github-roadmap.mjs is a setup/preview tool, not a routine live-project synchronizer. Its --plan mode makes no GitHub requests. Do not run --apply to replay old statuses or recreate the Project. This change uses targeted issue/milestone/field edits, preserving unrelated progress and public/private visibility.
