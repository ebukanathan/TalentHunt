import { forwardTaxonomy } from "@/lib/admin/proxy";
export const GET = (request: Request) => forwardTaxonomy(request);
export const POST = (request: Request) => forwardTaxonomy(request);
