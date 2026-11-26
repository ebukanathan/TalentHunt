import { setTimeout } from "node:timers/promises";
import { environment } from "../config/env";
import { prisma } from "../lib/prisma";
import { PaystackVerificationClient } from "../clients/paystack-verification.client";
import { PaystackWebhookWorker } from "../services/paystack-webhook-worker.service";
import { PaymentFinalizationService } from "../services/payment-finalization.service";
async function main() {
  if (!environment.webhooks || !environment.paystack) throw new Error("Test webhook processing must be explicitly enabled.");
  const verifier = new PaystackVerificationClient(environment.paystack);
  const worker = new PaystackWebhookWorker(prisma, verifier, environment.webhooks.maxAttempts, undefined, undefined,
    environment.finalizationEnabled ? new PaymentFinalizationService(prisma, verifier, undefined, environment.paystack.PAYSTACK_MODE) : undefined,
    environment.paystack.PAYSTACK_MODE === "live" ? "LIVE" : "TEST");
  let stopping = false;
  process.once("SIGINT", () => { stopping = true; }); process.once("SIGTERM", () => { stopping = true; });
  while (!stopping) {
    try { const result = await worker.processNext(); if (result.outcome === "IDLE") await setTimeout(1000); }
    catch { console.error("Webhook worker storage unavailable; retrying without changing payment state."); await setTimeout(5000); }
  }
}
main().catch(() => { console.error("Test webhook worker could not start."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
