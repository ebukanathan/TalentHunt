import { z } from "zod";

const settings = z.object({
  ADMIN_AUTH_ENABLED: z.literal("true").default("true"),
  ADMIN_APP_ORIGIN: z.string().url().refine(value => {
    const url = new URL(value);
    return url.origin === value && !url.username && !url.password &&
      (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)));
  }),
  ADMIN_CSRF_SECRET: z.string().regex(/^[a-f0-9]{64}$/i),
  ADMIN_IDLE_MINUTES: z.coerce.number().int().min(5).max(120).default(30),
  ADMIN_ABSOLUTE_HOURS: z.coerce.number().int().min(1).max(24).default(8),
});
export type AdminConfiguration = ReturnType<typeof readAdminConfiguration> & {};
export function readAdminConfiguration(source: Record<string, string | undefined>) {
  const keys = ["ADMIN_AUTH_ENABLED", "ADMIN_APP_ORIGIN", "ADMIN_CSRF_SECRET", "ADMIN_IDLE_MINUTES", "ADMIN_ABSOLUTE_HOURS"] as const;
  if (source.ADMIN_AUTH_ENABLED === "false" || keys.every(key => !source[key]?.trim())) return null;
  const result = settings.safeParse(Object.fromEntries(keys.map(key => [key, source[key]?.trim() || undefined])));
  if (!result.success) throw new Error("Invalid admin configuration: " + [...new Set(result.error.issues.map(i => i.path.join(".")))].join(", ") + ".");
  const secure = new URL(result.data.ADMIN_APP_ORIGIN).protocol === "https:";
  if ((source.NODE_ENV === "production" && !secure) || result.data.ADMIN_IDLE_MINUTES > result.data.ADMIN_ABSOLUTE_HOURS * 60) {
    throw new Error("Invalid admin configuration: origin or session lifetime.");
  }
  return { ...result.data, secure, cookieName: secure ? "__Host-talenthunt_admin" : "talenthunt_admin_dev",
    challengeCookieName: secure ? "__Host-talenthunt_admin_login" : "talenthunt_admin_login_dev" };
}
