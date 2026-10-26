import { environment } from "./config/env";
import { createApp } from "./app";
import { prisma } from "./lib/prisma";
import { PublicReadService } from "./services/public.service";
import { PaymentInitializationService } from "./services/payment-initialization.service";
import { PaystackClient } from "./clients/paystack.client";

const payments = environment.paystack
  ? new PaymentInitializationService(prisma, new PaystackClient(environment.paystack), environment.PUBLIC_COMPETITION_SLUG)
  : undefined;
const app = createApp(new PublicReadService(prisma, environment.PUBLIC_COMPETITION_SLUG), payments);
const server = app.listen(environment.PORT, () => {
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
