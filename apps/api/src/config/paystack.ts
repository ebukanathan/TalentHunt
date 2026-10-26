import { z } from "zod";

const callbackUrl = z.string().url().refine(value => {
  const url = new URL(value);
  return !url.username && !url.password && !url.hash && !url.search &&
    (url.protocol === "https:" || (url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)));
});
const configuration = z.object({
  PAYSTACK_MODE: z.literal("test").default("test"),
  PAYSTACK_SECRET_KEY: z.string().regex(/^sk_test_[A-Za-z0-9]+$/),
  PAYSTACK_CALLBACK_URL: callbackUrl,
  PAYSTACK_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(8000),
});
export type PaystackConfiguration = z.infer<typeof configuration>;

export function readPaystackConfiguration(source: NodeJS.ProcessEnv): PaystackConfiguration | null {
  const keys = ["PAYSTACK_MODE", "PAYSTACK_SECRET_KEY", "PAYSTACK_CALLBACK_URL", "PAYSTACK_TIMEOUT_MS"] as const;
  // Existing public reads remain available when payments have not been configured.
  if (keys.every(key => !source[key]?.trim())) return null;
  const result = configuration.safeParse(Object.fromEntries(keys.map(key => [key, source[key]?.trim() || undefined])));
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map(issue => issue.path.join(".")))];
    throw new Error("Invalid Paystack configuration: " + fields.join(", ") + ".");
  }
  if (source.NODE_ENV === "production" && new URL(result.data.PAYSTACK_CALLBACK_URL).protocol !== "https:") {
    throw new Error("Invalid Paystack configuration: PAYSTACK_CALLBACK_URL.");
  }
  return result.data;
}
