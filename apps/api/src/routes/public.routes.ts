import { Router } from "express";
import { createPublicControllers } from "../controllers/public.controller";
import type { PublicApi } from "../services/public.service";
import { leaderboardQuery } from "../validation/leaderboard";
import { HttpError } from "../http/errors";

export function createPublicRouter(service: PublicApi) {
  const router = Router();
  router.use((_req, res, next) => { res.set({ "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" }); next(); });
  const controllers = createPublicControllers(service);
  router.get("/competition", controllers.competition);
  router.get("/leaderboard", async (req, res) => {
    if (!service.getLeaderboard) throw new HttpError(503, "SERVICE_UNAVAILABLE", "Leaderboard unavailable.");
    res.json({ status: "success", data: await service.getLeaderboard(leaderboardQuery.parse(req.query)) });
  });
  router.get("/contestants", controllers.contestants);
  router.get("/contestants/:id", controllers.contestant);
  router.get("/vote-packages", controllers.votePackages);
  return router;
}
