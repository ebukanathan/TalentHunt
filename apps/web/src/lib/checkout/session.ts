// Server-only callers. Kept framework-independent for cryptographic unit tests.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
export const sessionCookie = "th_test_checkout";
const cookieName = (config: CheckoutConfiguration) => config.secure ? "__Host-" + sessionCookie : sessionCookie;
export type CheckoutConfiguration = { origin: string; apiBase: string; secret: string; secure: boolean };
export function checkoutConfiguration(env: Record<string, string | undefined> = process.env): CheckoutConfiguration | null {
  if (env.CHECKOUT_TEST_ENABLED !== "true") return null;
  try {
    const origin = new URL(env.CHECKOUT_APP_ORIGIN || "");
    const api = new URL(env.API_BASE_URL || "");
    const permitted = (url: URL) => !url.username && !url.password && !url.search && !url.hash &&
      (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)));
    if (!permitted(origin) || origin.pathname !== "/" || !permitted(api) || api.pathname !== "/api/v1" ||
        !/^[0-9a-f]{64}$/i.test(env.CHECKOUT_SESSION_SECRET || "")) throw new Error();
    return { origin: origin.origin, apiBase: api.href, secret: env.CHECKOUT_SESSION_SECRET!, secure: origin.protocol === "https:" };
  } catch { throw new Error("Invalid test checkout configuration."); }
}
type Session = { id: string; expiresAt: number };
const mac = (secret: string, value: string) => createHmac("sha256", secret).update(value).digest("hex");
const equal = (a: string, b: string) => /^[0-9a-f]{64}$/.test(a) && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function readSession(cookie: string, config: CheckoutConfiguration, now = Date.now()): Session | null {
  const name = cookieName(config);
  const values = cookie.split(";").map(value => value.trim()).filter(value => value.startsWith(name + "="));
  if (values.length !== 1) return null;
  const token = values[0].slice(name.length + 1);
  if (token.length > 512) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !equal(parts[1], mac(config.secret, "cookie:" + parts[0]))) return null;
  try {
    const data = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    return data.v === 1 && /^[0-9a-f]{64}$/.test(data.id) && Number.isSafeInteger(data.expiresAt) && data.expiresAt > now && data.expiresAt <= now + 8 * 3600000
      ? { id: data.id, expiresAt: data.expiresAt } : null;
  } catch { return null; }
}
export function newSession(config: CheckoutConfiguration, now = Date.now()) {
  const session = { id: randomBytes(32).toString("hex"), expiresAt: now + 8 * 3600000 };
  const payload = Buffer.from(JSON.stringify({ v: 1, ...session })).toString("base64url");
  return { session, cookie: `${cookieName(config)}=${payload}.${mac(config.secret, "cookie:" + payload)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${config.secure ? "; Secure" : ""}` };
}
export const sessionBinding = (session: Session, config: CheckoutConfiguration) => mac(config.secret, "binding:" + session.id);
export const csrfToken = (session: Session, config: CheckoutConfiguration) => mac(config.secret, "csrf:" + session.id);
export function authenticSessionRequest(request: Request, session: Session, config: CheckoutConfiguration) {
  return equal(request.headers.get("X-Checkout-Session") || "", sessionBinding(session, config)) &&
    equal(request.headers.get("X-CSRF-Token") || "", csrfToken(session, config));
}
export function privateRetryKey(session: Session, attempt: string, config: CheckoutConfiguration) {
  const bytes = Buffer.from(mac(config.secret, "attempt:" + session.id + ":" + attempt.toLowerCase()), "hex").subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const value = bytes.toString("hex");
  return `${value.slice(0,8)}-${value.slice(8,12)}-${value.slice(12,16)}-${value.slice(16,20)}-${value.slice(20)}`;
}
