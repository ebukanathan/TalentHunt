import "server-only";
import { connection } from "next/server";
import { ApiError, createApiClient } from "./client";

export async function getPublicApi() {
  // Keep runtime access outside transport catches and below a Suspense boundary.
  await connection();
  const base =
    process.env.API_BASE_URL ??
    (process.env.NODE_ENV === "development"
      ? "http://localhost:4000/api/v1"
      : undefined);
  if (!base) throw new ApiError("CONFIGURATION");
  return createApiClient(base);
}
