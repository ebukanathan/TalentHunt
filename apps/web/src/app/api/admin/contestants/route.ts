import { forwardContestants } from "@/lib/admin/proxy";
export function GET(request: Request) { return forwardContestants(request); }
export function POST(request: Request) { return forwardContestants(request); }
