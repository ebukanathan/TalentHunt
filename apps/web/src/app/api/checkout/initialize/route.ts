import "server-only";
import { initializeCheckout } from "@/lib/checkout/handlers";
export function POST(request: Request) { return initializeCheckout(request); }
