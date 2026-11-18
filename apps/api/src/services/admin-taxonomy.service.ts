import { Prisma, type PrismaClient } from "@prisma/client";
import { HttpError } from "../http/errors";
import type { CreateTaxonomy, PatchTaxonomy, TaxonomyQuery } from "../validation/admin-taxonomy";

const fields = { id: true, competitionId: true, name: true, slug: true, isActive: true, sortOrder: true,
  revision: true, createdAt: true, updatedAt: true } satisfies Prisma.CategorySelect;
const childFields = { ...fields, categoryId: true } satisfies Prisma.SubcategorySelect;
const editable = ["name", "slug", "isActive", "sortOrder"] as const;
const missing = () => new HttpError(404, "TAXONOMY_NOT_FOUND", "Category or subcategory not found in this competition.");
type Selection = (tx: Prisma.TransactionClient) => Promise<{ id: string }>;

export class AdminTaxonomyService {
  constructor(private readonly db: PrismaClient, private readonly select: Selection) {}

  private async competition(tx: Prisma.TransactionClient, lock = false) {
    const selected = await this.select(tx);
    if (lock) await tx.$queryRaw`SELECT id FROM "Competition" WHERE id = ${selected.id} FOR UPDATE`;
    const competition = await tx.competition.findUnique({ where: { id: selected.id } });
    if (!competition) throw missing();
    return competition;
  }
  private async parent(tx: Prisma.TransactionClient, competitionId: string, id: string, lock = false) {
    if (lock) await tx.$queryRaw`SELECT id FROM "Category" WHERE id = ${id} AND "competitionId" = ${competitionId} FOR UPDATE`;
    const category = await tx.category.findFirst({ where: { id, competitionId }, select: fields });
    if (!category) throw missing();
    return category;
  }
  private async child(tx: Prisma.TransactionClient, competitionId: string, categoryId: string, id: string, lock = false) {
    if (lock) await tx.$queryRaw`SELECT id FROM "Subcategory" WHERE id = ${id} AND "competitionId" = ${competitionId} AND "categoryId" = ${categoryId} FOR UPDATE`;
    const child = await tx.subcategory.findFirst({ where: { id, competitionId, categoryId }, select: childFields });
    if (!child) throw missing();
    return child;
  }
  private async impact(tx: Prisma.TransactionClient, competitionId: string, categoryId: string, subcategoryId?: string) {
    const assignment = { competitionId, categoryId, ...(subcategoryId ? { subcategoryId } : {}) };
    // Include legacy anomalous payments through contestant ownership as well as
    // immutable new scope ownership; don't silently miss an affected selection.
    const payments: Prisma.PaymentWhereInput = { OR: [{ contestant: assignment }, { scope: { is: assignment } }] };
    const [contestants, paymentCount, pendingPayments, allocations, subcategories] = await Promise.all([
      tx.contestant.count({ where: assignment }), tx.payment.count({ where: payments }),
      tx.payment.count({ where: { ...payments, status: "PENDING" } }),
      tx.voteAllocation.count({ where: { contestant: assignment } }),
      subcategoryId ? Promise.resolve(0) : tx.subcategory.count({ where: { competitionId, categoryId } }),
    ]);
    return { contestants, payments: paymentCount, pendingPayments, allocations, subcategories };
  }
  list(query: TaxonomyQuery, categoryId?: string) {
    return this.db.$transaction(async tx => {
      const competition = await this.competition(tx);
      const category = categoryId ? await this.parent(tx, competition.id, categoryId) : undefined;
      const where = { competitionId: competition.id, ...(categoryId ? { categoryId } : {}),
        ...(query.status === "all" ? {} : { isActive: query.status === "active" }) };
      const options = { where, orderBy: [{ sortOrder: "asc" as const }, { nameKey: "asc" as const }, { id: "asc" as const }],
        skip: (query.page - 1) * query.pageSize, take: query.pageSize };
      const [total, items] = categoryId ? await Promise.all([tx.subcategory.count({ where }), tx.subcategory.findMany({ ...options, select: childFields })])
        : await Promise.all([tx.category.count({ where }), tx.category.findMany({ ...options, select: fields })]);
      return { competition, ...(category ? { category } : {}), items,
        pagination: { page: query.page, pageSize: query.pageSize, total, pages: Math.ceil(total / query.pageSize) } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  get(categoryId: string, subcategoryId?: string) {
    return this.db.$transaction(async tx => {
      const competition = await this.competition(tx), category = await this.parent(tx, competition.id, categoryId);
      const item = subcategoryId ? await this.child(tx, competition.id, categoryId, subcategoryId) : category;
      return { competition, ...(subcategoryId ? { category } : {}), item,
        impact: await this.impact(tx, competition.id, categoryId, subcategoryId) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  private mutable(competition: { resultsPublishedAt: Date | null }) {
    if (competition.resultsPublishedAt) throw new HttpError(409, "RESULTS_ALREADY_PUBLISHED", "Published results lock category changes. A reviewed correction is required.");
  }
  private async conflict<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        throw new HttpError(409, "TAXONOMY_EXISTS", "This name or slug is already used under this parent, including inactive records.");
      throw error;
    }
  }
  create(input: CreateTaxonomy, adminId: string, categoryId?: string) {
    return this.conflict(() => this.db.$transaction(async tx => {
      // Shared lock order: competition -> category -> subcategory -> contestant.
      const competition = await this.competition(tx, true);
      if (categoryId) await this.parent(tx, competition.id, categoryId, true);
      this.mutable(competition);
      const item = categoryId ? await tx.subcategory.create({ data: { ...input, competitionId: competition.id, categoryId }, select: childFields })
        : await tx.category.create({ data: { ...input, competitionId: competition.id }, select: fields });
      await tx.auditLog.create({ data: { adminId, action: categoryId ? "SUBCATEGORY_CREATED" : "CATEGORY_CREATED",
        entityType: categoryId ? "Subcategory" : "Category", entityId: item.id,
        details: { competitionId: competition.id, ...(categoryId ? { categoryId } : {}), values: input, revision: item.revision } } });
      return item;
    }));
  }
  patch(categoryId: string, input: PatchTaxonomy, adminId: string, subcategoryId?: string) {
    return this.conflict(() => this.db.$transaction(async tx => {
      const competition = await this.competition(tx, true), category = await this.parent(tx, competition.id, categoryId, true);
      const previous = subcategoryId ? await this.child(tx, competition.id, categoryId, subcategoryId, true) : category;
      if (previous.revision !== input.expectedRevision) throw new HttpError(409, "TAXONOMY_CHANGED", "This record changed. Reload before saving.");
      const data = Object.fromEntries(editable.filter(key => input[key] !== undefined).map(key => [key, input[key]]));
      const changes = Object.fromEntries(editable.filter(key => input[key] !== undefined && input[key] !== previous[key])
        .map(key => [key, { before: previous[key], after: input[key] }]));
      if (!Object.keys(changes).length) return previous;
      this.mutable(competition);
      if (previous.isActive && input.isActive === false && (await this.impact(tx, competition.id, categoryId, subcategoryId)).pendingPayments)
        throw new HttpError(409, "TAXONOMY_PENDING_PAYMENTS", "Pending selections reference this group. Reconcile them before deactivating it.");
      const item = subcategoryId ? await tx.subcategory.update({ where: { id: subcategoryId }, data, select: childFields })
        : await tx.category.update({ where: { id: categoryId }, data, select: fields });
      const entityType = subcategoryId ? "Subcategory" : "Category", prefix = subcategoryId ? "SUBCATEGORY" : "CATEGORY";
      for (const [action, values] of [[`${prefix}_UPDATED`, Object.fromEntries(Object.entries(changes).filter(([key]) => key !== "isActive"))],
        [`${prefix}_STATUS_CHANGED`, changes.isActive ? { isActive: changes.isActive } : {}]] as const) {
        if (Object.keys(values).length) await tx.auditLog.create({ data: { adminId, action, entityType, entityId: item.id,
          details: { competitionId: competition.id, ...(subcategoryId ? { categoryId } : {}), changes: values, revision: item.revision } } });
      }
      return item;
    }));
  }
}
