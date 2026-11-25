const origin = 'http://localhost:3000';
function validateProvider(settings) {
  const key = settings.PAYSTACK_SECRET_KEY || '';
  if (key && !/^sk_test_[A-Za-z0-9]+$/.test(key)) throw new Error('Only a Paystack test secret is permitted.');
  const callback = settings.PAYSTACK_CALLBACK_URL || origin + '/payments/return';
  if (callback !== origin + '/payments/return') throw new Error('Integration checkout must return to this local application.');
  return { key, callback, signingKeys: settings.PAYSTACK_WEBHOOK_SIGNING_KEYS || '' };
}
function validateStorage(settings) {
  const url = settings.SUPABASE_URL || '', key = settings.SUPABASE_SECRET_KEY || '', ref = settings.SUPABASE_TEST_PROJECT_REF || '';
  if (!url && !key && !ref) return null;
  let selected;
  try { selected = new URL(url); } catch { /* Report configuration fields only. */ }
  if (!/^[a-z0-9]{20}$/.test(ref) || !selected || selected.origin !== `https://${ref}.supabase.co` || selected.pathname !== '/' || selected.username || selected.password || selected.search || selected.hash || !/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(key))
    throw new Error('Image storage requires an explicitly selected Supabase test project and backend secret.');
  return { url: selected.origin, key };
}
function environments(inherited, settings, databaseUrl, secrets, storageSettings = {}) {
  const target = new URL(databaseUrl);
  if (target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' || target.search || target.hash ||
      !/^\/talenthunt_paid_demo_[a-f0-9]{8}$/.test(target.pathname)) throw new Error('Integration requires its owned loopback test database.');
  if (![secrets.admin, secrets.checkout].every(value => /^[a-f0-9]{64}$/.test(value))) throw new Error('Invalid local session configuration.');
  const provider = validateProvider(settings);
  const storage = validateStorage(storageSettings);
  const api = { ...inherited };
  for (const key of Object.keys(api)) if (/PAYSTACK|SUPABASE|DATABASE|DIRECT_URL|CHECKOUT|ADMIN_|SEED_|^NEXT_|^QA_|^SITE_URL$|^PUBLIC_COMPETITION/.test(key)) delete api[key];
  Object.assign(api, { NODE_ENV: 'development', PORT: '4000', DATABASE_URL: databaseUrl, PUBLIC_COMPETITION_SLUG: 'paid-test-show',
    ADMIN_AUTH_ENABLED: 'true', ADMIN_APP_ORIGIN: origin, ADMIN_CSRF_SECRET: secrets.admin,
    PAYSTACK_MODE: provider.key ? 'test' : '', PAYSTACK_SECRET_KEY: provider.key, PAYSTACK_CALLBACK_URL: provider.key ? provider.callback : '',
    PAYSTACK_FINALIZATION_ENABLED: provider.key ? 'true' : 'false', PAYSTACK_WEBHOOKS_ENABLED: provider.key && provider.signingKeys ? 'true' : 'false',
    PAYSTACK_WEBHOOK_SIGNING_KEYS: provider.signingKeys, PAYSTACK_ALLOW_LEGACY_SIGNATURE: 'false',
    SUPABASE_URL: storage?.url || '', SUPABASE_SECRET_KEY: storage?.key || '' });
  const web = { ...api, API_BASE_URL: 'http://localhost:4000/api/v1', SITE_URL: origin, CHECKOUT_TEST_ENABLED: 'true',
    CHECKOUT_APP_ORIGIN: origin, CHECKOUT_SESSION_SECRET: secrets.checkout, NEXT_DIST_DIR: '.next-integration' };
  for (const key of Object.keys(web)) if (/PAYSTACK|SUPABASE|DATABASE|DIRECT_URL|^ADMIN_CSRF_SECRET$/.test(key)) delete web[key];
  if (storage) web.NEXT_PUBLIC_CONTESTANT_IMAGE_ORIGIN = storage.url;
  return { api, web };
}
module.exports = { environments, validateProvider, origin };
