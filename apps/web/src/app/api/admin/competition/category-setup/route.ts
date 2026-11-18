import { forwardCategorySetup } from "@/lib/admin/proxy";
export const GET = (request: Request) => forwardCategorySetup(request);
