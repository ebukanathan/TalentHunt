# TalentHunt

A paid talent-show voting platform under development with Next.js, TypeScript, Express, Prisma, PostgreSQL/Supabase and Paystack.

Current implementation: npm workspaces, a generated Next.js starter, an Express health endpoint, and an initial Prisma schema/migration. Voting, email verification, payments and the admin dashboard are roadmap work.

## Development setup

Validated tooling at initial review: Node.js 24.15.0 and npm 11.12.1. Use the repository lockfile.

1. Run npm ci from the repository root.
2. Copy .env.example to .env and set DATABASE_URL for an isolated development PostgreSQL database. Credentials belong only in the local environment.
3. Run npx --no-install prisma generate and npx --no-install prisma validate.
4. Inspect npx --no-install prisma migrate status. Only after confirming the target is your intended development database, apply existing migrations with npx --no-install prisma migrate deploy.
5. In separate terminals run npm run dev:web and npm run dev:api.

The web app runs on http://localhost:3000; the API defaults to http://localhost:4000. The health endpoint is GET /api/v1/health. The API CORS origin is currently fixed to localhost:3000.

Prisma CLI loads the root .env through prisma.config.ts. npm workspace commands run from their app directory; consistent API runtime environment loading, validation and a shared Prisma client are tracked by F05. The API currently has no database feature endpoints.

Database seeding is the next task (F03); no seed command exists yet. Do not run demo seeds or development/reset migrations against production. Runtime database pooling and migration connection settings must be validated before deployment.

## Verification

- API: npm exec -- tsc -p apps/api/tsconfig.json --noEmit
- Web: npm run lint --workspace=apps/web
- Builds: npm run build --workspace=apps/api and npm run build --workspace=apps/web
- Schema: npx --no-install prisma validate

Initial review passed API typechecking, frontend lint, schema validation and a live API health request. The configured database had the initial migration applied and no detected drift. Root/API test scripts are placeholders and deliberately fail; automated testing is tracked by T01/T02. Both API and web production builds also passed before the initial source publication; clean-checkout reproducibility remains to be verified in F04.

## Architecture and roadmap

Intended request path: browser -> Next.js interface -> Express API -> Prisma -> Supabase-hosted PostgreSQL. Paystack and email provider secrets stay on the server. Supabase is currently the database host; admin authentication remains a documented design/implementation task.

- [Development project](https://github.com/users/ebukanathan/projects/3)
- [Roadmap, milestones, workflow and risk register](docs/project-management/roadmap.md)
- [Detailed initial backlog](docs/project-management/proposed-backlog.md)

The board uses Backlog, Next, In Progress and Done. Work in progress is limited to one task for solo development. Close issues only with acceptance and validation evidence. A phase is a grouping, so security prerequisites such as A01 may be pulled forward.

The roadmap runner uses GitHub CLI. node scripts/github-roadmap.mjs --plan regenerates a local preview without GitHub requests. --apply writes GitHub resources and is only for an explicitly approved setup; it is not a routine development command or a synchronization tool for a board already in use.
