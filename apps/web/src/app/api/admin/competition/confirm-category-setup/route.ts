import { forwardCategorySetup } from "@/lib/admin/proxy";
export const POST = (request: Request) => forwardCategorySetup(request, true);
