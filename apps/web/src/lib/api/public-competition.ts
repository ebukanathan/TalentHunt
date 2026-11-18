import "server-only";
import { cache } from "react";
import { getPublicApi } from "./server";

export const getPublicCompetition = cache(async () => (await getPublicApi()).competition());
