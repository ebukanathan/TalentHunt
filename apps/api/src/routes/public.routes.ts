import { Router } from "express";
import { createPublicControllers } from "../controllers/public.controller";
import type { PublicApi } from "../services/public.service";
import { leaderboardQuery } from "../validation/leaderboard";
import { HttpError } from "../http/errors";
import { contestantCardsQuery, publicTaxonomyQuery } from "../validation/public-contestants";
import { taxonomyId } from "../validation/admin-taxonomy";

export function createPublicRouter(service: PublicApi) {
  const router = Router();
  router.use((_req, res, next) => { res.set({ "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" }); next(); });
  const controllers = createPublicControllers(service);
  router.get("/competition", controllers.competition);
  router.get("/categories", async (req, res) => {
    if (!service.getCategories) throw new HttpError(503, "SERVICE_UNAVAILABLE", "Categories unavailable.");
    res.json({ status: "success", data: await service.getCategories(publicTaxonomyQuery.parse(req.query)) });
  });
  router.get("/categories/:categoryId/subcategories", async (req, res) => {
    if (!service.getSubcategories) throw new HttpError(503, "SERVICE_UNAVAILABLE", "Subcategories unavailable.");
    res.json({ status: "success", data: await service.getSubcategories(taxonomyId.parse(req.params.categoryId), publicTaxonomyQuery.parse(req.query)) });
  });
  router.get(["/categories/:categoryId", "/categories/:categoryId/subcategories/:subcategoryId"], async (req, res) => {
    publicTaxonomyQuery.pick({}).parse(req.query);
    if (!service.getCategory) throw new HttpError(503, "SERVICE_UNAVAILABLE", "Category unavailable.");
    res.json({ status: "success", data: await service.getCategory(taxonomyId.parse(req.params.categoryId), req.params.subcategoryId === undefined ? undefined : taxonomyId.parse(req.params.subcategoryId)) });
  });
  router.get("/leaderboard", async (req, res) => {
    if (!service.getLeaderboard) throw new HttpError(503, "SERVICE_UNAVAILABLE", "Leaderboard unavailable.");
    res.json({ status: "success", data: await service.getLeaderboard(leaderboardQuery.parse(req.query)) });
  });
  router.get("/contestants", controllers.contestants);
  router.get("/contestant-cards", async (req, res) => {
    res.json({ status: "success", data: await service.getContestantCards(contestantCardsQuery.parse(req.query)) });
  });
  router.get("/contestants/:id", controllers.contestant);
  router.get("/vote-packages", controllers.votePackages);
  return router;
}
