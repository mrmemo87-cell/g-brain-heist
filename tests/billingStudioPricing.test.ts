import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('supabase/migrations/20260812180000_school_billing_studio_v1.sql', 'utf8');

test('Billing Studio locks the approved per-student catalogue and minimums', () => {
  assert.match(migration, /'platform','Brains Heist Platform',175,50/);
  assert.match(migration, /'cambridge','Cambridge',125,25/);
  assert.match(migration, /'ielts','IELTS',150,25/);
  assert.match(migration, /'writing','Writing Hub',100,25/);
  assert.match(migration, /'admissions','Admission Hub',75,50/);
  assert.match(migration, /"ai_reviews_per_student_month":10/);
  assert.match(migration, /"reviews":500,"amount_minor":5000/);
});

test('Billing Studio locks discount ordering and the 35 percent ceiling', () => {
  assert.match(migration, /500, 1000, 1500, 1000, 1500, 2000, 1500, 3500/);
  assert.match(migration, /v_combo_discount_monthly := round\(v_addons_monthly::numeric \* v_combo_bps \/ 10000\)/);
  assert.match(migration, /v_term_discount := round\(\(v_monthly_after_combo \* v_months\)::numeric \* v_term_bps \/ 10000\)/);
  assert.match(migration, /v_launch_discount := greatest\(0,least\(v_launch_discount,v_max_discount-v_existing_discount\)\)/);
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
