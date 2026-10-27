import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { hashPassword } from "./password";

export const adminCredentials = z.strictObject({
  email: z.string().trim().max(254).pipe(z.email()).transform(value => value.toLowerCase()),
  password: z.string().min(1).max(128).refine(value => !/[\u0000-\u001f\u007f]/.test(value)),
});
export async function provisionInitialAdmin(database: PrismaClient, raw: unknown) {
  const credentials = adminCredentials.safeParse(raw);
  if (!credentials.success || credentials.data.password.length < 16) throw new Error("Use a valid email and a password of 16-128 characters without control characters.");
  const passwordHash = await hashPassword(credentials.data.password);
  return database.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81730101)`;
    if (await tx.adminUser.count() !== 0) throw new Error("Administrator already exists; provisioning refuses to overwrite or create another account.");
    const admin = await tx.adminUser.create({ data: { email: credentials.data.email, passwordHash }, select: { id: true } });
    await tx.auditLog.create({ data: { adminId: admin.id, action: "ADMIN_PROVISIONED", entityType: "AdminUser", entityId: admin.id } });
    return admin;
  });
}
