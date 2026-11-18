import { forwardTaxonomy } from "@/lib/admin/proxy";
type Context = { params: Promise<{ categoryId: string; subcategoryId: string }> };
export async function GET(request: Request, context: Context) { const params = await context.params; return forwardTaxonomy(request, params.categoryId, true, params.subcategoryId); }
export const PATCH = GET;
