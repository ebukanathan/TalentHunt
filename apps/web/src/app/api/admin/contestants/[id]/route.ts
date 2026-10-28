import { forwardContestants } from "@/lib/admin/proxy";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return forwardContestants(request, (await context.params).id); }
export async function PATCH(request: Request, context: Context) { return forwardContestants(request, (await context.params).id); }
