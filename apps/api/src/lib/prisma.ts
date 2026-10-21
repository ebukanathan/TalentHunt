import { PrismaClient } from "@prisma/client";
import { environment } from "../config/env";

const shared = globalThis as typeof globalThis & { talentHuntPrisma?: PrismaClient };

export const prisma = shared.talentHuntPrisma ?? new PrismaClient({
  datasources: { db: { url: environment.DATABASE_URL } },
  errorFormat: "minimal",
});

if (process.env.NODE_ENV !== "production") shared.talentHuntPrisma = prisma;
