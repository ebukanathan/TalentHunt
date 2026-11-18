import "server-only";
import { ApiError } from "./client";
import { getPublicApi } from "./server";
import { getPublicCompetition } from "./public-competition";
import { cache } from "react";

export const getPublicShow = cache(async (page = 1, pageSize = 12) => {
  try {
    const api = await getPublicApi();
    const [competition, cards] = await Promise.all([
      getPublicCompetition(),
      api.contestantCards(page, pageSize),
    ]);
    if (!competition || competition.status === "DRAFT") return { kind: "empty" } as const;
    if (
      cards.competitionId !== competition.id
    )
      throw new ApiError("INVALID_RESPONSE");
    return { kind: "ready", competition, contestants: cards.items, pagination: cards.pagination } as const;
  } catch (error) {
    if (error instanceof ApiError) return { kind: "unavailable" } as const;
    throw error;
  }
});
