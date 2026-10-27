import type { Response } from "express";
import type { AdminConfiguration } from "../config/admin";

export function readCookie(header: string | undefined, name: string) {
  const matches = (header || "").split(";").map(s => s.trim()).filter(s => s.startsWith(name + "="));
  if (matches.length !== 1) return undefined;
  const value = matches[0].slice(name.length + 1);
  return value.length <= 512 && /^[A-Za-z0-9_.-]+$/.test(value) ? value : undefined;
}
export function setAdminCookie(response: Response, config: AdminConfiguration, name: string, value: string, expires: Date) {
  response.cookie(name, value, { httpOnly: true, secure: config.secure, sameSite: "lax", path: "/", expires });
}
export function clearAdminCookies(response: Response, config: AdminConfiguration) {
  for (const name of [config.cookieName, config.challengeCookieName]) {
    response.clearCookie(name, { httpOnly: true, secure: config.secure, sameSite: "lax", path: "/" });
  }
}
