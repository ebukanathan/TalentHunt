import "server-only";
import { refreshPaymentStatus } from "@/lib/checkout/status";
export function POST(request: Request) { return refreshPaymentStatus(request); }
