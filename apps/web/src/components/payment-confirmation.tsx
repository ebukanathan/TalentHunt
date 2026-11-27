"use client";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { attemptKey, checkoutInput, paymentReceipt } from "@/lib/checkout/contracts";
import { formatKobo } from "@/lib/format";
const stored = z.object({ key: attemptKey, binding: z.string(), input: checkoutInput, reference: z.string() });
export function PaymentConfirmation({ reference, mode = "test" }: { reference: string | null; mode?: "test" | "live" }) {
  const [data, setData] = useState<z.infer<typeof paymentReceipt> | null>(null);
  const [message, setMessage] = useState("Checking your purchase with the server…");
  const [busy, setBusy] = useState(true);
  const refresh = useCallback(async () => {
    setBusy(true);
    setData(null); setMessage("Checking your purchase with the server…");
    try {
      if (!reference) throw new Error();
      let attempt: z.infer<typeof stored> | undefined;
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)!; if (!key.startsWith(mode === "live" ? "talenthunt:checkout:" : "talenthunt:test-checkout:")) continue;
        const parsed = stored.safeParse(JSON.parse(sessionStorage.getItem(key) || "null"));
        if (parsed.success && parsed.data.reference === reference) attempt = parsed.data;
      }
      if (!attempt) throw new Error();
      const sessionResponse = await fetch("/api/checkout/session", { cache: "no-store", credentials: "same-origin", redirect: "error" });
      if (!sessionResponse.ok) throw new Error();
      const session = await sessionResponse.json();
      if (session.sessionBinding !== attempt.binding) throw new Error();
      const response = await fetch("/api/checkout/status", { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken, "X-Checkout-Session": attempt.binding, "X-Checkout-Attempt": attempt.key }, body: JSON.stringify({ reference }) });
      if (!response.ok) throw new Error();
      const receipt = paymentReceipt.parse((await response.json()).data);
      if (receipt.mode !== mode || receipt.reference !== reference || receipt.contestantId !== attempt.input.contestantId) throw new Error();
      setData(receipt); setMessage(receipt.state === "CONFIRMED" ? "Payment and votes confirmed by the server." : receipt.state === "PENDING" ? "Payment has not been confirmed yet. You can check again without starting another purchase." : "This purchase needs review. Do not start a replacement payment.");
    } catch { setMessage("This purchase cannot be confirmed from this tab. Use the original checkout tab and session, or contact support. Do not start a replacement payment."); }
    finally { setBusy(false); }
  }, [reference, mode]);
  useEffect(() => { const timer = setTimeout(() => void refresh(), 0); return () => clearTimeout(timer); }, [refresh]);
  return <section className="test-checkout" aria-labelledby="payment-heading">
    <h1 id="payment-heading">{mode === "test" ? "Test purchase confirmation" : "Purchase confirmation"}</h1>
    {mode === "test" && <p>TEST MODE ONLY</p>}<p role="status">{message}</p>
    {data && <><dl><dt>Reference</dt><dd>{data.reference}</dd><dt>Amount</dt><dd>{formatKobo(data.amountKobo, data.currency)} {data.currency}</dd>
      <dt>Votes in this purchase</dt><dd>{data.voteCount}</dd><dt>Status</dt><dd>{data.state}</dd></dl>
      {data.state === "CONFIRMED" && <><p>{data.voteCount} votes were allocated to the selected contestant.</p><p>{data.emailStatus === "DELIVERED" ? "The email provider confirmed delivery to your mail server." : data.emailStatus === "ACCEPTED" ? "The email provider accepted your receipt; delivery is not yet confirmed." : ["FAILED", "REVIEW_REQUIRED"].includes(data.emailStatus) ? "Email delivery needs review. Keep this confirmation as your receipt." : "Your confirmation email is queued. Keep this confirmation as your receipt."}</p>
        <p><a href={`/leaderboard?${new URLSearchParams({ categoryId: data.categoryId!, subcategoryId: data.subcategoryId! })}`}>View this talent leaderboard</a></p></>}
    </>}
    <button className="button button-primary" type="button" disabled={busy} onClick={() => void refresh()}>{busy ? "Checking…" : "Check payment again"}</button>
  </section>;
}
