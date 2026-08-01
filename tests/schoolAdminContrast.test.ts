import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const billing = readFileSync('components/school-admin/BillingTabUI.tsx', 'utf8');
const admission = readFileSync('components/AdmissionHub.tsx', 'utf8');
const cambridge = readFileSync('components/school-admin/tabs/CambridgeTab.tsx', 'utf8');
const ieltsPortal = readFileSync('components/SchoolAdminPortal.tsx', 'utf8');
const styles = readFileSync('src/index.css', 'utf8');

test('billing uses a consistent formal light surface with readable plan cards', () => {
  assert.match(billing, /billing-tab-ui max-w-none/);
  assert.match(billing, /billing-plan-card/);
  assert.match(billing, /is-popular border-\[#1e4b82\] bg-blue-50/);
  assert.doesNotMatch(billing, /bg-\[#0d2929\]/);
  assert.match(styles, /\.billing-tab-ui\{padding:1\.25rem;border:1px solid #dbe4ee/);
});

test('Admission Hub candidates and results use shared professional light surfaces', () => {
  assert.match(admission, /className="admin-section-heading"/);
  assert.match(admission, /admission-light-panel admission-candidates-panel/);
  assert.match(admission, /admission-light-panel admission-results-panel/);
  assert.match(admission, /admission-candidate-directory/);
  assert.match(styles, /\.admission-hub-admin-theme/);
});

test('Cambridge actions remain white and IELTS amber copy is normalized to dark grey', () => {
  assert.equal((cambridge.match(/cambridge-white-action/g) || []).length, 3);
  assert.match(styles, /\.school-admin-themed-tab \.cambridge-white-action/);
  assert.match(ieltsPortal, /school-admin-ielts-tab/);
  assert.match(styles, /\.school-admin-ielts-tab \[class\*="text-amber-"\].*color:#374151!important/);
});
