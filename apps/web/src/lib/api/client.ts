import { z } from "zod";
import {
  competitionSchema,
  contestantSchema,
  contestantIdSchema,
  votePackageSchema,
} from "./schemas";

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
    async competition() {
      try {
        return await request("/competition", competitionSchema);
      } catch (error) {
        if (error instanceof ApiError && error.code === "NOT_FOUND")
          return null;
        throw error;
      }
    },
    contestants: () => request("/contestants", z.array(contestantSchema)),
    contestant: (id: string) => {
      if (!contestantIdSchema.safeParse(id).success)
        return Promise.reject(new ApiError("BAD_REQUEST"));
      return request(
        "/contestants/" + encodeURIComponent(id),
        contestantSchema,
      );
    },
    votePackages: () => request("/vote-packages", z.array(votePackageSchema)),
  };
}
