import { Router } from "express";
import { createAdminContestantControllers } from "../controllers/admin-contestants.controller";
import type { AdminContestantService } from "../services/admin-contestants.service";
/** Mounted only AFTER the shared admin session and CSRF middleware. */
export function createAdminContestantsRouter(service: AdminContestantService) {
  const router = Router();
  const controllers = createAdminContestantControllers(service);
  router.get("/", controllers.list);
  router.get("/:id", controllers.detail);
  router.post("/", controllers.create);
  router.patch("/:id", controllers.patch);
  return router;
}
