import { forwardImage } from "@/lib/admin/image-proxy";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) { return forwardImage(request, (await context.params).id); }
export async function DELETE(request: Request, context: Context) { return forwardImage(request, (await context.params).id); }
