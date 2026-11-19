import { Router } from "express";
import { z } from "zod";
import { adminContestantId } from "../validation/admin-contestants";
import { confirmCategorySetup, initialAssignment } from "../validation/assignments";
import type { AdminAssignmentsService } from "../services/admin-assignments.service";
export function createAdminAssignmentsRouter(service: AdminAssignmentsService) {
  const router = Router();
  router.get("/contestants/:id/initial-assignment", async (req, res) => { z.strictObject({}).parse(req.query); res.json({ status: "success", data: await service.preview(adminContestantId.parse(req.params.id)) }); });
  router.post("/contestants/:id/initial-assignment", async (req, res) => res.json({ status: "success", data: await service.initial(adminContestantId.parse(req.params.id), initialAssignment.parse(req.body), res.locals.admin.id) }));
  router.get("/competition/category-setup", async (req, res) => { z.strictObject({}).parse(req.query); res.json({ status: "success", data: await service.setupPreview() }); });
  router.post("/competition/confirm-category-setup", async (req, res) => res.json({ status: "success", data: await service.confirmSetup(confirmCategorySetup.parse(req.body), res.locals.admin.id) }));
  return router;
}
