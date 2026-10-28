import { Prisma, PrismaClient } from "@prisma/client";
import { HttpError } from "../http/errors";
import type { PublicApi } from "./public.service";
import type { AdminContestantQuery, CreateAdminContestant, PatchAdminContestant } from "../validation/admin-contestants";

const selection = {
  id: true, competitionId: true, name: true, number: true, slug: true, bio: true,
  imageUrl: true, isActive: true, totalVotes: true, createdAt: true, updatedAt: true,
} satisfies Prisma.ContestantSelect;
const editable = ["name", "number", "slug", "bio", "imageUrl", "isActive"] as const;
const missing = () => new HttpError(404, "CONTESTANT_NOT_FOUND", "Contestant not found in the selected competition.");
function conflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = String(error.meta?.target || "");
    if (target.includes("number")) throw new HttpError(409, "CONTESTANT_NUMBER_EXISTS", "This contestant number is already used in this competition.");
    if (target.includes("slug")) throw new HttpError(409, "CONTESTANT_SLUG_EXISTS", "This slug is already used in this competition.");
    throw new HttpError(409, "CONTESTANT_CONFLICT", "A contestant with these details already exists.");
  }
  throw error;
}
export class AdminContestantService {
  constructor(private readonly database: PrismaClient, private readonly publicApi: Pick<PublicApi, "getCompetition">) {}

  async list(query: AdminContestantQuery) {
    const competition = await this.publicApi.getCompetition();
    const where: Prisma.ContestantWhereInput = { competitionId: competition.id };
    if (query.status !== "all") where.isActive = query.status === "active";
    if (query.q) {
      // Prisma contains uses PostgreSQL LIKE: user search text is literal.
      const search = query.q.replace(/[\\%_]/g, character => "\\" + character);
      where.OR = ["name", "number", "slug"].map(field => ({ [field]: { contains: search, mode: "insensitive" } }));
    }
    const [total, items] = await this.database.$transaction([
      this.database.contestant.count({ where }),
      this.database.contestant.findMany({ where, select: selection,
        orderBy: [{ number: "asc" }, { id: "asc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { competition, items, pagination: { page: query.page, pageSize: query.pageSize, total, pages: Math.ceil(total / query.pageSize) } };
  }
  async get(id: string) {
    const competition = await this.publicApi.getCompetition();
    const contestant = await this.database.contestant.findFirst({ where: { id, competitionId: competition.id }, select: selection });
    if (!contestant) throw missing();
    return { competition, contestant };
  }
  async create(input: CreateAdminContestant, adminId: string) {
    const competition = await this.publicApi.getCompetition();
    try {
      return await this.database.$transaction(async tx => {
        const contestant = await tx.contestant.create({ data: {
          competitionId: competition.id, name: input.name, number: input.number, slug: input.slug,
          bio: input.bio ?? null, imageUrl: input.imageUrl ?? null, isActive: input.isActive,
        }, select: selection });
        const details = Object.fromEntries(editable.map(field => [field, contestant[field]]));
        await tx.auditLog.create({ data: { adminId, action: "CONTESTANT_CREATED", entityType: "Contestant", entityId: contestant.id,
          details: { competitionId: competition.id, values: details } } });
        return contestant;
      });
    } catch (error) { return conflict(error); }
  }
  async patch(id: string, input: PatchAdminContestant, adminId: string) {
    const competition = await this.publicApi.getCompetition();
    try {
      return await this.database.$transaction(async tx => {
        // Serialize edits so audit before/after values match the committed change.
        const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Contestant" WHERE id = ${id} AND "competitionId" = ${competition.id} FOR UPDATE`;
        if (!locked.length) throw missing();
        const previous = await tx.contestant.findUniqueOrThrow({ where: { id }, select: selection });
        const changes: Prisma.InputJsonObject = Object.fromEntries(editable
          .filter(field => input[field] !== undefined && input[field] !== previous[field])
          .map(field => [field, { before: previous[field], after: input[field] }]));
        if (!Object.keys(changes).length) return previous;
        const data = Object.fromEntries(editable.filter(field => input[field] !== undefined).map(field => [field, input[field]]));
        const contestant = await tx.contestant.update({ where: { id }, data, select: selection });
        if (Object.keys(changes).some(field => field !== "isActive")) await tx.auditLog.create({ data: {
          adminId, action: "CONTESTANT_UPDATED", entityType: "Contestant", entityId: id,
          details: { competitionId: competition.id, changes },
        } });
        if (changes.isActive) await tx.auditLog.create({ data: { adminId, action: "CONTESTANT_STATUS_CHANGED", entityType: "Contestant", entityId: id,
          details: { competitionId: competition.id, change: changes.isActive } } });
        return contestant;
      });
    } catch (error) { return conflict(error); }
  }
}
