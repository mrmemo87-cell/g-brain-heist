import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const billing = readFileSync('components/school-admin/BillingTabUI.tsx', 'utf8');
const admission = readFileSync('components/AdmissionHub.tsx', 'utf8');
const styles = readFileSync('src/index.css', 'utf8');
test('billing calls to action retain white text on dark surfaces', () => {
    assert.match(billing, /billing-on-dark text-xl font-bold text-white/);
    assert.match(billing, /billing-on-dark bg-\[#1e4b82\] text-white/);
    assert.match(styles, /\.school-admin-content \.billing-tab-ui \.billing-on-dark \{ color:#fff !important; \}/);
});
test('Admission Hub heading has its own light surface', () => {
    assert.match(admission, /flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm/);
});
