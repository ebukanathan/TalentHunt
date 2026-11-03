import { forwardSettings } from "@/lib/admin/proxy";
export function GET(request: Request) { return forwardSettings(request, "vote-packages"); }
export function POST(request: Request) { return forwardSettings(request, "vote-packages"); }
