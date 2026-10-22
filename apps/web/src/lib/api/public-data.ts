import "server-only";
import { ApiError } from "./client";
import { getPublicApi } from "./server";

export async function getPublicShow() {
  const api = await getPublicApi();
  try {
    const [competition, contestants] = await Promise.all([
      api.competition(),
      api.contestants(),
    ]);
    if (!competition) return { kind: "empty" } as const;
    if (
      contestants.some(
        (contestant) => contestant.competitionId !== competition.id,
      )
    )
      throw new ApiError("INVALID_RESPONSE");
    return { kind: "ready", competition, contestants } as const;
  } catch (error) {
    if (error instanceof ApiError) return { kind: "unavailable" } as const;
    throw error;
  }
}
