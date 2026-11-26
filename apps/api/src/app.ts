import express from "express";
import cors from "cors";
import helmet from "helmet";
import { errorHandler, HttpError } from "./http/errors";
import { createPublicRouter } from "./routes/public.routes";
import type { PublicApi } from "./services/public.service";
import { createPaymentsRouter } from "./routes/payments.routes";
import type { PaymentInitializationApi } from "./services/payment-initialization.service";
import { createAdminRouter } from "./routes/admin-auth.routes";
import type { AdminAuthService } from "./services/admin-auth.service";
import { AdminContestantService } from "./services/admin-contestants.service";
import type { ImageStorage } from "./storage/contestant-images";
import { AdminContestantImageService } from "./services/admin-contestant-images.service";
import { AdminSettingsService } from "./services/admin-settings.service";
import { AdminOverviewService } from "./services/admin-overview.service";
import { LeaderboardService } from "./services/leaderboard.service";
import { AdminTaxonomyService } from "./services/admin-taxonomy.service";
import { AdminAssignmentsService } from "./services/admin-assignments.service";
import { createPaystackWebhookRouter } from "./routes/paystack-webhooks.routes";
import type { PaystackWebhookIntake } from "./services/paystack-webhook-intake.service";
import type { PaymentStatusService } from "./services/payment-status.service";
import { createReceiptEmailWebhookRouter } from "./routes/receipt-email-webhooks.routes";
import type { ReceiptEmailWebhook } from "./services/receipt-email-webhook.service";

/** Injectable composition keeps HTTP tests on their explicitly selected database. */
export function createApp(service: PublicApi, payments?: PaymentInitializationApi, admin?: AdminAuthService, storage?: ImageStorage, webhooks?: PaystackWebhookIntake, paymentStatus?: PaymentStatusService, emails?: ReceiptEmailWebhook) {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: admin?.config.ADMIN_APP_ORIGIN || "http://localhost:3000" }));
  // Authenticate original bytes before the global JSON parser can change them.
  app.use("/api/v1/webhooks/paystack", createPaystackWebhookRouter(webhooks));
  app.use("/api/v1/webhooks/resend", createReceiptEmailWebhookRouter(emails));
  // Browser clients send plain JSON. Reject encoded bodies before opening a
  // decompression stream, including malformed frames sent to unknown routes.
  app.use(express.json({ limit: "100kb", inflate: false }));
  app.set("json replacer", (_key: string, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value);

  // Preserve the existing health contract.
  app.get("/api/v1/health", (_request, response) => {
    response.status(200).json({ status: "ok", message: "TalentHunt API is running" });
  });

  app.use("/api/v1", createPublicRouter(service));
  app.use("/api/v1/payments", createPaymentsRouter(payments, paymentStatus));
  const selection = { getCompetition: () => service.getManagedCompetition ? service.getManagedCompetition() : service.getCompetition() };
  const contestants = admin ? new AdminContestantService(admin.database, selection) : undefined;
  const images = admin && contestants && storage ? new AdminContestantImageService(admin.database, storage, contestants) : undefined;
  const overview = admin ? new AdminOverviewService(admin.database, tx =>
    service.getManagedCompetition ? service.getManagedCompetition(tx) : service.getCompetition()) : undefined;
  const leaderboard = admin ? new LeaderboardService(admin.database, tx => service.getManagedCompetition ? service.getManagedCompetition(tx) : service.getCompetition()) : undefined;
  const taxonomy = admin ? new AdminTaxonomyService(admin.database, tx => service.getManagedCompetition ? service.getManagedCompetition(tx) : service.getCompetition()) : undefined;
  const assignments = admin ? new AdminAssignmentsService(admin.database, tx => service.getManagedCompetition ? service.getManagedCompetition(tx) : service.getCompetition()) : undefined;
  app.use("/api/v1/admin", createAdminRouter(admin, contestants, images, admin ? new AdminSettingsService(admin.database, selection) : undefined, overview, leaderboard, taxonomy, assignments));
  app.use((_request, _response, next) => {
    next(new HttpError(404, "ROUTE_NOT_FOUND", "Route not found."));
  });
  app.use(errorHandler);
  return app;
}

export default createApp;
