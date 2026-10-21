import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";
import { DEMO_COMPETITION, DEMO_CONTESTANTS, DEMO_PACKAGES, type SeedPackage } from "./seed-data";

export class SeedConfigurationError extends Error {}

type SeedEnvironment = Record<string, string | undefined>;

/** Require an explicit development/test target, including an exact project binding for Supabase. */
export function readSeedTarget(environment: SeedEnvironment): string {
  if (environment.NODE_ENV === "production" ||
      !["development", "test"].includes(environment.SEED_ENV ?? "")) {
    throw new SeedConfigurationError("Set SEED_ENV to development or test; production seeding is refused.");
  }
  let target: URL;
  try {
    if (!environment.SEED_DATABASE_URL) throw new Error("missing");
    target = new URL(environment.SEED_DATABASE_URL);
  } catch {
    throw new SeedConfigurationError("Provide an explicit SEED_DATABASE_URL for a development/test database.");
  }
  if (!["postgres:", "postgresql:"].includes(target.protocol) || target.hash) {
    throw new SeedConfigurationError("Use a PostgreSQL development/test connection URL without a fragment.");
  }
  let database: string;
  let username: string;
  try {
    database = decodeURIComponent(target.pathname.slice(1));
    username = decodeURIComponent(target.username);
  } catch {
    throw new SeedConfigurationError("Invalid seed database identity.");
  }
  // Validate before adding defaults, so duplicate options cannot be silently collapsed.
  const allowedOptions = new Set(["schema", "connection_limit", "pool_timeout", "connect_timeout", "sslmode", "statement_cache_size", "application_name", "pgbouncer"]);
  const seenOptions = new Set<string>();
  for (const key of target.searchParams.keys()) {
    if (!allowedOptions.has(key) || seenOptions.has(key)) {
      throw new SeedConfigurationError("Unsupported or repeated seed database connection option.");
    }
    seenOptions.add(key);
  }
  if (target.searchParams.has("schema") && target.searchParams.get("schema") !== "public") {
    throw new SeedConfigurationError("Seed data must use the public schema in the development/test database.");
  }
  if (target.searchParams.has("pgbouncer") && !["true", "false"].includes(target.searchParams.get("pgbouncer")!)) {
    throw new SeedConfigurationError("The pgbouncer connection option must be true or false.");
  }
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(target.hostname);
  if (local) {
    const allowedName = environment.SEED_ENV === "test"
      ? /^talenthunt_(?:test|seed_test)(?:_[a-z0-9]+)*$/
      : /^talenthunt_dev(?:_[a-z0-9]+)*$/;
    if (!allowedName.test(database) || /prod|live/i.test(database)) {
      throw new SeedConfigurationError("Use talenthunt_dev or talenthunt_test/talenthunt_seed_test, with an optional suffix.");
    }
  } else {
    const reference = environment.SEED_SUPABASE_PROJECT_REF ?? "";
    if (!/^[a-z0-9]{20}$/.test(reference)) {
      throw new SeedConfigurationError("Explicitly set SEED_SUPABASE_PROJECT_REF for the confirmed development/test project.");
    }
    const direct = target.hostname === "db." + reference + ".supabase.co" && Boolean(username);
    const roleSuffix = "." + reference;
    const sessionPooler = /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(target.hostname) &&
      username.endsWith(roleSuffix) && username.length > roleSuffix.length;
    if ((!direct && !sessionPooler) || (target.port || "5432") !== "5432" || database !== "postgres") {
      throw new SeedConfigurationError("Supabase seed URL must match the selected project using its direct or session connection on port 5432 and postgres database.");
    }
    if (target.searchParams.has("sslmode") && target.searchParams.get("sslmode") !== "require") {
      throw new SeedConfigurationError("Supabase seeding requires sslmode=require.");
    }
    target.searchParams.set("sslmode", "require");
  }
  target.searchParams.set("connect_timeout", "5");
  return target.toString();
}

export function validatePackages(packages: readonly SeedPackage[]): void {
  if (packages.length !== 3) throw new SeedConfigurationError("Configure exactly three demo vote packages.");
  const expectedIds = new Set(DEMO_PACKAGES.map(item => item.id));
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  for (const item of packages) {
    const name = item.name.trim();
    if (!expectedIds.has(item.id) || seenIds.has(item.id) || !name || seenNames.has(name.toLowerCase())) {
      throw new SeedConfigurationError("Demo packages require their stable IDs and three distinct non-empty names.");
    }
    for (const value of [item.voteCount, item.priceKobo]) {
      if (!Number.isSafeInteger(value) || value <= 0 || value > 2147483647) {
        throw new SeedConfigurationError("Package votes and prices must be positive PostgreSQL integers; prices are in kobo.");
      }
    }
    seenIds.add(item.id);
    seenNames.add(name.toLowerCase());
  }
}

export async function runSeed(
  environment: SeedEnvironment = process.env,
  packages: readonly SeedPackage[] = DEMO_PACKAGES,
): Promise<{ competitionId: string; contestants: number; packages: number }> {
  const url = readSeedTarget(environment);
  validatePackages(packages);
  const prisma = new PrismaClient({ datasources: { db: { url } }, errorFormat: "minimal" });
  try {
    return await prisma.$transaction(async tx => {
      const competition = await tx.competition.findFirst({
        where: { OR: [{ id: DEMO_COMPETITION.id }, { slug: DEMO_COMPETITION.slug }] },
      });
      if (competition && (competition.id !== DEMO_COMPETITION.id || competition.slug !== DEMO_COMPETITION.slug)) {
        throw new SeedConfigurationError("Demo competition identity conflicts with an existing record.");
      }
      await tx.competition.upsert({
        where: { id: DEMO_COMPETITION.id },
        create: { ...DEMO_COMPETITION, status: "DRAFT", currency: "NGN" },
        update: {},
      });
      for (const contestant of DEMO_CONTESTANTS) {
        const existing = await tx.contestant.findUnique({ where: { id: contestant.id } });
        if (existing && existing.competitionId !== DEMO_COMPETITION.id) {
          throw new SeedConfigurationError("A demo contestant ID belongs to another competition.");
        }
        await tx.contestant.upsert({
          where: { id: contestant.id },
          create: { ...contestant, competitionId: DEMO_COMPETITION.id, bio: "Fictional demo contestant." },
          update: {}, // Preserve edits, activation state and any existing vote totals.
        });
      }
      for (const item of packages) {
        const existing = await tx.votePackage.findUnique({ where: { id: item.id } });
        if (existing && existing.competitionId !== DEMO_COMPETITION.id) {
          throw new SeedConfigurationError("A demo package ID belongs to another competition.");
        }
        const metadata = { name: item.name.trim(), voteCount: item.voteCount, priceKobo: item.priceKobo, currency: "NGN" };
        await tx.votePackage.upsert({
          where: { id: item.id },
          create: { id: item.id, competitionId: DEMO_COMPETITION.id, ...metadata },
          update: metadata,
        });
      }
      return { competitionId: DEMO_COMPETITION.id, contestants: DEMO_CONTESTANTS.length, packages: packages.length };
    }, { maxWait: 5000, timeout: 15000 });
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runSeed().then(summary => {
    console.log("Demo seed complete: " + JSON.stringify(summary));
  }).catch((error: unknown) => {
    // Never print connection strings, Prisma request arguments or raw database errors.
    const message = error instanceof SeedConfigurationError ? error.message
      : error instanceof Prisma.PrismaClientKnownRequestError ? "Database operation failed (" + error.code + ")."
      : "Database seeding failed; check the isolated database and migration state.";
    console.error(message);
    process.exitCode = 1;
  });
}
