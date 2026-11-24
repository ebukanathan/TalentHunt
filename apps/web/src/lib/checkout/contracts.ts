import { z } from "zod";

const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
export const attemptKey = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
export const checkoutInput = z.strictObject({ contestantId: id, packageId: id,
  email: z.string().max(254).refine(value => !/[\u0000-\u001f\u007f]/.test(value)).trim().pipe(z.email())
    .transform(value => { const at = value.lastIndexOf("@"); return value.slice(0, at + 1) + value.slice(at + 1).toLowerCase(); }),
});
export type CheckoutInput = z.infer<typeof checkoutInput>;
export function safeCheckoutUrl(value: string) {
  try {
    const url = new URL(value);
    return url.origin === "https://checkout.paystack.com" && !url.username && !url.password && !url.search && !url.hash && /^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname);
  } catch { return false; }
}
export const checkoutResult = z.strictObject({
  reference: z.string().regex(/^th-test-[0-9a-f-]{36}$/), mode: z.literal("test"),
  purchase: z.strictObject({ competitionId: id, categoryId: id, subcategoryId: id, contestantId: id, packageId: id,
    amountKobo: z.number().int().min(5000).max(2147483647), voteCount: z.number().int().positive().max(2147483647), currency: z.literal("NGN") }),
  authorizationUrl: z.string().refine(safeCheckoutUrl).optional(),
  initializationStatus: z.enum(["PENDING", "REVIEW_REQUIRED"]).optional(),
}).refine(value => Boolean(value.authorizationUrl) !== Boolean(value.initializationStatus));
export type CheckoutResult = z.infer<typeof checkoutResult>;
