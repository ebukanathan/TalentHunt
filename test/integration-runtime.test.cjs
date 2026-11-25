const test = require('node:test');
const assert = require('node:assert/strict');
const { environments, validateProvider } = require('../scripts/integration-settings.cjs');
const { waitForRuntime } = require('../scripts/integration-readiness.cjs');
const database = 'postgresql://postgres@127.0.0.1:5432/talenthunt_paid_demo_1234abcd';
const secrets = { admin: 'a'.repeat(64), checkout: 'b'.repeat(64) };
test('integrated runtime discards unrelated database/provider/admin configuration and keeps secrets backend-only', () => {
  const { api, web } = environments({ PATH: 'system-path', DATABASE_URL: 'postgresql://remote.example/production', PAYSTACK_SECRET_KEY: 'sk_live_inherited', SUPABASE_SECRET_KEY: 'inherited', ADMIN_CSRF_SECRET: 'inherited', ADMIN_PROVISION_DATABASE_URL: 'remote', NEXT_PUBLIC_PROVIDER_SECRET: 'inherited', CHECKOUT_SESSION_SECRET: 'inherited', ADMIN_AUTH_ENABLED: 'false' }, { PAYSTACK_SECRET_KEY: 'sk_test_fixtureOnly' }, database, secrets);
  assert.equal(api.DATABASE_URL, database); assert.equal(api.ADMIN_AUTH_ENABLED, 'true'); assert.equal(api.ADMIN_CSRF_SECRET, secrets.admin);
  assert.equal(api.PAYSTACK_SECRET_KEY, 'sk_test_fixtureOnly'); assert.equal(api.PAYSTACK_FINALIZATION_ENABLED, 'true');
  assert.equal(web.CHECKOUT_SESSION_SECRET, secrets.checkout); assert.equal(web.API_BASE_URL, 'http://localhost:4000/api/v1'); assert.equal(web.PATH, 'system-path');
  for (const key of ['DATABASE_URL', 'PAYSTACK_SECRET_KEY', 'ADMIN_CSRF_SECRET', 'SUPABASE_SECRET_KEY', 'ADMIN_PROVISION_DATABASE_URL', 'NEXT_PUBLIC_PROVIDER_SECRET']) assert.equal(web[key], undefined);
});
test('integrated runtime rejects live keys, remote/ambiguous databases and callback redirects', () => {
  assert.throws(() => validateProvider({ PAYSTACK_SECRET_KEY: 'sk_live_private' }), /test secret/);
  assert.throws(() => validateProvider({ PAYSTACK_CALLBACK_URL: 'https://elsewhere.example/return' }), /local application/);
  for (const target of [database.replace('127.0.0.1', 'remote.example'), database.replace('talenthunt_paid_demo_1234abcd', 'production'), database + '?host=remote.example']) assert.throws(() => environments({}, {}, target, secrets), /owned loopback/);
  const { api, web } = environments({}, {}, database, secrets);
  assert.equal(api.PAYSTACK_FINALIZATION_ENABLED, 'false'); assert.equal(api.PAYSTACK_WEBHOOKS_ENABLED, 'false'); assert.equal(web.CHECKOUT_TEST_ENABLED, 'true');
});
test('readiness waits for complete streamed pages and a usable admin challenge before returning', async () => {
  let attempts = 0, consumed = 0;
  await waitForRuntime({ timeoutMs: 1000, intervalMs: 1, fetcher: async url => {
    if (++attempts === 1) return new Response('starting', { status: 503 });
    return { ok: true, text: async () => { await new Promise(done => setTimeout(done, 5)); consumed++; return url.endsWith('/csrf') ? JSON.stringify({ data: { csrfToken: 'fixture' } }) : 'ready'; } };
  } });
  assert.equal(attempts, 6); assert.equal(consumed, 5);
  await assert.rejects(waitForRuntime({ timeoutMs: 20, intervalMs: 1, fetcher: async () => new Response('unavailable', { status: 503 }) }), /readiness timed out/);
});

test('image storage imports only an explicitly selected test project and never exposes its backend key to Next', () => {
  const ref = 'a'.repeat(20), key = 'sb_secret_' + 'b'.repeat(32), url = `https://${ref}.supabase.co`;
  const settings = { SUPABASE_URL: url, SUPABASE_SECRET_KEY: key, SUPABASE_TEST_PROJECT_REF: ref, DATABASE_URL: 'unrelated', PAYSTACK_SECRET_KEY: 'sk_live_unrelated' };
  const { api, web } = environments({}, {}, database, secrets, settings);
  assert.equal(api.SUPABASE_URL, url); assert.equal(api.SUPABASE_SECRET_KEY, key);
  assert.equal(api.DATABASE_URL, database); assert.equal(api.PAYSTACK_SECRET_KEY, '');
  assert.equal(web.NEXT_PUBLIC_CONTESTANT_IMAGE_ORIGIN, url);
  assert.equal(web.SUPABASE_URL, undefined); assert.equal(web.SUPABASE_SECRET_KEY, undefined);
  assert.equal(environments({}, {}, database, secrets, { ...settings, SUPABASE_URL: url + '/' }).api.SUPABASE_URL, url);
  for (const invalid of [{ ...settings, SUPABASE_TEST_PROJECT_REF: '' }, { ...settings, SUPABASE_URL: 'https://other.supabase.co' }, { ...settings, SUPABASE_URL: url + '?override=other' }, { ...settings, SUPABASE_SECRET_KEY: '' }, { ...settings, SUPABASE_SECRET_KEY: 'sb_publishable_' + 'c'.repeat(32) }])
    assert.throws(() => environments({}, {}, database, secrets, invalid), /explicitly selected.*test project/);
});
