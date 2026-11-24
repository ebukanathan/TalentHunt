import "server-only";
import { connection } from "next/server";
import { checkoutSession } from "@/lib/checkout/handlers";
export async function GET(request: Request) { await connection(); return checkoutSession(request); }
