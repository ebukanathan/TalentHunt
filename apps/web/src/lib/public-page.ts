export function publicPage(value: unknown): number | undefined {
  if (value === undefined) return 1;
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) return undefined;
  const page = Number(value);
  return Number.isSafeInteger(page) && page <= 100000 ? page : undefined;
}
