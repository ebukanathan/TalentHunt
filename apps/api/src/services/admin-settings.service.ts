import { Prisma, type PrismaClient } from "@prisma/client";
import { HttpError } from "../http/errors";
import type { PublicApi } from "./public.service";
import { validateCompetitionChange } from "./competition-policy";
import type { CompetitionPatch, PackageCreate, PackagePatch } from "../validation/admin-settings";

const missing = () => new HttpError(404, "PACKAGE_NOT_FOUND", "Vote package not found in the selected competition.");
const stale = () => new HttpError(409, "SETTINGS_CHANGED", "These settings changed. Reload before saving again.");
export class AdminSettingsService {
  constructor(private readonly db: PrismaClient, private readonly selection: Pick<PublicApi, "getCompetition">, private readonly now = () => new Date()) {}
  async competition() {
    const selected = await this.selection.getCompetition();
    return this.db.competition.findUniqueOrThrow({ where: { id: selected.id } });
  }
  async packages(page: number) {
    const competition = await this.competition(), pageSize = 20;
    const [total, items] = await this.db.$transaction([
      this.db.votePackage.count({ where: { competitionId: competition.id } }),
      this.db.votePackage.findMany({ where: { competitionId: competition.id }, orderBy: [{ priceKobo: "asc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { competition, items, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } };
  }
  async updateCompetition(input: CompetitionPatch, adminId: string) {
    const selected = await this.selection.getCompetition();
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Competition" WHERE id = ${selected.id} FOR UPDATE`;
      const previous = await tx.competition.findUniqueOrThrow({ where: { id: selected.id } });
      if (previous.updatedAt.toISOString() !== input.expectedUpdatedAt) throw stale();
      const { expectedUpdatedAt: _version, votingOpens, votingCloses, ...data } = input;
      const dates = { ...data, ...(votingOpens !== undefined ? { votingOpens: votingOpens ? new Date(votingOpens) : null } : {}), ...(votingCloses !== undefined ? { votingCloses: votingCloses ? new Date(votingCloses) : null } : {}) };
      validateCompetitionChange(previous, { ...previous, ...dates }, this.now());
      const changed = Object.entries(dates).filter(([key,value]) => JSON.stringify(previous[key as keyof typeof previous]) !== JSON.stringify(value));
      if (!changed.length) return previous;
      const current = await tx.competition.update({ where: { id: previous.id }, data: { ...dates, updatedAt: new Date(Math.max(this.now().getTime(), previous.updatedAt.getTime() + 1)) } });
      await tx.auditLog.create({ data: { adminId, action: "COMPETITION_UPDATED", entityType: "Competition", entityId: previous.id, details: { changes: JSON.parse(JSON.stringify(Object.fromEntries(changed.map(([key]) => [key, { before: previous[key as keyof typeof previous], after: current[key as keyof typeof current] }])))) as Prisma.InputJsonObject } } });
      return current;
    });
  }
  async createPackage(input: PackageCreate, adminId: string) {
    const competition = await this.competition();
    if (competition.currency !== "NGN") throw new HttpError(409, "UNSUPPORTED_CURRENCY", "Vote packages require an NGN competition.");
    return this.db.$transaction(async tx => {
      const item = await tx.votePackage.create({ data: { ...input, competitionId: competition.id, currency: "NGN" } });
      await tx.auditLog.create({ data: { adminId, action: "VOTE_PACKAGE_CREATED", entityType: "VotePackage", entityId: item.id, details: { competitionId: item.competitionId, name: item.name, priceKobo: item.priceKobo, voteCount: item.voteCount, isActive: item.isActive } } });
      return item;
    });
  }
  async updatePackage(id: string, input: PackagePatch, adminId: string) {
    const competition = await this.competition();
    if (competition.currency !== "NGN") throw new HttpError(409, "UNSUPPORTED_CURRENCY", "Vote packages require an NGN competition.");
    return this.db.$transaction(async tx => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "VotePackage" WHERE id = ${id} AND "competitionId" = ${competition.id} FOR UPDATE`;
      if (!rows.length) throw missing();
      const previous = await tx.votePackage.findUniqueOrThrow({ where: { id } });
      if (previous.currency !== "NGN") throw new HttpError(409, "UNSUPPORTED_CURRENCY", "This package requires currency review.");
      if (previous.updatedAt.toISOString() !== input.expectedUpdatedAt) throw stale();
      const { expectedUpdatedAt: _version, ...data } = input;
      const changes = Object.fromEntries(Object.entries(data).filter(([key,value]) => previous[key as keyof typeof previous] !== value).map(([key,value]) => [key,{before:previous[key as keyof typeof previous],after:value}]));
      if (!Object.keys(changes).length) return previous;
      const item = await tx.votePackage.update({ where: { id }, data: { ...data, updatedAt: new Date(Math.max(this.now().getTime(), previous.updatedAt.getTime() + 1)) } });
      await tx.auditLog.create({ data: { adminId, action: "VOTE_PACKAGE_UPDATED", entityType: "VotePackage", entityId: id, details: { competitionId: competition.id, changes } as Prisma.InputJsonObject } });
      return item;
    });
  }
}
