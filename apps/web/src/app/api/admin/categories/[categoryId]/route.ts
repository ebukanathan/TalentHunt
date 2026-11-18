import { forwardTaxonomy } from "@/lib/admin/proxy";
type Context = { params: Promise<{ categoryId: string }> };
export async function GET(request: Request, context: Context) { return forwardTaxonomy(request, (await context.params).categoryId); }
export const PATCH = GET;
