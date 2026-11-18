import "server-only";
import { ApiError } from "./client";
import { getPublicApi } from "./server";
import { getPublicCompetition } from "./public-competition";

export async function getPublicShow() {
  const api = await getPublicApi();
  try {
    const [competition, contestants] = await Promise.all([
      getPublicCompetition(),
      api.contestants(),
    ]);
    if (!competition || competition.status === "DRAFT") return { kind: "empty" } as const;
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
