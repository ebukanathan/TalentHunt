import { Router } from "express";
import { createPublicControllers } from "../controllers/public.controller";
import type { PublicApi } from "../services/public.service";

export function createPublicRouter(service: PublicApi) {
  const router = Router();
  const controllers = createPublicControllers(service);
  router.get("/competition", controllers.competition);
  router.get("/contestants", controllers.contestants);
  router.get("/contestants/:id", controllers.contestant);
  router.get("/vote-packages", controllers.votePackages);
  return router;
}
