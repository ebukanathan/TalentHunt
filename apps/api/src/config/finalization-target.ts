/** Hosted test payments require an explicitly approved, isolated staging target.
 * Configuration is an operator attestation; account/project isolation must also
 * be checked before deployment. Existing local fixture restrictions stay intact.
 */
export function assertTestFinalizationTarget(databaseUrl: string, source: NodeJS.ProcessEnv) {
  const target = new URL(databaseUrl);
  if (source.PAYSTACK_MODE !== "live" && ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) && !target.search && !target.hash &&
      /^\/talenthunt_(paid_demo|browser_test|vitest)_[a-z0-9_]+$/.test(target.pathname)) return;
  const live = source.PAYSTACK_MODE === "live";
  if (source.DEPLOYMENT_ENV !== "staging" && !live) {
    throw new Error("Test finalization requires an explicitly named local test database.");
  }
  const invalid = () => { throw new Error("Test finalization requires an approved isolated Supabase staging configuration."); };
  const ref = (live ? source.PRODUCTION_SUPABASE_PROJECT_REF : source.STAGING_SUPABASE_PROJECT_REF) || "";
  const approved = live ? source.PRODUCTION_DATABASE_APPROVED : source.STAGING_DATABASE_APPROVED;
  if (source.NODE_ENV !== "production" || approved !== "true" || !/^[a-z0-9]{20}$/.test(ref) ||
      (live ? source.DEPLOYMENT_ENV !== "production" || source.PAYSTACK_LIVE_ACTIVATION_APPROVED !== "true" ||
        !/^sk_live_[A-Za-z0-9]+$/.test(source.PAYSTACK_SECRET_KEY || "") : source.PAYSTACK_MODE !== "test" ||
        !/^sk_test_[A-Za-z0-9]+$/.test(source.PAYSTACK_SECRET_KEY || ""))) return invalid();
  // Use the provider's direct or session-pooler endpoint, never transaction mode
  // or a URL parameter that can redirect the connection or weaken TLS.
  const direct = target.hostname === `db.${ref}.supabase.co` && target.username === "postgres";
  const pooled = /^aws-[a-z0-9-]+\.pooler\.supabase\.com$/.test(target.hostname) && target.username === `postgres.${ref}`;
  const allowed = new Set(["sslmode", "sslaccept", "connection_limit", "pool_timeout"]);
  const params = [...target.searchParams];
  if (!["postgres:", "postgresql:"].includes(target.protocol) || !(direct || pooled) || !target.password ||
      target.port !== "5432" || target.pathname !== "/postgres" || target.hash ||
      target.searchParams.get("sslmode") !== "require" || target.searchParams.get("sslaccept") !== "strict" ||
      params.some(([key, value]) => !allowed.has(key) || (!["sslmode", "sslaccept"].includes(key) && !/^[1-9][0-9]{0,2}$/.test(value))) ||
      new Set(params.map(([key]) => key)).size !== params.length) return invalid();
  try {
    const storage = new URL(source.SUPABASE_URL || "");
    const origin = new URL(source.ADMIN_APP_ORIGIN || "");
    if (storage.origin !== `https://${ref}.supabase.co` || storage.pathname !== "/" || storage.search || storage.hash || storage.username || storage.password ||
        origin.origin !== source.ADMIN_APP_ORIGIN || origin.protocol !== "https:" || origin.port || origin.username || origin.password ||
        (live ? origin.origin !== "https://talent.apearlschools.com" :
          source.STAGING_APP_ORIGIN !== origin.origin || origin.origin === "https://talent.apearlschools.com") ||
        source.PAYSTACK_CALLBACK_URL !== `${origin.origin}/payments/return`) return invalid();
  } catch { return invalid(); }
}
