import { environment } from "./config/env";
import { createApp } from "./app";
import { prisma } from "./lib/prisma";
import { PublicReadService } from "./services/public.service";
import { PaymentInitializationService } from "./services/payment-initialization.service";
import { PaystackClient } from "./clients/paystack.client";
import { AdminAuthService } from "./services/admin-auth.service";
import { SupabaseImageStorage } from "./storage/contestant-images";
import { PaystackWebhookIntake } from "./services/paystack-webhook-intake.service";
import { PaymentFinalizationService } from "./services/payment-finalization.service";
import { PaymentStatusService } from "./services/payment-status.service";
import { PaystackVerificationClient } from "./clients/paystack-verification.client";
import { ReceiptEmailWebhook } from "./services/receipt-email-webhook.service";

const payments = environment.paystack
  ? new PaymentInitializationService(prisma, new PaystackClient(environment.paystack), environment.PUBLIC_COMPETITION_SLUG, undefined, environment.paystack.PAYSTACK_MODE)
  : undefined;
const admin = environment.admin ? new AdminAuthService(prisma, environment.admin) : undefined;
const storage = environment.storage ? new SupabaseImageStorage(environment.storage) : undefined;
const webhooks = environment.webhooks ? new PaystackWebhookIntake(prisma, environment.webhooks) : undefined;
const finalizer = environment.finalizationEnabled && environment.paystack ? new PaymentFinalizationService(prisma, new PaystackVerificationClient(environment.paystack), undefined, environment.paystack.PAYSTACK_MODE) : undefined;
const app = createApp(new PublicReadService(prisma, environment.PUBLIC_COMPETITION_SLUG), payments, admin, storage, webhooks, finalizer ? new PaymentStatusService(prisma, finalizer) : undefined,
  environment.email ? new ReceiptEmailWebhook(prisma, environment.email) : undefined);
const server = app.listen({ port: environment.PORT, host: environment.API_BIND_HOST }, () => {
  console.log("TalentHunt API running at http://localhost:" + environment.PORT);
});

let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  server.close(() => {
    void prisma.$disconnect().catch(() => {
      console.error("Database shutdown failed.");
      process.exitCode = 1;
    });
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
server.on("error", () => {
  console.error("API server failed to start.");
  process.exitCode = 1;
  shutdown();
});
