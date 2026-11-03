import { forwardSettings } from "@/lib/admin/proxy";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { return forwardSettings(request, "vote-packages", (await context.params).id); }
