-- Additive ADMIN-01 persistence only. No bootstrap or historical row changes.
CREATE TABLE "AdminSession" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "idleExpiresAt" TIMESTAMP(3) NOT NULL,
  "absoluteExpiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdminSession_tokenHash_key" ON "AdminSession"("tokenHash");
CREATE INDEX "AdminSession_adminId_idx" ON "AdminSession"("adminId");
CREATE INDEX "AdminSession_absoluteExpiresAt_idx" ON "AdminSession"("absoluteExpiresAt");
ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "AdminAuthRateLimit" (
  "keyHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminAuthRateLimit_pkey" PRIMARY KEY ("keyHash")
);
CREATE INDEX "AdminAuthRateLimit_expiresAt_idx" ON "AdminAuthRateLimit"("expiresAt");
