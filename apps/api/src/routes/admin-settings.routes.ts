import { Router } from "express";
import { adminContestantId } from "../validation/admin-contestants";
import { createPackage, packageQuery, patchCompetition, patchPackage } from "../validation/admin-settings";
import type { AdminSettingsService } from "../services/admin-settings.service";
/** Mounted after the existing session AND JSON mutation/CSRF guards. */
export function createAdminSettingsRouter(service: AdminSettingsService) {
  const router = Router();
  router.get("/competition", async (_req,res) => { res.json({ status: "success", data: await service.competition() }); });
  router.patch("/competition", async (req,res) => { res.json({ status: "success", data: await service.updateCompetition(patchCompetition.parse(req.body), res.locals.admin.id) }); });
  router.get("/vote-packages", async (req,res) => { const { page } = packageQuery.parse(req.query); res.json({ status: "success", data: await service.packages(page) }); });
  router.post("/vote-packages", async (req,res) => { res.status(201).json({ status: "success", data: await service.createPackage(createPackage.parse(req.body), res.locals.admin.id) }); });
  router.patch("/vote-packages/:id", async (req,res) => { res.json({ status: "success", data: await service.updatePackage(adminContestantId.parse(req.params.id), patchPackage.parse(req.body), res.locals.admin.id) }); });
  return router;
}
