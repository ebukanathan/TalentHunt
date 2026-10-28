import { Router } from "express";
import { z } from "zod";
import { adminCredentials } from "../auth/provision";
import { clearAdminCookies, readCookie, setAdminCookie } from "../auth/cookies";
import { HttpError } from "../http/errors";
import { requireAdminCsrf, requireAdminSession } from "../middleware/admin-auth";
import type { AdminAuthService } from "../services/admin-auth.service";
import type { AdminContestantService } from "../services/admin-contestants.service";
import { createAdminContestantsRouter } from "./admin-contestants.routes";

export function createAdminRouter(service?: AdminAuthService, contestants?: AdminContestantService) {
  const router = Router();
  router.use((_req, res, next) => {
    res.set({ "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache", Vary: "Cookie" });
    if (!service) throw new HttpError(503, "ADMIN_NOT_CONFIGURED", "Admin sign-in is unavailable.");
    next();
  });
  if (!service) return router;
  const config = service.config;
  router.get("/auth/csrf", async (req, res) => {
    const result = await service.csrf(readCookie(req.headers.cookie, config.cookieName));
    if (result.challenge && result.expires) setAdminCookie(res, config, config.challengeCookieName, result.challenge, result.expires);
    res.json({ status: "success", data: { csrfToken: result.csrfToken } });
  });
  router.post("/auth/login", async (req, res) => {
    service.validateMutation(req.get("Origin"), req.get("Sec-Fetch-Site"), Boolean(req.is("application/json")));
    const token = readCookie(req.headers.cookie, config.cookieName);
    await service.validateLoginCsrf(req.get("X-CSRF-Token"), token, readCookie(req.headers.cookie, config.challengeCookieName));
    const input = adminCredentials.safeParse(req.body);
    // Never serialize Zod password issues/input or disclose account existence.
    if (!input.success) throw new HttpError(400, "ADMIN_INVALID_INPUT", "Enter a valid email and password.");
    const result = await service.login(input.data.email, input.data.password, req.ip || req.socket.remoteAddress || "unknown", token);
    setAdminCookie(res, config, config.cookieName, result.token, result.expires);
    res.clearCookie(config.challengeCookieName, { httpOnly: true, secure: config.secure, sameSite: "lax", path: "/" });
    res.json({ status: "success", data: { admin: result.admin } });
  });
  // All subsequent resources, including future admin writes, inherit both guards.
  router.use(requireAdminSession(service), requireAdminCsrf(service));
  if (contestants) router.use("/contestants", createAdminContestantsRouter(contestants));
  router.get("/auth/session", (_req, res) => res.json({ status: "success", data: { admin: res.locals.admin } }));
  router.post("/auth/logout", async (req, res) => {
    if (!z.strictObject({}).safeParse(req.body).success) throw new HttpError(400, "ADMIN_INVALID_INPUT", "Send an empty JSON object to sign out.");
    await service.logout(res.locals.adminToken);
    clearAdminCookies(res, config);
    res.json({ status: "success", data: null });
  });
  return router;
}
