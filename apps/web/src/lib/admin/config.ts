import "server-only";
export function adminConfig() {
  const origin = process.env.ADMIN_APP_ORIGIN?.trim() || (process.env.NODE_ENV === "development" ? "http://localhost:3000" : undefined);
  const base = process.env.API_BASE_URL?.trim() || (process.env.NODE_ENV === "development" ? "http://localhost:4000/api/v1" : undefined);
  if (!origin || !base) throw new Error("Admin unavailable.");
  const app = new URL(origin), api = new URL(base);
  const loopback = (url: URL) => url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (app.origin !== origin || app.username || app.password || api.username || api.password || api.search || api.hash ||
      (app.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && loopback(app))) ||
      (api.protocol !== "https:" && !loopback(api))) throw new Error("Admin unavailable.");
  const secure = app.protocol === "https:";
  return { origin, base: base.replace(/\/$/, ""), cookieName: secure ? "__Host-talenthunt_admin" : "talenthunt_admin_dev",
    challengeName: secure ? "__Host-talenthunt_admin_login" : "talenthunt_admin_login_dev" };
}
