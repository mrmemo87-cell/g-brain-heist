import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const migration = readFileSync('supabase/migrations/20260827191820_retire_legacy_school_billing_capacity.sql', 'utf8');
const service = readFileSync('services/platformBillingService.ts', 'utf8');
const admin = readFileSync('components/admin/tabs/BillingAccessTab.tsx', 'utf8');
test('the retired direct manual subscription RPC is removed and cannot bypass quotes', () => {
    assert.match(migration, /drop function if exists public\.admin_record_manual_school_subscription/);
    assert.match(migration, /enforce_authoritative_school_subscription_capacity/);
    assert.match(migration, /active_school_agreement_requires_accepted_quote/);
    assert.match(migration, /active_school_agreement_requires_exact_capacity/);
    assert.match(migration, /school_agreement_modules_and_capacity_must_match/);
    assert.match(migration, /enforce_contract_module_capacity/);
});
test('legacy verified agreements reconcile only to one exact accepted quote', () => {
    assert.match(migration, /contract_total_minor/);
    assert.match(migration, /pricing_version,currency/);
    assert.match(migration, /v_match_count <> 1/);
    assert.match(migration, /legacy_school_agreement_reconciliation_ambiguous/);
    assert.match(migration, /Reconciled from verified paid quote/);
    assert.match(migration, /source_quote_id = v_quote\.id/);
});
test('school plan details prefer live contractual capacity over generic enterprise limits', () => {
    assert.match(migration, /select b\.capacity into v_capacity/);
    assert.match(migration, /'game', coalesce\(\(v_capacity ->> 'platform'\)::integer, 0\)/);
    assert.match(migration, /'cambridge', coalesce\(\(v_capacity ->> 'cambridge'\)::integer, 0\)/);
    assert.match(migration, /'ielts', coalesce\(\(v_capacity ->> 'ielts'\)::integer, 0\)/);
});
test('frontend exposes only accepted-quote activation for paid school agreements', () => {
    assert.doesNotMatch(service, /recordManualSubscription|admin_record_manual_school_subscription|ManualSubscriptionInput/);
    assert.doesNotMatch(admin, /recordManualSubscription|Verified manual agreement|Record pending payment/);
    assert.match(admin, /Direct manual activation is retired/);
    assert.match(admin, /Verify payment & activate exact seats/);
    assert.match(admin, /Database enforces truth/);
});
