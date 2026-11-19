import { z } from "zod";
import { publicLeaderboardSchema } from "./leaderboard-schemas";
import {
  competitionSchema,
  contestantIdSchema,
  votePackageSchema,
  contestantCardsSchema,
  publicContestantSchema,
} from "./schemas";
import { categoryDetailSchema, categoryListSchema } from "./category-schemas";

export class ApiError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "BAD_REQUEST"
      | "UNAVAILABLE"
      | "INVALID_RESPONSE"
      | "CONFIGURATION",
  ) {
    super("Public competition data could not be loaded.");
    this.name = "ApiError";
  }
}

/** Pure transport; server.ts owns environment access and the server-only boundary. */
export function createApiClient(
  baseUrl: string,
  options: { fetcher?: typeof fetch; timeoutMs?: number } = {},
) {
  let base: URL;
  try {
    base = new URL(baseUrl);
    if (
      !["http:", "https:"].includes(base.protocol) ||
      base.username ||
      base.password ||
      base.search ||
      base.hash
    )
      throw new Error();
  } catch {
    throw new ApiError("CONFIGURATION");
  }
  const prefix = base.toString().replace(/\/$/, "");
  const fetcher = options.fetcher ?? fetch;
  function scopeQuery(scope: { categoryId?: string; subcategoryId?: string } = {}) {
    if (scope.subcategoryId && !scope.categoryId || Object.values(scope).some(value => value !== undefined && !contestantIdSchema.safeParse(value).success)) throw new ApiError("BAD_REQUEST");
    return new URLSearchParams(Object.entries(scope).filter((entry): entry is [string, string] => entry[1] !== undefined));
  }
  function pageQuery(page: number, pageSize: number, maximum: number) {
    if (!Number.isInteger(page) || page < 1 || page > 100000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > maximum) throw new ApiError("BAD_REQUEST");
    return new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  }
  async function request<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    let response: Response;
    try {
      response = await fetcher(prefix + path, {
        cache: "no-store",
        signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
      });
    } catch {
      throw new ApiError("UNAVAILABLE");
    }
    if (response.status === 404) throw new ApiError("NOT_FOUND");
    if (response.status === 400) throw new ApiError("BAD_REQUEST");
    if (!response.ok) throw new ApiError("UNAVAILABLE");
    try {
      const envelope = z
        .object({ status: z.literal("success"), data: schema })
        .safeParse(await response.json());
      if (!envelope.success) throw new Error();
      return envelope.data.data;
    } catch {
      throw new ApiError("INVALID_RESPONSE");
    }
  }
  return {
    leaderboard: (page = "1") => request("/leaderboard?page=" + encodeURIComponent(page), publicLeaderboardSchema),
    async competition() {
      try {
        return await request("/competition", competitionSchema);
      } catch (error) {
        if (error instanceof ApiError && error.code === "NOT_FOUND")
          return null;
        throw error;
      }
    },
    contestants: async (scope: { categoryId?: string; subcategoryId?: string } = {}) => request("/contestants" + (Object.keys(scope).length ? "?" + scopeQuery(scope) : ""), z.array(publicContestantSchema).refine(rows => rows.every(item => (!scope.categoryId || item.category.id === scope.categoryId) && (!scope.subcategoryId || item.subcategory.id === scope.subcategoryId)))),
    categories: async (page = 1, pageSize = 25) => request("/categories?" + pageQuery(page, pageSize, 100), categoryListSchema),
    subcategories: async (categoryId: string, page = 1, pageSize = 25) => {
      scopeQuery({ categoryId });
      return request(`/categories/${encodeURIComponent(categoryId)}/subcategories?${pageQuery(page, pageSize, 100)}`, categoryListSchema.refine(data => data.category?.id === categoryId));
    },
    category: async (categoryId: string, subcategoryId?: string) => {
      scopeQuery({ categoryId, subcategoryId });
      return request(`/categories/${encodeURIComponent(categoryId)}${subcategoryId ? `/subcategories/${encodeURIComponent(subcategoryId)}` : ""}`, categoryDetailSchema.refine(data => data.category.id === categoryId && data.subcategory?.id === subcategoryId));
    },
    contestantCards: async (page = 1, pageSize = 12, scope: { categoryId?: string; subcategoryId?: string } = {}) => {
      if (!Number.isInteger(page) || page < 1 || page > 100000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 24) return Promise.reject(new ApiError("BAD_REQUEST"));
      const search = scopeQuery(scope); search.set("page", String(page)); search.set("pageSize", String(pageSize));
      return request(`/contestant-cards?${search}`, contestantCardsSchema.refine(data => data.items.every(item => (!scope.categoryId || item.category.id === scope.categoryId) && (!scope.subcategoryId || item.subcategory.id === scope.subcategoryId))));
    },
    contestant: (id: string) => {
      if (!contestantIdSchema.safeParse(id).success)
        return Promise.reject(new ApiError("BAD_REQUEST"));
      return request(
        "/contestants/" + encodeURIComponent(id),
        publicContestantSchema,
      );
    },
    votePackages: () => request("/vote-packages", z.array(votePackageSchema)),
  };
}
