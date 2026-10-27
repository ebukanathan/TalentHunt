import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AdminConfiguration } from "../config/admin";
import { HttpError } from "../http/errors";
import { PasswordCapacityError, verifyPassword } from "../auth/password";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const unauthorized = () => new HttpError(401, "ADMIN_UNAUTHENTICATED", "Please sign in to continue.");
const csrfError = () => new HttpError(403, "ADMIN_CSRF_INVALID", "Your sign-in request expired. Refresh and try again.");
const equal = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export class AdminAuthService {
  constructor(readonly database: PrismaClient, readonly config: AdminConfiguration, private readonly clock: () => Date = () => new Date()) {}
  private sign(value: string) { return createHmac("sha256", Buffer.from(this.config.ADMIN_CSRF_SECRET, "hex")).update(value).digest("base64url"); }
  sessionCsrf(token: string) { return this.sign("csrf-session\0" + token); }
  async verify(token?: string) {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw unauthorized();
    const now = this.clock();
    return this.database.$transaction(async tx => {
      const session = await tx.adminSession.findUnique({ where: { tokenHash: hash(token) }, include: { admin: { select: { id: true, email: true, isActive: true } } } });
      if (!session || !session.admin.isActive || session.revokedAt || session.idleExpiresAt <= now || session.absoluteExpiresAt <= now) throw unauthorized();
      const update = await tx.adminSession.updateMany({ where: { id: session.id, revokedAt: null,
        idleExpiresAt: { gt: now }, absoluteExpiresAt: { gt: now }, admin: { isActive: true } },
      data: { lastSeenAt: now, idleExpiresAt: new Date(Math.min(now.getTime() + this.config.ADMIN_IDLE_MINUTES * 60000, session.absoluteExpiresAt.getTime())) } });
      if (update.count !== 1) throw unauthorized();
      return { id: session.admin.id, email: session.admin.email };
    });
  }
  async csrf(token?: string) {
    if (token) {
      try { await this.verify(token); return { csrfToken: this.sessionCsrf(token) }; }
      catch (error) { if (!(error instanceof HttpError && error.statusCode === 401)) throw error; }
    }
    const expires = new Date(this.clock().getTime() + 10 * 60000);
    const payload = expires.getTime() + "." + randomBytes(32).toString("base64url");
    const challenge = payload + "." + this.sign("challenge\0" + payload);
    return { csrfToken: this.sign("csrf-login\0" + challenge), challenge, expires };
  }
  validateMutation(origin: string | undefined, fetchSite: string | undefined, isJson: boolean) {
    if (origin !== this.config.ADMIN_APP_ORIGIN || (fetchSite !== undefined && fetchSite !== "same-origin") || !isJson) throw csrfError();
  }
  async validateLoginCsrf(submitted: string | undefined, token?: string, challenge?: string) {
    if (!submitted || !/^[A-Za-z0-9_-]{43}$/.test(submitted)) throw csrfError();
    if (challenge && /^\d{13}\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(challenge)) {
      const [expires, nonce, signature] = challenge.split(".");
      const now = this.clock().getTime();
      if (+expires > now && +expires <= now + 10 * 60000 && equal(signature, this.sign("challenge\0" + expires + "." + nonce)) &&
          equal(submitted, this.sign("csrf-login\0" + challenge))) return;
    }
    if (token && equal(submitted, this.sessionCsrf(token))) { await this.verify(token); return; }
    throw csrfError();
  }
  validateSessionCsrf(submitted: string | undefined, token: string) {
    if (!submitted || !/^[A-Za-z0-9_-]{43}$/.test(submitted) || !equal(submitted, this.sessionCsrf(token))) throw csrfError();
  }
  private async throttle(email: string, ip: string) {
    const now = this.clock();
    const expires = new Date(now.getTime() + 15 * 60000);
    const limits = [["account\0" + email, 5], ["ip\0" + ip, 20], ["global", 50]] as const;
    // Commit counters even on rejection. Keys and rows are shared across processes.
    const attempts = await this.database.$transaction(async tx => {
      const rows = [];
      for (const [value, limit] of limits) {
        const keyHash = this.sign("throttle\0" + value);
        const result = await tx.$queryRaw<{ attempts: number }[]>`
          INSERT INTO "AdminAuthRateLimit" ("keyHash", attempts, "expiresAt") VALUES (${keyHash}, 1, ${expires})
          ON CONFLICT ("keyHash") DO UPDATE SET
            attempts = CASE WHEN "AdminAuthRateLimit"."expiresAt" <= ${now} THEN 1 ELSE LEAST("AdminAuthRateLimit".attempts + 1, 1000000) END,
            "expiresAt" = CASE WHEN "AdminAuthRateLimit"."expiresAt" <= ${now} THEN ${expires} ELSE "AdminAuthRateLimit"."expiresAt" END
          RETURNING attempts`;
        rows.push(result[0].attempts > limit);
      }
      // Bounded opportunistic cleanup; no raw email/IP is stored.
      await tx.$executeRaw`DELETE FROM "AdminAuthRateLimit" WHERE "keyHash" IN
        (SELECT "keyHash" FROM "AdminAuthRateLimit" WHERE "expiresAt" < ${new Date(now.getTime() - 86400000)} LIMIT 100)`;
      return rows;
    });
    if (attempts.some(Boolean)) throw new HttpError(429, "ADMIN_RATE_LIMITED", "Too many sign-in attempts. Try again later.");
  }
  async login(email: string, password: string, ip: string, oldToken?: string) {
    await this.throttle(email, ip);
    const user = await this.database.adminUser.findUnique({ where: { email } });
    let valid: boolean;
    try { valid = await verifyPassword(password, user?.passwordHash); }
    catch (error) { if (error instanceof PasswordCapacityError) throw new HttpError(429, "ADMIN_RATE_LIMITED", "Sign-in is busy. Try again shortly."); throw error; }
    if (!valid || !user?.isActive) throw new HttpError(401, "ADMIN_INVALID_CREDENTIALS", "Invalid email or password.");
    const token = randomBytes(32).toString("base64url");
    const now = this.clock();
    const absoluteExpiresAt = new Date(now.getTime() + this.config.ADMIN_ABSOLUTE_HOURS * 3600000);
    return this.database.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "AdminUser" WHERE id = ${user.id} FOR UPDATE`;
      const current = await tx.adminUser.findUnique({ where: { id: user.id } });
      if (!current?.isActive || current.passwordHash !== user.passwordHash) throw unauthorized();
      if (oldToken) await tx.adminSession.updateMany({ where: { tokenHash: hash(oldToken), adminId: user.id, revokedAt: null }, data: { revokedAt: now } });
      await tx.adminSession.create({ data: { tokenHash: hash(token), adminId: user.id, createdAt: now, lastSeenAt: now,
        idleExpiresAt: new Date(now.getTime() + this.config.ADMIN_IDLE_MINUTES * 60000), absoluteExpiresAt } });
      await tx.adminUser.update({ where: { id: user.id }, data: { lastLoginAt: now } });
      // Retain recent forensic state; bound cleanup work and never touch business rows.
      await tx.$executeRaw`DELETE FROM "AdminSession" WHERE id IN
        (SELECT id FROM "AdminSession" WHERE "absoluteExpiresAt" < ${new Date(now.getTime() - 86400000)} LIMIT 100)`;
      await tx.auditLog.create({ data: { adminId: user.id, action: "ADMIN_LOGIN", entityType: "AdminUser", entityId: user.id } });
      return { token, expires: absoluteExpiresAt, admin: { id: user.id, email: user.email } };
    });
  }
  async logout(token: string) {
    const now = this.clock();
    await this.database.$transaction(async tx => {
      const session = await tx.adminSession.findUnique({ where: { tokenHash: hash(token) } });
      if (session && !session.revokedAt) {
        const changed = await tx.adminSession.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: now } });
        if (changed.count) await tx.auditLog.create({ data: { adminId: session.adminId, action: "ADMIN_LOGOUT", entityType: "AdminSession", entityId: session.id } });
      }
    });
  }
}
