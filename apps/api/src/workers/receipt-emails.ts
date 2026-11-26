import { setTimeout } from "node:timers/promises";
import { environment } from "../config/env";
import { prisma } from "../lib/prisma";
import { ResendReceiptClient } from "../clients/receipt-email.client";
import { ReceiptEmailWorker } from "../services/receipt-email-worker.service";
async function main() {
  if (!environment.email) throw new Error("Transactional email must be explicitly configured.");
  const worker = new ReceiptEmailWorker(prisma, environment.email, new ResendReceiptClient(environment.email));
  let stopping = false;
  process.once("SIGINT", () => { stopping = true; }); process.once("SIGTERM", () => { stopping = true; });
  while (!stopping) { try { const result = await worker.processNext(); if (result.outcome === "IDLE") await setTimeout(1000); }
    catch { console.error("Receipt worker storage unavailable; retrying with durable delivery evidence."); await setTimeout(5000); } }
}
main().catch(() => { console.error("Receipt worker could not start."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
