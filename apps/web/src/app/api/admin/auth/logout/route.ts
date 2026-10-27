import { forwardAdmin } from "@/lib/admin/proxy";
export function POST(request: Request) { return forwardAdmin(request, "logout"); }
