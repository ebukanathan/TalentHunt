import { forwardAdmin } from "@/lib/admin/proxy";
export function GET(request: Request) { return forwardAdmin(request, "csrf"); }
