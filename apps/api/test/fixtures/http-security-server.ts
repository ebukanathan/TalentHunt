import { createApp } from "../../src/app";
import type { PublicApi } from "../../src/services/public.service";

// An isolated process: a decompressor regression must fail the test rather than
// terminate the test runner. No database, storage or provider is configured.
const unused = async () => { throw new Error("Unexpected fixture service call."); };
const service: PublicApi = {
  getCompetition: unused, getContestants: unused, getContestant: unused,
  getContestantCards: unused, getVotePackages: unused,
};
const server = createApp(service).listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No fixture port.");
  process.stdout.write(JSON.stringify({ port: address.port }) + "\n");
});
process.on("SIGTERM", () => server.close());
