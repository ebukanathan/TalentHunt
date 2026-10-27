import type { RequestHandler } from "express";
import { readCookie } from "../auth/cookies";
import type { AdminAuthService } from "../services/admin-auth.service";

export function requireAdminSession(service: AdminAuthService): RequestHandler {
  return async (request, response, next) => {
    const token = readCookie(request.headers.cookie, service.config.cookieName);
    response.locals.admin = await service.verify(token);
    response.locals.adminToken = token;
    next();
  };
}
export function requireAdminCsrf(service: AdminAuthService): RequestHandler {
  return (request, response, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      service.validateMutation(request.get("Origin"), request.get("Sec-Fetch-Site"), Boolean(request.is("application/json")));
      service.validateSessionCsrf(request.get("X-CSRF-Token"), response.locals.adminToken);
    }
    next();
  };
}
