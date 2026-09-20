import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const migration = readFileSync('supabase/migrations/20260812180000_school_billing_studio_v1.sql', 'utf8');
const launchOfferMigration = readFileSync('supabase/migrations/20260822023000_school_pricing_launch_65.sql', 'utf8');
const annualBaselineMigration = readFileSync('supabase/migrations/20260822031500_school_pricing_annual_baseline.sql', 'utf8');
const publicPricing = readFileSync('public/pricing.html', 'utf8');
const billingStudio = readFileSync('components/school-admin/BillingStudio.tsx', 'utf8');
test('Billing Studio locks the approved per-student catalogue and minimums', () => {
    assert.match(migration, /'platform','Brains Heist Platform',175,50/);
    assert.match(migration, /'cambridge','Cambridge',125,25/);
    assert.match(migration, /'ielts','IELTS',150,25/);
    assert.match(migration, /'writing','Writing Hub',100,25/);
    assert.match(migration, /'admissions','Admission Hub',75,50/);
    assert.match(migration, /"ai_reviews_per_student_month":10/);
    assert.match(migration, /"reviews":500,"amount_minor":5000/);
});
test('Billing Studio keeps discount ordering and applies the current launch ceiling', () => {
    assert.match(migration, /v_combo_discount_monthly := round\(v_addons_monthly::numeric \* v_combo_bps \/ 10000\)/);
    assert.match(migration, /v_term_discount := round\(\(v_monthly_after_combo \* v_months\)::numeric \* v_term_bps \/ 10000\)/);
    assert.match(migration, /v_launch_discount := greatest\(0,least\(v_launch_discount,v_max_discount-v_existing_discount\)\)/);
    assert.match(launchOfferMigration, /launch_bps = 6500/);
    assert.match(launchOfferMigration, /maximum_discount_bps = 6500/);
    assert.match(annualBaselineMigration, /annual_bps = 0/);
});
test('public school pricing uses annual as the baseline and does not offer monthly billing', () => {
    assert.match(publicPricing, /term: 'annual'/);
    assert.match(publicPricing, /\['annual', 'Annual', 'Standard annual agreement'\]/);
    assert.doesNotMatch(publicPricing, /\['monthly', 'Monthly'/);
    assert.doesNotMatch(publicPricing, /Platform pricing starts at/);
    assert.doesNotMatch(publicPricing, /after the \$\{percent\(payload\.discounts\.annual_bps\)\} annual discount/);
});
test('School Admin uses annual as the baseline and does not offer monthly billing', () => {
    assert.match(billingStudio, /contractTerm: 'annual'/);
    assert.match(billingStudio, /\{ key: 'annual', label: 'Annual', note: 'Standard annual agreement' \}/);
    assert.doesNotMatch(billingStudio, /\{ key: 'monthly', label: 'Monthly'/);
    assert.doesNotMatch(billingStudio, /10% prepaid discount/);
});
test('public and School Admin receipts show the list total before discounts', () => {
    assert.match(publicPricing, /Total before discounts/);
    assert.ok(publicPricing.includes('${money(result.contractList)}'));
    assert.match(billingStudio, /Total before discounts/);
    assert.ok(billingStudio.includes('formatBillingMoney(listTotalMinor, currency)'));
});
test('launch offer copy and receipt percentage follow the live catalogue', () => {
    assert.match(publicPricing, /id="launch-note"/);
    assert.match(publicPricing, /Include the \$\{percent\(payload\.discounts\.launch_bps\)\} Launch offer/);
    assert.match(publicPricing, /combined discounts capped at \$\{percent\(payload\.discounts\.maximum_discount_bps\)\}/);
    assert.match(publicPricing, /Launch offer · \$\{percent\(state\.payload\.discounts\.launch_bps\)\} · first year/);
    assert.match(billingStudio, /Include the \$\{launchPercent\} Launch offer/);
    assert.match(billingStudio, /Launch offer · \{billingPercent\(calculation\.discounts\.launch_bps\)\} · first year/);
    assert.doesNotMatch(publicPricing, /15% Launch/);
    assert.doesNotMatch(publicPricing, /35%/);
    assert.doesNotMatch(billingStudio, /Request the 15% Launch discount/);
    assert.doesNotMatch(billingStudio, /total discount never exceeds 35%/);
});
test('quote writes stay behind governed RPCs and never activate access', () => {
    assert.match(migration, /alter table public\.school_billing_quotes enable row level security/);
    assert.match(migration, /revoke all on public\.school_billing_quotes from public, anon, authenticated/);
    assert.match(migration, /grant select on public\.school_billing_quotes to authenticated/);
    assert.match(migration, /public\.is_school_owner\(p_school_id\)/);
    assert.match(migration, /public\.is_superadmin\(v_actor\)/);
    assert.doesNotMatch(migration, /update public\.school_module_entitlements/);
    assert.doesNotMatch(migration, /insert into public\.billing_subscriptions/);
});
