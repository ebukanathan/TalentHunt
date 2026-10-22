# TalentHunt public website

Next.js App Router, TypeScript and Tailwind. Issue #29 delivers the homepage and active contestants listing. Contestant profiles, package selection and leaderboard are tracked separately in #30–#32.

## Run locally

Run commands from the repository root. Install the workspace dependencies with `npm ci`. The Express API uses the existing development database configuration; the web app never receives the database URL or payment credentials.

Create `apps/web/.env.local` using `apps/web/.env.example`:

```dotenv
API_BASE_URL=http://localhost:4000/api/v1
```

Start the API and web app in separate terminals:

```powershell
npm run dev:api
npm run dev:web
```

Open http://localhost:3000/ and http://localhost:3000/contestants. Confirm the API is reachable at http://localhost:4000/api/v1/health if data cannot load.

Set `API_BASE_URL` explicitly in deployment to an Express URL reachable from the Next.js server. There is a localhost fallback only in development. This is a server-only setting, not a `NEXT_PUBLIC_` variable; database and payment credentials do not belong in web configuration.

## Data and states

- All competition and contestant records come from Express through a centralized, Zod-validated API client. No demo records are embedded in production components.
- Request-time data sits below Suspense boundaries, compatible with the installed Next.js Cache Components configuration. API fetches have timeouts and do not use the persistent fetch cache. Transport errors are sanitized; missing competition and empty lineups have explicit messages.
- Competition status and optional date bounds determine the voting message. Start is inclusive; close is exclusive. Only `OPEN` inside valid bounds is eligible. Invalid/inverted dates fail closed. The current development competition is `DRAFT`, so it correctly shows that voting has not opened.
- This issue adds browsing CTAs only. Profiles and vote-selection links are added when their routes exist. No payments, verification, vote allocation or success screens are implemented. UI eligibility is informational; future checkout must enforce its own server-side rules.
- Vote totals remain decimal strings across JSON and component props. Formatting uses `BigInt` without converting totals to numbers. Currency helpers use integer arithmetic to retain every kobo, including at safe-integer boundaries.
- Portraits use HTTPS URLs supplied by the API, loaded directly in the browser with fixed dimensions and object-fit cropping. Missing, invalid or failed images show an accessible initials fallback. There is no open server-side image proxy or invented contestant photograph.
- The listing retains API ordering and paginates 12 records per page with keyboard-accessible controls. The current API returns all active contestants; this limits rendering, not network payload size. Server pagination can be added as the dataset grows.

## Verification

```powershell
npm run test --workspace=apps/web
npm run lint --workspace=apps/web
npm run typecheck --workspace=apps/web
npm run build --workspace=apps/web
npm run test:smoke --workspace=apps/web
```

Unit/render tests cover successful and invalid API responses, empty/not-found results, invalid IDs, timeouts, sanitized errors, large vote totals, integer kobo and voting-window boundaries. The HTTP smoke check starts the production Next.js build against a disposable in-memory API fixture and checks both pages, pagination markup, streamed loading, empty/missing/failure/mismatched results and 404 behavior. It does not simulate browser interactions or mutate a database.

For an additional read-only check against the configured development Supabase database:

```powershell
npm run build --workspace=apps/api
npm run test:smoke:development --workspace=apps/web
```

That command starts its own compiled Express and Next.js processes on temporary ports, compares both rendered pages with current API records, then stops only those processes. Use development configuration. It neither seeds data nor writes records.

Browser review should cover 360px and desktop layouts, no horizontal overflow, visible keyboard focus, the skip link, navigation, pagination, image-error fallback and retry after restoring the API. Browser review remains a separate check from HTTP integration tests.
