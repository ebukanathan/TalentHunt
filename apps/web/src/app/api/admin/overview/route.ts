import { forwardOverview } from "@/lib/admin/proxy";
export function GET(request: Request) { return forwardOverview(request); }
