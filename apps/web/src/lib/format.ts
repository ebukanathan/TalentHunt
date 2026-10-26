export function formatVotes(value: string): string {
  if (!/^(0|[1-9][0-9]*)$/.test(value))
    throw new RangeError("Invalid vote total.");
  return new Intl.NumberFormat("en-NG").format(BigInt(value));
}

/** Divide only as integers; preserve every kobo even at MAX_SAFE_INTEGER. */
export function formatKobo(kobo: number, currency = "NGN"): string {
  if (!Number.isSafeInteger(kobo) || kobo < 0)
    throw new RangeError("Invalid kobo amount.");
  const amount = BigInt(kobo);
  const fraction = (amount % BigInt(100)).toString().padStart(2, "0");
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .formatToParts(amount / BigInt(100))
    .map((part) => (part.type === "fraction" ? fraction : part.value))
    .join("");
}
