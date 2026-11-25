import { PrismaClient } from "@prisma/client";
import { environment } from "../config/env";

const shared = globalThis as typeof globalThis & { talentHuntPrisma?: PrismaClient };

export const prisma = shared.talentHuntPrisma ?? new PrismaClient({
  datasources: { db: { url: environment.DATABASE_URL } },
  errorFormat: "minimal",
  // Multi-query admin operations must also work over the remote database link.
  transactionOptions: { timeout: 15000 },
});

if (process.env.NODE_ENV !== "production") shared.talentHuntPrisma = prisma;
