import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";
import { DEMO_COMPETITION, DEMO_CONTESTANTS, DEMO_PACKAGES, type SeedPackage } from "./seed-data";

export class SeedConfigurationError extends Error {}

type SeedEnvironment = Record<string, string | undefined>;

/** Deliberately local-only: a remote Supabase URL is not proof of a development target. */
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
    throw new SeedConfigurationError("Provide an explicit SEED_DATABASE_URL for a local development/test database.");
  }
  if (!["postgres:", "postgresql:"].includes(target.protocol) ||
      !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) || target.hash) {
    throw new SeedConfigurationError("Only local PostgreSQL development/test targets are allowed.");
  }
  let database: string;
  try { database = decodeURIComponent(target.pathname.slice(1)); }
  catch { throw new SeedConfigurationError("Invalid development/test database name."); }
  const allowedName = environment.SEED_ENV === "test"
    ? /^talenthunt_(?:test|seed_test)(?:_[a-z0-9]+)*$/
    : /^talenthunt_dev(?:_[a-z0-9]+)*$/;
  if (!allowedName.test(database) || /prod|live/i.test(database)) {
    throw new SeedConfigurationError("Use talenthunt_dev or talenthunt_test/talenthunt_seed_test, with an optional suffix.");
  }
  // Reject routing/identity overrides that could bypass the checked host/database.
  const allowedOptions = new Set(["schema", "connection_limit", "pool_timeout", "connect_timeout", "sslmode", "statement_cache_size", "application_name"]);
  const seenOptions = new Set<string>();
  for (const key of target.searchParams.keys()) {
    if (!allowedOptions.has(key) || seenOptions.has(key)) {
      throw new SeedConfigurationError("Unsupported or repeated seed database connection option.");
    }
    seenOptions.add(key);
  }
  if (target.searchParams.has("schema") && target.searchParams.get("schema") !== "public") {
    throw new SeedConfigurationError("Seed data must use the public schema in the isolated database.");
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
