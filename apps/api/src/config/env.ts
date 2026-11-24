import { config } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";
import { readPaystackConfiguration } from "./paystack";
import { readAdminConfiguration } from "./admin";
import { readStorageConfiguration } from "./storage";
import { readWebhookConfiguration } from "./paystack-webhooks";

// Process environment wins, followed by apps/api/.env, then the repository .env.
// These paths work from both src/config and dist/config under npm workspaces.
config({ path: resolve(__dirname, "../../.env"), quiet: true });
config({ path: resolve(__dirname, "../../../../.env"), quiet: true });

const environmentSchema = z.object({
  DATABASE_URL: z.string().min(1).refine(value => {
    try { return ["postgres:", "postgresql:"].includes(new URL(value).protocol); }
    catch { return false; }
  }, "Use a PostgreSQL connection URL."),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  PUBLIC_COMPETITION_SLUG: z.string().min(1).max(200).optional(),
});

export function readEnvironment(source: NodeJS.ProcessEnv) {
  const result = environmentSchema.safeParse({
    DATABASE_URL: source.DATABASE_URL,
    PORT: source.PORT,
    PUBLIC_COMPETITION_SLUG: source.PUBLIC_COMPETITION_SLUG?.trim() || undefined,
  });
  if (!result.success) {
    // Do not include input values or the full Zod error: DATABASE_URL contains credentials.
    const fields = [...new Set(result.error.issues.map(issue => issue.path.join(".")))];
    throw new Error("Invalid API configuration: " + fields.join(", ") + ".");
  }
  const paystack = readPaystackConfiguration(source);
  if (source.PAYSTACK_FINALIZATION_ENABLED && !["true", "false"].includes(source.PAYSTACK_FINALIZATION_ENABLED)) throw new Error("Invalid finalization configuration.");
  const finalizationEnabled = source.PAYSTACK_FINALIZATION_ENABLED === "true";
  if (finalizationEnabled && !paystack) throw new Error("Test payment configuration is required for finalization.");
  if (finalizationEnabled) {
    const target = new URL(result.data.DATABASE_URL);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || target.search || target.hash ||
        !/^\/talenthunt_(paid_demo|browser_test|vitest)_[a-z0-9_]+$/.test(target.pathname))
      throw new Error("Test finalization requires an explicitly named local test database.");
  }
  return { ...result.data, paystack, finalizationEnabled, webhooks: readWebhookConfiguration(source), admin: readAdminConfiguration(source), storage: readStorageConfiguration(source) };
}

export const environment = readEnvironment(process.env);
