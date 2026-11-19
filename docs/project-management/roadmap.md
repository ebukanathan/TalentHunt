# TalentHunt — Non-payment development roadmap

## Current priority: dynamic category hierarchy

18 November 2026: the user approved the [category design and starting CAT-01](category-scope-plan.md), then approved its review gate and continuation. CAT-01 #62 is accepted/Done after PR #66 merged into its dependency branch (`29596e2`), without merging the earlier stack into main. CAT-02 #63 is accepted/Done after its approved dependency merge #67 (`a6c78e1`). A separate PR #68 subsequently merged that dependency base into main as `4a94dc8`. CAT-03 #64 awaits review in PR #69 targeting main (the tested dependency base and main have identical trees). The 19 November expanded public requirements authorize sequential CAT-04/CAT-05 work: CAT-04 #65 is delivered in dependent PR #70 and CAT-05 #32 is delivered on a separate dependent branch for review. Combined automated checks pass: 172 API tests, 67 frontend tests, real web integration, production build/HTTP suites, lint and migration drift. All are P0 in `0. Categories and subcategories`. See the [CAT-01 migration runbook](../database/category-hierarchy.md) and [CAT-02 admin contract](../admin/category-management.md).

Implement one issue/feature branch/linked PR at a time; the current request authorizes the two public phases sequentially while preserving separate PR review and requiring approval before any merge. CAT-01 expands the schema without inventing assignments or modifying historical payments/votes/media. Exact-one enforcement follows explicit classification in a separately gated CAT-03 migration. All business taxonomy is dynamically administrator-created.

The visibility/public-refinement source below was integrated by the separate PR #68; historical delivery notes are retained, while unfinished manual/security/release acceptance remains distinct; its competition-wide ranking is superseded by required subcategory isolation. No automatic merges or further hosted migrations; the previously authorized additive development rollout is recorded in CAT-03. Paystack development remains paused. The prior delivery notes below retain their historical context.

Updated 18 November 2026 (Africa/Lagos). [Project board](https://github.com/users/ebukanathan/projects/3). The public website audit/plan is approved; implementation is delivered through small stacked feature branches. Merging still requires user approval.

## Execution order

| Order | Work | Issues | State |
| --- | --- | --- | --- |
| 1 | Admin dashboard overview and real database statistics | #41; audit explorer parent #18 | Done on the Project board |
| 2 | Leaderboard visibility and confirmed final publication | #32, PR #48 | In Progress / awaiting review |
| 3 | Public website responsiveness, accessibility, performance and SEO | #42, #30, #31; children #49–#52 and #58 | In Progress / open refinement PRs |
| 4 | Standalone transactional email infrastructure/templates | #43; configuration support #5 | Backlog |
| 5 | Tests, framework security and CI/CD | #20, #21, #53; remaining #5 | Feature checks accompany changes; security assessment #53 is Next; broader CI remains unfinished |
| 6 | Non-payment staging and documentation | scoped #22, #23, #4 | Backlog; framework security patching is a release prerequisite |

Group/filter by Roadmap workstream. Open PRs are not Done and are not merged automatically. Payment-dependent work retains its Paused workstream and P2 priority.

## Public refinement delivery

Parent #42 follows the approved source/HTTP/GitHub audit. Videos were delivered through merged PR #47 (#46); refinement preserves their canonical IDs, lazy privacy-enhanced embeds and zero-video hiding. Leaderboard PR #48 is the privacy prerequisite, including server-side redaction of hidden totals in all public contestant responses.

Review the stack in order:

1. PR #54 / #49: shared design tokens, mobile disclosure, active navigation, focus/keyboard semantics, route loading states and accessible standings overflow.
2. PR #55 / #50: responsive Next Image handling for a strict managed origin, eager above-fold portraits, lazy cards and legacy/failure fallbacks.
3. PR #56 / #31: selection-only package route, native radios, exact kobo totals, eligibility boundaries and explicit unavailable payments.
4. PR #57 / #30: profile actions, public membership validation, responsive biography/portrait/totals and status-aware navigation.
5. PR #59 / #51: dynamic identity-only metadata, canonical/OG sharing, discovery and request-time data policy.
6. PR #60 / #58: bounded card API and server pagination, preserving existing full contestant/video contracts. Deploy the additive API before the web consumer.
7. #52: production HTTP/privacy and real Next–Express–PostgreSQL verification, explicit discovery cache headers, manual test instructions and evidence.

See [implementation and manual testing](../public-website-refinement.md), [verification evidence](../public-website-verification.md) and [framework security assessment](../public-website-security-assessment.md). Browser evidence and framework patching remain explicit review/release gates; source and HTTP checks are not a substitute for interactive accessibility review. Broader #4/#5/#18/#20/#21/#22/#23 acceptance is not marked complete by this work.

## Configuration and rollout

Set server-only SITE_URL to the trusted public origin and NEXT_PUBLIC_CONTESTANT_IMAGE_ORIGIN to the managed public storage origin at build time. Never expose storage/provider secrets. Missing canonical configuration disables indexing. Public APIs, metadata, sharing and discovery must preserve visibility rules; ranks and totals never appear in social/search metadata. Use isolated fixtures for status/publication testing, not hosted competition records.

## Payment suspension

Paystack/payment development remains suspended until explicitly resumed. #14–#17, payment reporting #19, payment-linked #6/#7/#12 and paid launch #24 stay Backlog/Paused. Preserve existing initialization code, financial/legacy verification models, records and all migration history. Existing provider-fake regression checks do not authorise new payment work. Do not infer revenue from packages or votes, or create artificial production results.

Standalone email #43 remains separate from payment-triggered dispatch. Non-payment staging does not constitute a paid-voting launch. No issue IDs, historical migrations, private project visibility or unrelated completed work are removed.
