import { Router, raw } from "express";
import { HttpError } from "../http/errors";
import type { ReceiptEmailWebhook } from "../services/receipt-email-webhook.service";
export function createReceiptEmailWebhookRouter(service?: ReceiptEmailWebhook) {
  const router = Router();
  router.post("/", raw({ type: "application/json", limit: "100kb", inflate: false }), async (request, response) => {
    if (!service) throw new HttpError(503, "EMAIL_WEBHOOK_DISABLED", "Email processing is disabled.");
    if (!Buffer.isBuffer(request.body)) throw new HttpError(415, "INVALID_EMAIL_CONTENT_TYPE", "Send uncompressed JSON.");
    await service.accept(request.body, request.get("svix-id"), request.get("svix-timestamp"), request.get("svix-signature"));
    response.set("Cache-Control", "private, no-store").status(200).json({ status: "received" });
  });
  return router;
}
