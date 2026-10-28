import type { RequestHandler } from "express";
import { z } from "zod";
import { adminContestantId, adminContestantQuery, createAdminContestant, patchAdminContestant } from "../validation/admin-contestants";
import type { AdminContestantService } from "../services/admin-contestants.service";
const params = z.object({ id: adminContestantId });
export function createAdminContestantControllers(service: AdminContestantService): Record<string, RequestHandler> {
  return {
    list: async (req, res) => res.json({ status: "success", data: await service.list(adminContestantQuery.parse(req.query)) }),
    detail: async (req, res) => res.json({ status: "success", data: await service.get(params.parse(req.params).id) }),
    create: async (req, res) => res.status(201).json({ status: "success", data: await service.create(createAdminContestant.parse(req.body), res.locals.admin.id) }),
    patch: async (req, res) => res.json({ status: "success", data: await service.patch(params.parse(req.params).id, patchAdminContestant.parse(req.body), res.locals.admin.id) }),
  };
}
