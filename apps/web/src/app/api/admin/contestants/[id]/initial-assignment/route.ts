import { forwardInitialAssignment } from "@/lib/admin/proxy";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return forwardInitialAssignment(request, (await context.params).id); }
export const POST = GET;
