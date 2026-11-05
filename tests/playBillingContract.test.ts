import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20261105130000_ielts_prime_google_play_billing.sql');
const edge = read('supabase/functions/play_billing/index.ts');
const page = read('src/pages/ielts/IeltsPrime.tsx');
const client = read('src/native/playBilling.ts');

test('Google Play Prime only counts while its paid period is running', () => {
  assert.match(migration, /s\.provider = 'google_play'[\s\S]*current_period_end > now\(\)/);
  assert.match(migration, /ielts_prime_subscriptions_google_token_key[\s\S]*google_purchase_token/);
});

test('the server verifies every token with Google and ties it to the caller', () => {
  assert.match(edge, /purchases\/subscriptionsv2\/tokens/);
  assert.match(edge, /obfuscatedExternalAccountId/);
  assert.match(edge, /info\.account !== user\.id/);
  assert.match(edge, /already linked to another account/);
});

test('the Android app buys through Google Play and never opens Paddle', () => {
  assert.match(client, /nativePlatform\(\) === 'android'/);
  assert.match(client, /appAccountToken: auth\.user\.id/);
  const checkout = page.slice(page.indexOf('const handleCheckout'), page.indexOf('const handleRestore'));
  assert.ok(checkout.indexOf('if (playBilling)') < checkout.indexOf('createIeltsPrimeCheckout'));
  assert.match(checkout, /if \(iosNoPurchase\) return;/);
  assert.match(page, /if \(!transactionId \|\| playBilling \|\| iosNoPurchase\) return;/);
});
