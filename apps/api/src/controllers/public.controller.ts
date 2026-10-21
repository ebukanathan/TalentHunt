import type { RequestHandler } from "express";
import { z } from "zod";
import type { PublicApi } from "../services/public.service";

const contestantParams = z.object({
  // Prisma uses string IDs; demo IDs contain hyphens, so CUID-only validation is incorrect.
  id: z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "ID must contain only letters, numbers, underscores or hyphens."),
});

export function createPublicControllers(service: PublicApi): Record<string, RequestHandler> {
  return {
    competition: async (_request, response) => {
      response.json({ status: "success", data: await service.getCompetition() });
    },
    contestants: async (_request, response) => {
      response.json({ status: "success", data: await service.getContestants() });
    },
    contestant: async (request, response) => {
      const { id } = contestantParams.parse(request.params);
      response.json({ status: "success", data: await service.getContestant(id) });
    },
    votePackages: async (_request, response) => {
      response.json({ status: "success", data: await service.getVotePackages() });
    },
  };
}
