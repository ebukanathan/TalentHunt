import { Router } from "express";
import { initializePaymentController } from "../controllers/payments.controller";
import type { PaymentInitializationApi } from "../services/payment-initialization.service";
import type { PaymentStatusService } from "../services/payment-status.service";
import { HttpError } from "../http/errors";
import { z } from "zod";

export function createPaymentsRouter(service?: PaymentInitializationApi, status?: PaymentStatusService) {
  const router = Router();
  router.post("/initialize", initializePaymentController(service));
  router.post("/:reference/status", async (request, response) => {
    response.set("Cache-Control", "private, no-store");
    if (!status) throw new HttpError(503, "PAYMENT_STATUS_DISABLED", "Payment status is not enabled.");
    z.strictObject({}).parse(request.body);
    response.json({ status: "success", data: await status.status(String(request.params.reference), request.get("Idempotency-Key") || "") });
  });
  return router;
}
