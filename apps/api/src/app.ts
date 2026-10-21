import express from "express";
import cors from "cors";
import helmet from "helmet";
import { errorHandler, HttpError } from "./http/errors";
import { createPublicRouter } from "./routes/public.routes";
import type { PublicApi } from "./services/public.service";

/** Injectable composition keeps HTTP tests on their explicitly selected database. */
export function createApp(service: PublicApi) {
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
  app.use((_request, _response, next) => {
    next(new HttpError(404, "ROUTE_NOT_FOUND", "Route not found."));
  });
  app.use(errorHandler);
  return app;
}

export default createApp;
