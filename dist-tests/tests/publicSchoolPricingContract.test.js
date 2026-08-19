import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read = (path) => readFileSync(path, 'utf8');
const pricingPage = read('public/pricing.html');
const publicApi = read('api/public-school-pricing.ts');
const migration = read('supabase/migrations/20260815172500_public_school_pricing_contract.sql');
const tierService = read('services/tierService.ts');
const upgradeModal = read('components/UpgradeModal.tsx');
const billingTabUi = read('components/school-admin/BillingTabUI.tsx');
const paddleFunction = read('supabase/functions/paddle/index.ts');
test('public pricing uses the active Billing Studio catalogue and routes decisions to School Admin', () => {
    assert.match(pricingPage, /fetch\('\/api\/public-school-pricing'/);
    assert.match(pricingPage, /view=school_admin&amp;adminTab=billing/);
    assert.match(pricingPage, /Server-calculated pricing|same active catalogue and discount rules/);
    assert.match(pricingPage, /escapeHtml/);
    assert.doesNotMatch(pricingPage, /\$449|\$649|\$1,149|\$4,490|\$6,490|\$11,490/);
    assert.doesNotMatch(pricingPage, /Save ~17%|Instant activation|Cancel anytime|60 Cambridge/);
});
test('public pricing RPC is a narrow anonymous read-only contract', () => {
    assert.match(migration, /create or replace function public\.get_public_school_pricing\(\)/i);
    assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
    assert.match(migration, /revoke all on function public\.get_public_school_pricing\(\) from public, anon, authenticated, service_role/i);
    assert.match(migration, /grant execute on function public\.get_public_school_pricing\(\) to anon, authenticated, service_role/i);
    assert.doesNotMatch(migration, /from public\.(school_billing_quotes|billing_subscriptions|school_members|users)/i);
});
test('Vercel proxy uses only the publishable Supabase credential and fails closed', () => {
    assert.match(publicApi, /SUPABASE_ANON_KEY/);
    assert.match(publicApi, /rest\/v1\/rpc\/get_public_school_pricing/);
    assert.match(publicApi, /status\(503\)/);
    assert.doesNotMatch(publicApi, /SERVICE_ROLE/);
});
test('legacy fixed-tier purchase UI and client checkout are retired', () => {
    assert.doesNotMatch(tierService, /PAID_PLANS|createCheckoutSession|PAYMENT_PROVIDER/);
    assert.doesNotMatch(upgradeModal, /PAID_PLANS|createCheckoutSession|startPilot/);
    assert.match(upgradeModal, /view=school_admin&amp;adminTab=billing/);
    assert.doesNotMatch(billingTabUi, /PAID_PLANS|Save ~17%|onSubscribe/);
});
test('legacy Paddle school checkout returns gone while IELTS checkout remains available', () => {
    const retiredHandler = paddleFunction.slice(paddleFunction.indexOf('async function handleCreateCheckout'), paddleFunction.indexOf('type SchoolQuoteCheckoutMode'));
    assert.match(retiredHandler, /jsonResponse\(410/);
    assert.match(retiredHandler, /Plan & Billing/);
    assert.doesNotMatch(retiredHandler, /paddleRequest|PADDLE_PRICE_/);
    assert.match(paddleFunction, /handleCreateSchoolQuoteCheckout/);
    assert.match(paddleFunction, /product: "school_quote"/);
    assert.match(paddleFunction, /handleCreateIeltsPrimeCheckout/);
});
