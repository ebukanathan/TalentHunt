import type { RequestHandler } from "express";
import { HttpError } from "../http/errors";
import type { PaymentInitializationApi } from "../services/payment-initialization.service";
import { idempotencyKeySchema, initializePaymentSchema } from "../validation/payments";

export function initializePaymentController(service?: PaymentInitializationApi): RequestHandler {
  return async (request, response) => {
    response.setHeader("Cache-Control", "private, no-store");
    const input = initializePaymentSchema.parse(request.body);
    const key = idempotencyKeySchema.safeParse(request.get("Idempotency-Key"));
    if (!key.success) throw new HttpError(400, "INVALID_IDEMPOTENCY_KEY", "Supply a random UUIDv4 Idempotency-Key header.");
    if (!service) throw new HttpError(503, "PAYMENTS_NOT_CONFIGURED", "Test checkout is not configured.");
    const result = await service.initialize(input, key.data);
    if (result.httpStatus === 202) response.setHeader("Retry-After", "5");
    response.status(result.httpStatus).json({ status: result.httpStatus === 202 ? "pending" : "success", data: result.data });
  };
}
