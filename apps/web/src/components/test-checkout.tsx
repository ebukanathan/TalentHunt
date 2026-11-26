"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import type { Competition, Contestant, VotePackage } from "@/lib/api/schemas";
import { attemptKey, checkoutInput, checkoutResult, type CheckoutResult } from "@/lib/checkout/contracts";
import { formatKobo, formatVotes } from "@/lib/format";

const storedAttempt = z.strictObject({ key: attemptKey, binding: z.string().regex(/^[0-9a-f]{64}$/), input: checkoutInput, reference: z.string().optional() });
type Attempt = z.infer<typeof storedAttempt>;
export function TestCheckout({ contestant, competition, item, open, onLock, onSelect, mode = "test" }: {
  contestant: Pick<Contestant, "id" | "category" | "subcategory">; competition: Competition;
  mode?: "test" | "live"; item?: VotePackage; open: boolean; onLock: (locked: boolean) => void; onSelect: (id: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const storageKey = (mode === "live" ? "talenthunt:checkout:" : "talenthunt:test-checkout:") + contestant.id;
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(storageKey);
        if (raw) {
          const saved = storedAttempt.parse(JSON.parse(raw));
          if (saved.input.contestantId !== contestant.id) throw new Error();
          setAttempt(saved); setEmail(saved.input.email); onSelect(saved.input.packageId); onLock(true);
          setMessage(mode === "test" ? "A test checkout was previously started in this tab. Retry to retrieve the same checkout; do not start another purchase." : "A checkout was previously started in this tab. Retry the same purchase; do not start another payment.");
        }
        setHydrated(true);
      } catch { setMessage("Checkout storage is unavailable or invalid. Keep this tab for review; checkout cannot safely continue."); }
    }, 0);
    return () => clearTimeout(timer);
  }, [storageKey, contestant.id, onLock, onSelect, mode]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current || !hydrated || (!attempt && (!item || !open))) return;
    const input = checkoutInput.safeParse(attempt?.input || { contestantId: contestant.id, packageId: item?.id, email });
    if (!input.success) { setMessage("Enter a valid email address and select a package."); return; }
    sending.current = true; setBusy(true); setMessage(""); setResult(null);
    try {
      const sessionResponse = await fetch("/api/checkout/session", { cache: "no-store", credentials: "same-origin", redirect: "error" });
      if (!sessionResponse.ok) throw new Error();
      const session = z.strictObject({ csrfToken: z.string().regex(/^[0-9a-f]{64}$/), sessionBinding: z.string().regex(/^[0-9a-f]{64}$/), expiresAt: z.number().int() }).parse(await sessionResponse.json());
      if (attempt && attempt.binding !== session.sessionBinding) {
        setMessage("Your checkout session expired or changed. The previous purchase requires review. A new purchase has not been started."); return;
      }
      const current = attempt || { key: crypto.randomUUID(), binding: session.sessionBinding, input: input.data };
      // Persist before dispatch. Failed/ambiguous requests always reuse this exact
      // input and session-bound key, including after reload. Storage failure stops dispatch.
      sessionStorage.setItem(storageKey, JSON.stringify(current));
      setAttempt(current); setEmail(current.input.email); onSelect(current.input.packageId); onLock(true);
      const response = await fetch("/api/checkout/initialize", { method: "POST", credentials: "same-origin", redirect: "error", cache: "no-store",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken, "X-Checkout-Session": current.binding, "X-Checkout-Attempt": current.key },
        body: JSON.stringify(current.input), signal: AbortSignal.timeout(20000) });
      if (!response.ok) {
        const failure = await response.json().catch(() => null);
        if (failure?.error === "CHECKOUT_NOT_CONFIGURED") { setMessage("Paystack test credentials are not configured on this server. This request could not start checkout. Keep this tab and retry after test configuration is ready."); return; }
        throw new Error();
      }
      const data = checkoutResult.parse((await response.json()).data);
      if (data.purchase.contestantId !== contestant.id || data.purchase.packageId !== current.input.packageId || data.purchase.competitionId !== competition.id ||
          data.purchase.categoryId !== contestant.category.id || data.purchase.subcategoryId !== contestant.subcategory.id ||
          (response.status === 202) !== Boolean(data.initializationStatus)) throw new Error();
      setResult(data);
      const remembered = { ...current, reference: data.reference };
      sessionStorage.setItem(storageKey, JSON.stringify(remembered)); setAttempt(remembered);
      if (!data.authorizationUrl) setMessage("Checkout is pending or requires review. Retry retrieves the same purchase and will not create another transaction.");
    } catch { setMessage("Checkout could not be confirmed. Retry the same purchase. Do not create another checkout while its outcome is uncertain."); }
    finally { sending.current = false; setBusy(false); }
  }
  return <section className="test-checkout" aria-labelledby="test-checkout-heading">
    <h2 id="test-checkout-heading">{mode === "test" ? "Test checkout" : "Checkout"}</h2>
    {mode === "test" && <p className="test-checkout-banner">TEST MODE ONLY — use Paystack test payment details. Votes are added only after the server confirms an eligible payment.</p>}
    <form method="post" onSubmit={submit}>
      <fieldset disabled={!hydrated || busy || (!attempt && (!item || !open))}>
        <legend>Email for this purchase</legend>
        <label htmlFor="checkout-email">Email address (required)</label>
        <input id="checkout-email" type="email" autoComplete="email" inputMode="email" maxLength={254} required value={email} readOnly={Boolean(attempt)} onChange={event => setEmail(event.target.value)} aria-describedby="checkout-privacy" />
        <p id="checkout-privacy">Used to contact you about this purchase and future receipts. Email ownership is not verified. Do not enter card details here. This tab temporarily stores your selection and email so retries remain safe.</p>
        <button className="button button-primary" type="submit">{busy ? "Preparing checkout…" : attempt ? (mode === "test" ? "Retry same test checkout" : "Retry same checkout") : (mode === "test" ? "Review test checkout" : "Review checkout")}</button>
      </fieldset>
    </form>
    {message && <p role="status">{message}</p>}
    {result && <div className="checkout-review" role="status">
      <h3>{mode === "test" ? "Confirm the stored test purchase" : "Confirm the stored purchase"}</h3>
      <p>{formatVotes(String(result.purchase.voteCount))} votes · {formatKobo(result.purchase.amountKobo, result.purchase.currency)} {result.purchase.currency}</p>
      <p>The server reserved this amount. It may differ from a package changed since this page opened. No payment or vote allocation has been confirmed.</p>
      {result.authorizationUrl && open ? <a className="button button-primary" href={result.authorizationUrl} rel="noreferrer" referrerPolicy="no-referrer">{mode === "test" ? "Continue to Paystack (test)" : "Continue to Paystack"}</a> : !open ? <p>Voting is closed. Do not complete this checkout; contact support for review.</p> : null}
      <p><a href={`/payments/return?reference=${encodeURIComponent(result.reference)}`} referrerPolicy="no-referrer">{mode === "test" ? "Check this test purchase" : "Check this purchase"}</a></p>
    </div>}
  </section>;
}
