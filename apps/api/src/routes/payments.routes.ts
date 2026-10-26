import { Router } from "express";
import { initializePaymentController } from "../controllers/payments.controller";
import type { PaymentInitializationApi } from "../services/payment-initialization.service";

export function createPaymentsRouter(service?: PaymentInitializationApi) {
  const router = Router();
  router.post("/initialize", initializePaymentController(service));
  return router;
}
