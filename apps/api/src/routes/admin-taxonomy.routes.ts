import { Router } from "express";
import { createTaxonomy, patchTaxonomy, taxonomyId, taxonomyQuery } from "../validation/admin-taxonomy";
import type { AdminTaxonomyService } from "../services/admin-taxonomy.service";

/** Mounted after the existing active-admin session and mutation/CSRF guards. */
export function createAdminTaxonomyRouter(service: AdminTaxonomyService) {
  const router = Router();
  router.get("/categories", async (req, res) => res.json({ status: "success", data: await service.list(taxonomyQuery.parse(req.query)) }));
  router.post("/categories", async (req, res) => res.status(201).json({ status: "success", data: await service.create(createTaxonomy.parse(req.body), res.locals.admin.id) }));
  router.get("/categories/:categoryId", async (req, res) => {
    taxonomyQuery.pick({}).parse(req.query);
    res.json({ status: "success", data: await service.get(taxonomyId.parse(req.params.categoryId)) });
  });
  router.patch("/categories/:categoryId", async (req, res) => res.json({ status: "success", data: await service.patch(taxonomyId.parse(req.params.categoryId), patchTaxonomy.parse(req.body), res.locals.admin.id) }));
  router.get("/categories/:categoryId/subcategories", async (req, res) => res.json({ status: "success", data: await service.list(taxonomyQuery.parse(req.query), taxonomyId.parse(req.params.categoryId)) }));
  router.post("/categories/:categoryId/subcategories", async (req, res) => res.status(201).json({ status: "success", data: await service.create(createTaxonomy.parse(req.body), res.locals.admin.id, taxonomyId.parse(req.params.categoryId)) }));
  router.get("/categories/:categoryId/subcategories/:subcategoryId", async (req, res) => {
    taxonomyQuery.pick({}).parse(req.query);
    res.json({ status: "success", data: await service.get(taxonomyId.parse(req.params.categoryId), taxonomyId.parse(req.params.subcategoryId)) });
  });
  router.patch("/categories/:categoryId/subcategories/:subcategoryId", async (req, res) => res.json({ status: "success", data: await service.patch(taxonomyId.parse(req.params.categoryId), patchTaxonomy.parse(req.body), res.locals.admin.id, taxonomyId.parse(req.params.subcategoryId)) }));
  return router;
}
