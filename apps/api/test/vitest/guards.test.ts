import { describe, expect, test } from 'vitest';
import { ownedDatabase, testControl, testEnvironment } from './support/database';

const control = 'postgresql://fixture@127.0.0.1:5432/talenthunt_qa_admin';
const valid = { NODE_ENV: 'test', QA_DISPOSABLE_DATABASES: '1', VOTING_VITEST_CONTROL_URL: control };
describe('test database safety', () => {
  test.each([
    { NODE_ENV: 'production' }, { NODE_ENV: 'development' }, { QA_DISPOSABLE_DATABASES: '' }, { VOTING_VITEST_CONTROL_URL: undefined },
    { VOTING_VITEST_CONTROL_URL: 'postgresql://private:password@hosted.example/talenthunt_qa_admin' },
    { VOTING_VITEST_CONTROL_URL: control.replace('talenthunt_qa_admin', 'talenthunt_dev') },
    { VOTING_VITEST_CONTROL_URL: control + '?schema=public' }, { VOTING_VITEST_CONTROL_URL: control + '#fragment' },
    { VOTING_VITEST_CONTROL_URL: 'password invalid URL' },
  ])('refuses unsafe configuration %# without printing credentials', patch => {
    expect(() => testControl({ ...valid, ...patch })).toThrow();
    try { testControl({ ...valid, ...patch }); } catch (error) { expect(String(error)).not.toMatch(/private|password|hosted.example/); }
  });
  test('never falls back to the application DATABASE_URL', () => {
    expect(() => testControl({ NODE_ENV: 'test', QA_DISPOSABLE_DATABASES: '1', DATABASE_URL: control })).toThrow();
    expect(testControl(valid).pathname).toBe('/talenthunt_qa_admin');
  });
  test('cleanup rejects foreign, malformed, unregistered and other-run databases', () => {
    const run = 'a'.repeat(16), name = `talenthunt_vitest_${run}_${'b'.repeat(16)}`;
    const registry = new Set([name]);
    expect(ownedDatabase(name, run, registry)).toBe('"' + name + '"');
    for (const bad of ['postgres', 'talenthunt_dev', name + ';DROP DATABASE postgres', name.replace(run, 'c'.repeat(16))])
      expect(() => ownedDatabase(bad, run, new Set([...registry, bad]))).toThrow();
    expect(() => ownedDatabase(name, run, new Set())).toThrow();
  });
  test('child migrations receive only the explicit test target and no provider credentials', () => {
    const env = testEnvironment({ DATABASE_URL: 'private', DIRECT_URL: 'private', PAYSTACK_SECRET_KEY: 'private',
      SUPABASE_SECRET_KEY: 'private', ADMIN_CSRF_SECRET: 'private', SEED_DATABASE_URL: 'private' }, control);
    expect(env.DATABASE_URL).toBe(control); expect(env.NODE_ENV).toBe('test');
    expect(Object.values(env)).not.toContain('private'); expect(env.PAYSTACK_SECRET_KEY).toBe('');
  });
});
