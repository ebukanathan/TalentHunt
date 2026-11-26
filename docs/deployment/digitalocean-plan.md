# TalentHunt: DigitalOcean deployment and handover plan

Prepared 26 November 2026. This plan supersedes the Vercel/Render proposal.
**Planning only:** no paid resource, server, DNS record, certificate, environment
file or hosted database has been created or changed. No production deployment or
live Paystack activation is authorized. Commands below are for the approved new
Droplet, not the current Windows development computer.

## Architecture and release boundary

Use **Ubuntu 24.04 LTS x86-64**, matching the existing Ubuntu 24.04 CI runner;
pin the same supported Node 24 patch in CI and on the server. Ubuntu 26.04 LTS is
also available, but changing the tested OS is unnecessary for this initial release.
Start with a Basic **2 GiB RAM / 1 shared vCPU / 50 GiB SSD** staging Droplet.
Build in GitHub Actions, not on the small running server. One environment per
Droplet is recommended; 2 GiB is not a commitment to host both environments.

```text
Browser / Paystack
        | HTTPS :443
    Nginx + Certbot
        |-- /api/v1/* ------------> Express :4000
        |-- everything else -----> Next.js :3000
                                      | server-side loopback API requests
    Independent systemd services: web / api / paystack worker
    Existing image-cleanup command: systemd timer, once per hour
        |-- PostgreSQL ----------> approved Supabase project, TLS/session pooler
        |-- images --------------> same environment's Supabase Storage
        |-- verification --------> Paystack API (TEST only during staging)
```

Nginx must leave `/api/admin/*` and `/api/checkout/*` on **Next**, preserving
the existing authentication/checkout proxies. Only `/api/v1/*` goes directly to
Express. Do not remove the `/api/v1` prefix while proxying. Raw webhook bytes must
remain unchanged. No separate public API hostname is needed on this architecture.
Expose only 80/443 and restricted SSH; app listeners must be loopback-only.

Source: `.worktrees/integration`, branch `integration/all-completed-features`,
baseline `f33fc7187b1c5ae4c3bcf4429012f9e718cbc172`. All completed features and the
selector fix are on this baseline. The prior CORS/Supabase staging preparation
remains local and uncommitted; **there is not yet a final DigitalOcean release SHA**.
Do not deploy the older root worktree or combine files from several directories.

Before assigning the release SHA:

1. Review the existing local changes and adapt the hosted-test guard from a
   Vercel hostname restriction to an explicitly approved staging HTTPS origin.
   Preserve its approved project binding, TLS validation and `sk_test_` restriction.
2. Add explicit loopback binding for the API's deployment configuration. Its
   current `app.listen(PORT)` listens on unspecified interfaces; setting an
   unsupported `HOST` variable would not fix that. Firewall restrictions remain
   mandatory. This is a deployment configuration adjustment, not an auth rewrite.
3. Prepare/review the systemd/Nginx/deployment scripts and environment templates,
   commit them with the configuration changes, and run the complete gate on that
   exact commit. Record its 40-character SHA and artifact checksums.
4. Build staging and eventual production from that **same source SHA**. Separate
   builds are needed for their different `NEXT_PUBLIC_CONTESTANT_IMAGE_ORIGIN`
   values, which Next inlines at build time. Never promote staging secrets/caches.

The prior fresh local gate passed TypeScript, lint, API/frontend builds, Prisma
validation/drift, 125 financial tests, 196 API tests, 70 frontend tests and 20
browser tests. This is baseline/preparation evidence, not proof of Droplet capacity
or a completed DigitalOcean deployment. See `staging-results.md` for provenance.

## Separate environment configuration

`STAGING_HOST` is **unconfirmed**. Proposed: `staging-talent.apearlschools.com`,
subject to school approval. Production is `talent.apearlschools.com`, reserved for
later explicit go-live approval. Never put both environments on the production URL.

| Setting | Staging | Production preparation |
| --- | --- | --- |
| Public origin | `https://STAGING_HOST` | `https://talent.apearlschools.com` (not activated) |
| Web API base, server-only | `http://127.0.0.1:4000/api/v1` | same loopback path on separate production Droplet |
| `ADMIN_APP_ORIGIN`, `SITE_URL`, `CHECKOUT_APP_ORIGIN` | exact staging HTTPS origin | exact production HTTPS origin |
| Database and image project | explicitly approved isolated TEST project | independently approved production project |
| Public image build setting | staging Supabase origin only | production Supabase origin only |
| Checkout | test enabled only after full staging configuration | disabled pending later live-payment approval and code review |
| Paystack API/signing keys | test keys only, stored privately | absent until separately approved; never use test keys as live keys |
| Callback | `https://STAGING_HOST/payments/return` | future `https://talent.apearlschools.com/payments/return` |
| Webhook | `https://STAGING_HOST/api/v1/webhooks/paystack` | future `https://talent.apearlschools.com/api/v1/webhooks/paystack` |

Both deployed environments use `NODE_ENV=production` (optimized Node/Next mode).
Logical staging is separately marked `DEPLOYMENT_ENV=staging`; do not run `next dev`.
Public checkout is Paystack's returned `https://checkout.paystack.com/...` URL.
Existing initialization routes are `POST /api/checkout/initialize` on Next and
`POST /api/v1/payments/initialize` on Express. Status routes are
`POST /api/checkout/status` and `POST /api/v1/payments/:reference/status`.

Store host credentials under `/etc/talenthunt/staging/{web,api}.env` and, later,
`/etc/talenthunt/production/{web,api}.env`; root-owned mode 0600, parent 0700.
systemd reads the appropriate file before dropping privileges. Web gets only its
checkout secret and public/origin/API settings. API/worker get the database,
storage, admin-CSRF and test Paystack/signing secrets. Generate independent
64-hex admin-CSRF and checkout secrets privately; do not print or commit them.
Use separate service users for web/API and separate users across environments.
No `.env` files belong in release artifacts or GitHub Actions artifacts/logs.

CORS uses the exact environment origin, never `*` with credentials. Retain the
existing `Secure`, `HttpOnly`, `SameSite=Lax`, `/`, `__Host-` cookies without a
Domain attribute. Next's same-origin proxies retain the existing session/CSRF
design; no cross-site cookies or authentication architecture changes are needed.

Supabase: copy the actual session-pooler host from Connect (5432), bind the exact
project username/ref, `sslmode=require&sslaccept=strict`, and initially cap each
API/worker connection pool at five. Do not guess a pooler host or disable TLS
certificate validation. Inspect/approve project identity and isolation first;
the existing local development image project is not automatically approved.
Apply reviewed migration/storage SQL only after target approval. Keep the unused
Supabase Data API disabled on the new project, private tables inaccessible to
anonymous roles, and browser storage writes denied. Public synthetic portraits
remain readable. Production migration review/approval is a separate gate.

## Operator commands (after explicit resource and hostname approval)

Create the new staging Droplet through DigitalOcean with an SSH key, region near
the approved Supabase project, metrics agent, cloud firewall and agreed backups.
Record its real IPv4/reserved IPv4. Check host SSH fingerprints in the DO console
before saving them in operator/GitHub `known_hosts`; never disable host-key checks.

```bash
# On the new, approved Ubuntu staging Droplet only.
sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx ufw \
  ca-certificates curl jq xz-utils logrotate unattended-upgrades

# Verify SSH access before enabling the host firewall; keep console access open.
sudo ufw default deny incoming
sudo ufw default allow outgoing
# Replace this documentation address with the approved administrator/VPN CIDR.
sudo ufw allow from 203.0.113.10/32 to any port 22 proto tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

sudo install -d -m 0700 /etc/talenthunt/staging
sudo install -d -m 0755 /srv/talenthunt/staging/releases
# Install a verified official Node 24 binary matching CI at
# /opt/talenthunt-node/bin/node (and record version + release checksum).
/opt/talenthunt-node/bin/node --version

# Create service/deployment users and root-owned env files from reviewed
# templates; use sudoedit, not commands containing credentials.
sudoedit /etc/talenthunt/staging/web.env
sudoedit /etc/talenthunt/staging/api.env
sudo chmod 0600 /etc/talenthunt/staging/web.env /etc/talenthunt/staging/api.env
```

For continuous GitHub deployment, prefer a **pull deployment**: GitHub Actions
publishes the verified environment artifact/manifest; a root-managed staging
timer downloads approved releases over outbound HTTPS using a repository-scoped,
read-only artifact token. The reviewed wrapper verifies the source/CI identity,
manifest/signature/checksum and target before installing. This adds no separate
runner/VPN server or public deployment SSH access. Keep production polling off;
an operator authorizes its exact SHA/digest separately. Token scope, rotation and
the signing/attestation method must be reviewed against the GitHub plan.

Do not allow SSH globally merely to accommodate changing hosted-runner IPs. An
approved fixed-egress runner/VPN with a forced restricted SSH command is an
alternative, with any additional cost separately approved. Application users must
not edit root-owned environment files, Nginx/systemd definitions or deployment
wrappers; a privileged wrapper validates artifact paths and never runs application
build scripts as root. No unrestricted sudo is granted to repository code.

Illustrative Nginx HTTP bootstrap (replace `STAGING_HOST` only after confirmation;
place `log_format` in `http` context). Certbot will add the reviewed TLS vhost:

```nginx
log_format talenthunt '$remote_addr [$time_iso8601] '
                     '"$request_method $uri $server_protocol" '
                     '$status $body_bytes_sent $request_time';

server {
    listen 80;
    server_name STAGING_HOST;
    client_max_body_size 6m;
    client_body_timeout 60s;
    access_log /var/log/nginx/talenthunt-staging.access.log talenthunt;
    error_log /var/log/nginx/talenthunt-staging.error.log warn;
    add_header X-Robots-Tag "noindex, nofollow" always; # staging only

    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";
    proxy_connect_timeout 5s;
    proxy_read_timeout 60s;
    proxy_send_timeout 60s;
    proxy_next_upstream off;

    location ^~ /api/v1/ {
        proxy_pass http://127.0.0.1:4000;
    }
    location / {
        proxy_buffering off; # preserve Next streaming
        proxy_pass http://127.0.0.1:3000;
    }
}
```

The proxy's 6 MiB envelope accommodates the existing 5,000,000-byte image limit
and multipart overhead; the app keeps enforcing its existing limit. No Vercel
large-body beta or upload architecture change is required. Do not add broad
Nginx response caching for admin, votes, callbacks, status or RSC responses.
Before rolling deployments, configure a release-managed union of retained hashed
`/_next/static/` assets so already-open browsers can still load their build's
chunks. Never blend `.next` server output from different releases/worktrees.

```bash
# After installing the reviewed staging Nginx file and linking its vhost:
sudo nginx -t
sudo systemctl reload nginx
# Run ONLY when this approved staging name resolves to the staging Droplet.
STAGING_HOST=replace-with-approved-staging-host
sudo certbot --nginx -d "$STAGING_HOST" --redirect
sudo systemctl enable --now certbot.timer
sudo certbot renew --dry-run
sudo systemctl list-timers certbot.timer
```

Use TLS 1.2/1.3 and the maintained Certbot TLS configuration. Test expiry alerts
and renewal. Do not request a production certificate or install the production
vhost yet. Do not set `includeSubDomains` or alter the school's other sites.

## Managed application processes

Proposed unit names: `talenthunt-web@staging`, `talenthunt-api@staging`,
`talenthunt-paystack@staging`, `talenthunt-images@staging.timer`; identical template
names with `@production` on the later separate server. Initial commands:

| Service | Working directory below `/srv/talenthunt/staging/current` | ExecStart using `/opt/talenthunt-node/bin/node` |
| --- | --- | --- |
| Web | `apps/web` | `../../node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3000` |
| API | repository root | `apps/api/dist/server.js`, `PORT=4000`, approved loopback bind setting |
| Webhook worker | repository root | `apps/api/dist/workers/paystack-webhooks.js` |
| Hourly image cleanup | repository root | `node_modules/tsx/dist/cli.mjs apps/api/scripts/cleanup-contestant-images.ts` |

Unit configuration: `Type=simple`, non-root User/Group, fixed WorkingDirectory,
root-managed EnvironmentFile, `Restart=on-failure`, `RestartSec=5`, start-limit
protection, `KillSignal=SIGTERM`, bounded `TimeoutStopSec=30`, `UMask=0027`,
`NoNewPrivileges=true`, `PrivateTmp=true`, `ProtectHome=true`, and journal output.
Use a persistent systemd timer for the existing cleanup command, not a new worker
implementation. It only retires journal-owned expired objects on the approved
environment; current/production images are never QA cleanup targets.

Keep source/dependencies and deployment metadata read-only to app users. Permit
only Next's required per-release runtime build/cache paths to be writable by its
web user and verify cache/ISR behavior during staging. Do not share development
`.next` output. Record native Sharp/Prisma memory as well as Node heaps; don't
impose untested hard memory caps that kill successful requests.

```bash
# These reviewed unit templates must exist before running these commands.
sudo systemctl daemon-reload
sudo systemctl enable --now talenthunt-api@staging talenthunt-web@staging
# Enable the worker only after test webhook/finalization config is complete.
sudo systemctl enable --now talenthunt-paystack@staging
sudo systemctl enable --now talenthunt-images@staging.timer
sudo systemctl status talenthunt-api@staging talenthunt-web@staging --no-pager
sudo ss -lntp  # verify 3000/4000 are loopback-only; only SSH/80/443 externally
curl --fail http://127.0.0.1:4000/api/v1/health
curl --fail "https://$STAGING_HOST/api/v1/competition"
curl --fail --output /dev/null "https://$STAGING_HOST/admin/login"
```

`/api/v1/health` is liveness only. The competition endpoint plus an explicit
read-only SQL probe verifies the approved database and expected competition.
Confirm the correct project ref/slug, not just HTTP 200. Use server resource
metrics and fresh upload/profile checks for storage; do not create diagnostic
contestants on production.

## GitHub automation and safe rollback

Implement/review this pipeline before enabling it; no deployment workflow has
been activated by this planning step:

1. Protected reviewed source SHA -> existing full CI and security review -> clean
   Ubuntu build checkout for the selected environment. Pin third-party actions
   and the Node version. Untrusted pull requests must never receive deploy secrets.
2. Build API + Next + Prisma client off-host. Package source runtime files,
   `.next`, public assets and compatible Linux dependencies; exclude `.git`, QA
   fixtures/caches, dotenv files and credentials. Include required CLI dependencies
   for existing cleanup/migration commands; don't prune `tsx` and then break cleanup.
3. Attach source SHA, environment/public image origin, lockfile hash and SHA-256
   artifact manifest/provenance. Separate staging/production artifacts use the same
   source SHA. Verify the artifact before extraction; never deploy a mutable branch
   name or mix API/web artifacts built from different commits.
4. Staging automation is off until the first approved server/credential setup.
   Then the host's `talenthunt-deploy@staging.timer` checks published approved
   artifacts (e.g. once per minute) and deploys only after CI for the exact SHA
   passes; use a root-managed read-only repository token, with no token in URLs,
   process arguments or logs. Serialize with an
   environment-specific `flock`/workflow concurrency group. Production remains
   manually authorized. GitHub required-reviewer protections depend on plan and
   repo visibility; if unavailable, keep production credentials off automation
   and use an operator-approved deployment instead of assuming a manual trigger
   is an independent approval gate.
5. Upload to `/srv/talenthunt/ENV/releases/SHA`. Store config outside releases.
   Migration execution is separately reviewed/approved, uses an explicit private
   staging target and `prisma migrate deploy`, never reset/db push or rewritten
   history. Production migrations are not enabled by a push.
6. Preserve the previous release and hashed static assets; pause the image-cleanup
   timer and let any owned cleanup finish before migration/switching. Stop
   web/API/worker together, atomically replace `current`, then start all from that
   same release and resume cleanup only after health checks succeed.
   This small-server approach has a short maintenance interruption; do not call
   it zero-downtime. Confirm startup, database identity, public UI and auth health.
7. If post-deploy checks fail, redeploy the previous artifact and restart the
   consistent pair/worker **only when schema-compatible**. Never auto-reverse
   migrations, restore production data, clear votes/sessions or delete images.
   Halt/alert if compatibility is uncertain. Keep at least the previous two tested
   release artifacts; rollback selection is by recorded SHA, not `git reset`.

Example commands run in the clean CI build job, with only non-secret build
configuration and the reviewed public image origin injected:

```bash
npm ci --include=dev
DATABASE_URL=postgresql://build@127.0.0.1:5432/talenthunt_build npx prisma generate
npm run build --workspace apps/api
npm run build --workspace apps/web
# Packaging, signing/checksums and deployment use reviewed scripts still to prepare.
```

## Acceptance and load testing

Only use the approved staging project and synthetic data. Verify admin login,
reload/session persistence/logout, create/edit contestant, failed upload/retry
without duplicate records, near-limit upload, refresh/public portrait, two-video
limits, category/subcategory filtering, selector contrast/keyboard in Chrome and
Firefox, leaderboard visibility and voting, mobile layout and repeated navigation.
Exercise both a normal deployment and rollback with a browser already open.

Real Paystack TEST acceptance: initialization -> returned provider checkout ->
test transaction -> exact callback -> valid signed webhook -> worker verifies
test domain/reference/amount/NGN -> one paid record and exactly one allocation.
Replay a controlled valid test event and refresh status concurrently; verify the
vote counter and unique allocation still advance once. Reject bad/stale signatures,
wrong amounts/environments, cancellation and failure. Never load-test Paystack
itself or send load generators to live payment/production endpoints.

Total voters (200-900) do not establish peak concurrency. Proposed read-only
staging k6/HTTP/browser load gates: warm baseline, 10 concurrent visitors, 25, 50,
then an agreed short 100-visitor burst and 20-30 minute soak. Run the generator
off the Droplet; use realistic page/asset mixes and think time. Measure HTML/RSC,
API reads, uploads separately, plus bounded synthetic payment/idempotency tests.

Provisional targets for agreement: p95 public API <500 ms, dynamic page/server
response <1.5 s, error rate <1%, no OOM/restart/duplicate allocations, stable
memory below 75-80%, CPU generally below 70-80% sustained, no sustained swap use,
and healthy database connection/worker backlog. Provider checkout latency is
reported separately. A 2 GiB swap file can be an emergency buffer after approval,
not evidence of sufficient RAM. Results are **NOT RUN** until staging exists.

Resize to 4 GiB / 2 vCPUs if measured CPU/memory/latency or queue thresholds fail
after ordinary configuration checks. Resizing is a separately approved paid action;
CPU/RAM-only resizing preserves flexibility. Capture a backup and planned outage
before changes. Do not promise capacity from total audience size alone.

## Monitoring, backups and handover

- DigitalOcean's metrics agent/basic alerts: CPU, memory, load, disk, I/O and
  restart events. Configure notifications to the agreed operator. Start with
  metrics only; current Insights log/trace ingestion can become chargeable.
- Separate HTTPS checks for frontend, API liveness, database-backed public reads
  and certificate expiry. A local health timer must not repeatedly restart healthy
  services because Supabase or Paystack is unavailable; alert and preserve evidence.
  Select an approved independent monitor so Droplet failure is detectable.
- Bound journal usage (e.g. 500 MB and 14 days after disk-budget review), use
  logrotate/compression for Nginx, and exclude bodies, cookies, auth headers,
  signing keys and URL query strings from application access logs. Restrict access.
- Daily Droplet backups restore OS/config/app state, **not remote Supabase data**.
  Supabase Pro provides daily DB backups with seven-day access. Daily-only DB
  backups imply up to roughly 24 hours of lost changes; the school must approve
  RPO/RTO before paid voting. Quote PITR/frequent backup options separately if a
  tighter financial RPO is required; don't enable paid add-ons silently.
- Supabase database backups exclude actual Storage objects. Arrange separately
  versioned/encrypted off-site portrait backup plus object-path/checksum manifest,
  retention and approved destination/cost. Protect secret/config backups separately.
- Restore drill goes to a new isolated project/server with outgoing payments and
  mail disabled; validate migrations, counts, images, admin and ledger invariants.
  Recovery of missing payment evidence requires Paystack reconciliation and review;
  do not invent allocations or assume replay alone reconstructs lost records.
- Handover: account/billing ownership and MFA, SSH recovery/console path, domain
  administrator, service/release map, known-host fingerprints, protected credential
  transfer, renewal/backup/restore evidence, alerts/escalation contacts, update
  cadence, retention, deployment and rollback procedure. Agree RPO/RTO and owners.

## Costs and operator checklist

Current published estimates, USD/month before taxes, egress/usage overages,
GitHub quota overages, snapshots, off-site object backup and optional monitoring:

| Item | Estimate |
| --- | ---: |
| Basic 2 GiB / 1 vCPU Droplet | $12.00 |
| Daily percentage-based Droplet backups (30%) | $3.60 |
| Supabase Pro organization with first Micro project included by compute credit | from $25.00 |
| One environment, illustrative base | **$40.60** |
| Additional staging Droplet + daily backups | $15.60 |
| Additional staging database | $0 if eligible isolated Free project; from ~$10 in an existing paid organization |
| Two persistent environments | **~$56.20-$66.20** on the stated assumptions |
| Resize one Droplet to Basic 4 GiB / 2 vCPU | $24 + $7.20 daily backups = $31.20 for that server |

Staging alone can initially be ~$15.60 using an eligible isolated Free Supabase
project (quota/pausing limitations), or ~$40.60 with a new Pro organization. Do
not activate any subscription based on this estimate. Two separate Pro organizations
cost more than the shared-organization assumption. Assigned reserved IPs and basic
metrics are currently free; unassigned reserved IPv4 costs $5/month. Keep telemetry
ingestion/PITR/extra seats and upgrades off unless separately approved.

DigitalOcean setup checklist (operator must confirm before creation):

- [ ] School-owned account/billing/MFA; approve staging budget and backup plan.
- [ ] Choose region near the approved Supabase project and confirm 2 GiB/1 vCPU
      availability/actual price; Ubuntu 24.04 LTS x86-64; record resource names.
- [ ] Upload operator SSH public key; restricted cloud firewall and recovery path.
- [ ] Decide assigned reserved IPv4, metrics agent, backup schedule and alert owner.
- [ ] Identify approved isolated staging Supabase project and storage bucket;
      approve reviewed staging migrations/fixtures without touching existing data.
- [ ] Confirm approved Node version, GitHub access/deploy-key route, artifact
      retention, plan-supported approval controls and root-managed config ownership.

DNS checklist (school domain administrator; **no change authorized yet**):

- [ ] Confirm a separate staging hostname. Proposed `staging-talent.apearlschools.com`.
- [ ] After staging resource approval, add its **A record** to the actual staging
      Droplet/reserved IPv4, TTL initially ~300 seconds. Add AAAA only when IPv6
      routing/firewalls are configured and tested; remove no existing records.
- [ ] Check existing CAA permits Let's Encrypt before requesting a certificate;
      ask the school to approve any required CAA adjustment. Don't edit CAA blindly.
- [ ] Keep the existing school root/www website and mail/MX/TXT records intact.
- [ ] Leave production `talent.apearlschools.com` unchanged. After a separate
      production go-live approval, review existing records/conflicts and create
      the approved A record to the production IP. No Vercel CNAME is needed.

Remaining release decisions: final SHA/configuration changes; staging hostname,
budget and approved Supabase target; actual load/hosted payment tests; four known
high-severity Prisma tooling-chain advisories requiring review; and any previously
required confirmation email delivery (only an outbox intent currently exists).
Current Paystack verification/finalization intentionally supports TEST only;
live support requires later explicit approval and reviewed changes, not simply
substituting an `sk_live_` key. No new product functionality is included here.

Primary references:

- [Droplet prices](https://www.digitalocean.com/pricing/droplets),
  [backup pricing](https://docs.digitalocean.com/products/backups/details/pricing/),
  [reserved IP pricing](https://docs.digitalocean.com/products/networking/reserved-ips/details/pricing/)
- [Supabase pricing](https://supabase.com/pricing),
  [database backups and Storage exclusion](https://supabase.com/docs/guides/platform/backups)
- [DigitalOcean metrics/telemetry pricing](https://docs.digitalocean.com/products/insights/details/pricing/)
- [Nginx proxy behavior](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass),
  [Certbot](https://certbot.eff.org/instructions),
  [systemd services](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html)
- [GitHub environment protection availability](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
