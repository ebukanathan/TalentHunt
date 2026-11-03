import { forwardSettings } from "@/lib/admin/proxy";
export function GET(request: Request) { return forwardSettings(request, "competition"); }
export function PATCH(request: Request) { return forwardSettings(request, "competition"); }
