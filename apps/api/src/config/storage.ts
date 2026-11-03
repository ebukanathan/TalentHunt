import { z } from "zod";

export const IMAGE_BUCKET = "contestant-images";
export const MAX_IMAGE_BYTES = 5_000_000;
export const MAX_IMAGE_REQUEST_BYTES = MAX_IMAGE_BYTES + 16_384;
export function readStorageConfiguration(env: NodeJS.ProcessEnv) {
  if (!env.SUPABASE_URL && !env.SUPABASE_SECRET_KEY) return null;
  const parsed = z.object({
    SUPABASE_URL: z.url().refine(value => {
      const url = new URL(value);
      return url.protocol === "https:" && url.pathname === "/" && !url.username && !url.password && !url.search && !url.hash;
    }),
    SUPABASE_SECRET_KEY: z.string().regex(/^sb_secret_[A-Za-z0-9_-]{20,}$/),
  }).safeParse(env);
  if (!parsed.success) throw new Error("Invalid backend storage configuration. Set SUPABASE_URL and SUPABASE_SECRET_KEY.");
  return parsed.data;
}
export type StorageConfiguration = NonNullable<ReturnType<typeof readStorageConfiguration>>;
