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

/** Injectable composition keeps HTTP tests on their explicitly selected database. */
export function createApp(service: PublicApi, payments?: PaymentInitializationApi, admin?: AdminAuthService, storage?: ImageStorage) {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: "http://localhost:3000" }));
  app.use(express.json({ limit: "100kb" }));
  app.set("json replacer", (_key: string, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value);

  // Preserve the existing health contract.
  app.get("/api/v1/health", (_request, response) => {
    response.status(200).json({ status: "ok", message: "TalentHunt API is running" });
  });

  app.use("/api/v1", createPublicRouter(service));
  app.use("/api/v1/payments", createPaymentsRouter(payments));
  const selection = { getCompetition: () => service.getManagedCompetition ? service.getManagedCompetition() : service.getCompetition() };
  const contestants = admin ? new AdminContestantService(admin.database, selection) : undefined;
  const images = admin && contestants && storage ? new AdminContestantImageService(admin.database, storage, contestants) : undefined;
  app.use("/api/v1/admin", createAdminRouter(admin, contestants, images, admin ? new AdminSettingsService(admin.database, selection) : undefined));
  app.use((_request, _response, next) => {
    next(new HttpError(404, "ROUTE_NOT_FOUND", "Route not found."));
  });
  app.use(errorHandler);
  return app;
}

export default createApp;
