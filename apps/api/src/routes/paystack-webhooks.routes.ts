import { Router, raw } from "express";
import { HttpError } from "../http/errors";
import type { PaystackWebhookIntake } from "../services/paystack-webhook-intake.service";
export function createPaystackWebhookRouter(intake?: PaystackWebhookIntake) {
  const router = Router();
  router.post("/", raw({ type: "application/json", limit: "100kb", inflate: false }), async (request, response) => {
    response.set("Cache-Control", "private, no-store");
    if (!intake) throw new HttpError(503, "WEBHOOKS_DISABLED", "Webhook processing is disabled.");
    if (!request.is("application/json") || !Buffer.isBuffer(request.body)) throw new HttpError(415, "INVALID_WEBHOOK_CONTENT_TYPE", "Send uncompressed JSON.");
    await intake.accept(request.body, request.get("Paystack-Signature"), request.get("X-Paystack-Signature"));
    response.status(200).json({ status: "received" });
  });
  return router;
}
