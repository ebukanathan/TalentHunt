import { z } from "zod";

const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const email = z.string().max(254).refine(value => !/[\u0000-\u001f\u007f]/.test(value))
  .trim().pipe(z.email()).transform(value => {
    const at = value.lastIndexOf("@");
    return value.slice(0, at + 1) + value.slice(at + 1).toLowerCase();
  });
export const initializePaymentSchema = z.strictObject({ contestantId: id, packageId: id, email });
export type InitializePaymentInput = z.infer<typeof initializePaymentSchema>;
// A random UUIDv4 is an unguessable retry capability, not an account or email proof.
export const idempotencyKeySchema = z.string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  .transform(value => value.toLowerCase());
