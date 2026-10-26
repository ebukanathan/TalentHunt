import { z } from "zod";
import type { PaystackConfiguration } from "../config/paystack";

const checkoutUrl = z.string().url().refine(value => {
  const url = new URL(value);
  return url.protocol === "https:" && url.host === "checkout.paystack.com" &&
    !url.username && !url.password && !url.search && !url.hash && /^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname);
});
const initialization = z.object({
  status: z.literal(true),
  data: z.object({ reference: z.string(), authorization_url: checkoutUrl }),
});
export type PaystackPurchase = { reference: string; email: string; amountKobo: number; currency: "NGN" };
export interface PaystackInitializer {
  initialize(purchase: PaystackPurchase): Promise<{ authorizationUrl: string }>;
}
export class PaystackInitializationError extends Error {
  constructor(readonly outcome: "REJECTED" | "UNKNOWN") {
    super("Paystack initialization could not be completed.");
    this.name = "PaystackInitializationError";
  }
}

export class PaystackClient implements PaystackInitializer {
  constructor(private readonly configuration: PaystackConfiguration, private readonly fetcher: typeof fetch = fetch) {}

  async initialize(purchase: PaystackPurchase) {
    try {
      const response = await this.fetcher("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(this.configuration.PAYSTACK_TIMEOUT_MS),
        headers: { Authorization: "Bearer " + this.configuration.PAYSTACK_SECRET_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          reference: purchase.reference, email: purchase.email, amount: String(purchase.amountKobo),
          currency: purchase.currency, callback_url: this.configuration.PAYSTACK_CALLBACK_URL,
        }),
      });
      // Only explicit client/auth/validation rejection is definitive. Server errors,
      // rate limits, invalid replies and timeouts may follow provider acceptance.
      if ([400, 401, 403, 422].includes(response.status)) throw new PaystackInitializationError("REJECTED");
      if (!response.ok) throw new PaystackInitializationError("UNKNOWN");
      const body: unknown = await response.json();
      if (z.object({ status: z.literal(false) }).safeParse(body).success) throw new PaystackInitializationError("REJECTED");
      const result = initialization.safeParse(body);
      if (!result.success || result.data.data.reference !== purchase.reference) throw new PaystackInitializationError("UNKNOWN");
      return { authorizationUrl: result.data.data.authorization_url };
    } catch (error) {
      // Never propagate provider messages, response bodies, headers, URLs or causes.
      if (error instanceof PaystackInitializationError) throw error;
      throw new PaystackInitializationError("UNKNOWN");
    }
  }
}
