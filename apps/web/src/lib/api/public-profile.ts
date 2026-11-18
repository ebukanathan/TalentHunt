import "server-only";
import { cache } from "react";
import { ApiError } from "./client";
import { contestantIdSchema } from "./schemas";
import { getPublicApi } from "./server";
import { getPublicCompetition } from "./public-competition";

// React cache deduplicates within one render, never across visitors or requests.
export const getPublicProfile = cache(async (id: string) => {
  if (!contestantIdSchema.safeParse(id).success) return { kind: "not-found" } as const;
  try {
    const api = await getPublicApi();
    const [contestant, competition] = await Promise.all([api.contestant(id), getPublicCompetition()]);
    if (!competition || competition.status === "DRAFT" || contestant.competitionId !== competition.id) return { kind: "not-found" } as const;
    return { kind: "ready", contestant, competition } as const;
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return { kind: ["NOT_FOUND", "BAD_REQUEST"].includes(error.code) ? "not-found" : "unavailable" } as const;
  }
});
