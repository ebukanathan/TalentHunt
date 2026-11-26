import { Suspense } from "react";
import { checkoutConfiguration } from "@/lib/checkout/session";
import { PaymentConfirmation } from "@/components/payment-confirmation";
export const metadata = { title: "Purchase confirmation", robots: { index: false, follow: false }, referrer: "no-referrer" };
type Props = { searchParams: Promise<{ reference?: string; trxref?: string }> };
export default function Page(props: Props) { return <main className="container contestants-page"><Suspense fallback={<p>Loading your purchase…</p>}><Content {...props} /></Suspense></main>; }
async function Content({ searchParams }: Props) {
  const query = await searchParams;
  const value = query.reference || query.trxref;
  const reference = typeof value === "string" && /^th-(test|live)-[a-f0-9-]{36}$/.test(value) && (!query.trxref || query.trxref === value) ? value : null;
  let mode: "test" | "live" = "test";
  try { mode = checkoutConfiguration()?.mode || "test"; } catch { /* Checkout endpoint fails closed. */ }
  return <PaymentConfirmation reference={reference?.startsWith(`th-${mode}-`) ? reference : null} mode={mode} />;
}
