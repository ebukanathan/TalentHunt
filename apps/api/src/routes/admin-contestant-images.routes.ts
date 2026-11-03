import { Router } from "express";
import { z } from "zod";
import type { AdminAuthService } from "../services/admin-auth.service";
import type { AdminContestantImageService } from "../services/admin-contestant-images.service";
import { HttpError } from "../http/errors";
import { adminContestantId } from "../validation/admin-contestants";
import { readImage } from "../images/multipart";

/** Parent verifies session before reaching this router. Multipart exemption is local. */
export function createAdminImagesRouter(auth: AdminAuthService, images?: AdminContestantImageService) {
  const router = Router({ mergeParams: true });
  let activeUploads = 0;
  router.use((req, res, next) => {
    if (!["POST", "DELETE"].includes(req.method)) throw new HttpError(405, "METHOD_NOT_ALLOWED", "Unsupported image operation.");
    auth.validateMutation(req.get("Origin"), req.get("Sec-Fetch-Site"), Boolean(req.is(req.method === "POST" ? "multipart/form-data" : "application/json")));
    auth.validateSessionCsrf(req.get("X-CSRF-Token"), res.locals.adminToken);
    if (!images) throw new HttpError(503, "IMAGE_STORAGE_NOT_CONFIGURED", "Photograph uploads are not configured.");
    next();
  });
  router.post<{ id: string }>("/", async (req, res) => {
    const id = adminContestantId.parse(req.params.id);
    if (activeUploads >= 2) throw new HttpError(429, "IMAGE_PROCESSING_BUSY", "Image processing is busy. Try again shortly.");
    activeUploads++;
    try {
      const input = await readImage(req);
      res.status(200).json({ status: "success", data: await images!.upload(id, input, res.locals.admin.id) });
    } finally { activeUploads--; }
  });
  router.delete<{ id: string }>("/", async (req, res) => {
    const id = adminContestantId.parse(req.params.id);
    z.strictObject({}).parse(req.body);
    res.json({ status: "success", data: await images!.remove(id, res.locals.admin.id) });
  });
  return router;
}
