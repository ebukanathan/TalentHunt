# TalentHunt critical release gate — 26 November 2026

**NO-GO until the checks below have evidence. No production/live activation.**

## Source and current evidence

- Integrated worktree: `.worktrees/integration`, branch
  `release/staging-20261126`, application-only release candidate based on PR #79.
  The integration draft commit remains preserved; workflow edits are omitted because
  the available GitHub OAuth token lacks workflow-edit scope. Run existing CI by
  workflow_dispatch against the exact release SHA.
- Prior GitHub-verified baseline: `f33fc7187b1c5ae4c3bcf4429012f9e718cbc172`.
  New payment/email/configuration changes need an exact-commit full CI result.
- Current localhost API health and admin login page return HTTP 200. This is
  availability evidence, not proof the new candidate is running or login succeeds.
- Focused guards/signature/HTTP email tests: 11 pass. Checkout/session tests:
  12 pass. Prisma 6.19.3 validate/generate, API build and test type checks passed
  in an isolated secret-free copy before the latest diagnostic/config refinements.
- The Windows financial run stalled on a transaction holding a Competition lock.
  Preserve its log; do not report its database suites as passed. Exact-commit Linux
  CI plus concurrent allocation/recovery tests must pass before staging release.
- Financial/e-mail integration test requests use mocked transports and block
  external requests. They are not real hosted Paystack/Resend evidence.

## Critical implementation changes under verification

- Explicit test/live configurations with mode-matching keys. Live initialization
  requires production origin/callback, explicit activation approval, enabled
  finalization and signed webhooks. Production templates keep all gates off.
- New reservations freeze `Payment.paymentEnvironment`; unknown historical
  payments are not silently reclassified. Verification, webhook claims, immutable
  evidence, allocation, status responses and checkout capabilities bind mode.
- Provider verification remains server-side and checks successful status,
  reference, amount, NGN, timestamps and lossless transaction identity. Merchant
  account ownership/key selection must be confirmed against the approved Paystack
  dashboard during the hosted test. A callback supplies no allocation authority.
- Existing locking, unique ledger/allocation constraints, atomic counters/audit
  and durable webhook retry/recovery remain in place. Delayed payment processing
  beyond existing voting eligibility/result-publication rules remains review-only;
  do not bypass those rules or publish results with unresolved paid purchases.
- Resend receipt worker uses immutable snapshots, leases and one stable provider
  idempotency key. Automatic dispatch stops before the provider's 24h key expiry.
  Uncertain/late sends require review. Test recipients are explicitly allowlisted.
  Signed raw-byte Svix webhooks distinguish accepted, delivered and failed mail.
  Mail handling never calls the vote allocator.
- Prisma/client 6.19.3 with scoped `@prisma/config` overrides for `effect` 3.22.1
  and `deepmerge-ts` 8.0.0 addresses the four high findings in the lockfile audit.
  Runtime concurrency and CLI compatibility still require the full gate. Seven
  moderate ESLint/parser tooling findings remain separately documented; no forced
  Prisma major upgrade or blanket glob override is used.
- Two forward-only migrations are proposed, in addition to the eleven unchanged
  historical migrations: payment environment binding and receipt delivery guards.
  Neither has been applied to a hosted database. No historical payment backfill,
  reset, record deletion or migration-history rewrite is authorized.

## Staging resource/configuration approval requested

| Item | Proposal | State |
| --- | --- | --- |
| DigitalOcean | One Ubuntu 24.04 x86-64 Basic 2 GiB/1 vCPU staging Droplet | Resource budget approved; account access to verify |
| Compute/backups | $12/month + $3.60/month daily backups, before tax/usage | Budget approved; no purchase made |
| Hostname | `staging-talent.apearlschools.com` | Confirmed by user; DNS/server not configured here |
| Nginx/systemd | One HTTPS origin; independent web/API/Paystack/receipt workers; 3000/4000 loopback only | Templates under `deploy/digitalocean/` |
| Supabase | Explicit isolated staging project, PostgreSQL/session pooler + contestant-images bucket | Project mlixufwdivbfhdqbjfpg approved; credentials pending |
| Paystack | Approved merchant's TEST key and mode-specific webhook signing keys | Private configuration/dashboard verification pending |
| Resend | HTTPS API, verified sender, signed receipt webhook, approved test inbox | Provider confirmed; sender/keys/inbox pending |
| Paid add-ons | No new paid Supabase, Resend, PITR or monitoring upgrade included | Separate approval required |

Approved staging project: `mlixufwdivbfhdqbjfpg` at
`https://mlixufwdivbfhdqbjfpg.supabase.co`. The previous project
`zuzslpwyhjqgpsxhbxis` must remain untouched. Request separate approval for the
reviewed migration/storage operations after verifying the private connection target.

Public paths after approved deployment:

- Frontend: `https://staging-talent.apearlschools.com`
- API: `https://staging-talent.apearlschools.com/api/v1`
- Paystack callback: `/payments/return`
- Paystack signed webhook: `/api/v1/webhooks/paystack`
- Resend signed webhook: `/api/v1/webhooks/resend`

These are configured target URLs, **not verified deployed URLs**. No production
DNS or `talent.apearlschools.com` activation is permitted. SSH credentials must be
configured privately; do not paste keys/passwords into chat. The school domain
administrator handles reviewed A/AAAA/CAA and Resend-provided authentication records.

## Required evidence before a production approval request

- [ ] One exact source SHA has green critical CI, type checks, lint and builds.
- [ ] Approved staging host/config, TLS renewal, DB identity/UTC/migration status,
      storage permissions and absence of anonymous private-table exposure.
- [ ] Browser evidence: admin login/logout/reload, contestant create/edit/image
      retry and public refresh, categories/subcategories, two videos, leaderboard
      visibility/grouping, voting, mobile/desktop and repeated navigation.
- [ ] Hosted real Paystack TEST checkout: correct merchant/reference/amount/NGN,
      signature-authenticated webhook, server verification, one allocation and
      exact contestant/subcategory leaderboard increment.
- [ ] Duplicate/repeated/delayed event and commit-before-ack recovery evidence;
      invalid signatures and browser-only callbacks cannot grant votes.
- [ ] Resend provider acceptance **and signed delivery event** for the approved
      inbox; bounced/failed/ambiguous send handling leaves vote totals unchanged.
- [ ] Reconciliation reports no unresolved successful payments/ledger drift.
- [ ] Agreed staging load/soak test; resize only with measured need and approval.
- [ ] Restore/backups/alerts/handover and release rollback reviewed. Droplet backups
      do not cover remote DB/images; Supabase DB backups exclude Storage objects.

Only after those pass request separate explicit approval for production deployment
and DNS, private live-key configuration, one controlled real-money verification,
and finally public paid voting. Never infer approval from a passing test or deadline.
