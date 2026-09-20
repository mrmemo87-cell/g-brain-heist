import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const migration = readFileSync('supabase/migrations/20260816100000_superadmin_question_bank_inspector.sql', 'utf8');
const service = readFileSync('services/adminQuestionBankService.ts', 'utf8');
const inspector = readFileSync('components/admin/tabs/QuestionBankInspectorTab.tsx', 'utf8');
const adminPortal = readFileSync('components/AdminPortal.tsx', 'utf8');
test('question-bank catalog fails closed at a dedicated superadmin RPC boundary', () => {
    assert.match(migration, /create or replace function public\.rpc_superadmin_question_bank_inspector/i);
    assert.match(migration, /security definer/i);
    assert.match(migration, /set search_path = ''/i);
    assert.match(migration, /auth\.uid\(\) is null or not public\.is_superadmin\(auth\.uid\(\)\)/i);
    assert.match(migration, /platform_superadmin_access_required/i);
    assert.match(migration, /revoke all on function public\.rpc_superadmin_question_bank_inspector[\s\S]+from public, anon, authenticated, service_role/i);
    assert.match(migration, /grant execute on function public\.rpc_superadmin_question_bank_inspector[\s\S]+to authenticated, service_role/i);
});
test('catalog separates verified, teacher and retired records without losing provenance', () => {
    assert.match(migration, /when q\.content_origin = 'brain_heist' and q\.verification_status = 'verified' then 'verified'/i);
    assert.match(migration, /when q\.content_origin = 'teacher' then 'teacher'/i);
    assert.match(migration, /else 'archive'/i);
    assert.match(migration, /left join public\.teachers t on t\.id = q\.teacher_id/i);
    assert.match(migration, /left join public\.users u on u\.id = t\.user_id/i);
    assert.match(migration, /from public\.school_members sm/i);
    assert.match(migration, /left join public\.schools s/i);
    assert.match(migration, /'name', b\.teacher_name/i);
    assert.match(migration, /'schoolName', b\.school_name/i);
    assert.match(migration, /'profileLinked', b\.profile_linked/i);
});
test('superadmin UI clearly identifies the official and teacher-created pools', () => {
    assert.match(service, /supabase\.rpc\('rpc_superadmin_question_bank_inspector'/);
    assert.match(inspector, /Brains Heist Verified Pool/);
    assert.match(inspector, /Teacher Submissions/);
    assert.match(inspector, /Retired Archive/);
    assert.match(inspector, /question\.teacher\.name/);
    assert.match(inspector, /question\.teacher\.schoolName/);
    assert.match(inspector, /Identity link missing/);
    assert.match(inspector, /Protected answer/);
});
test('question-bank navigation and rendering require confirmed superadmin state', () => {
    assert.match(adminPortal, /const SUPERADMIN_TABS:[^\n]+question-bank/);
    assert.match(adminPortal, /isSuperadmin \? SUPERADMIN_TABS : ADMIN_TABS/);
    assert.match(adminPortal, /const \[isSuperadmin, setIsSuperadmin\] = useState\(false\)/);
    assert.match(adminPortal, /supabase\.rpc\('rpc_is_superadmin'\)/);
    assert.match(adminPortal, /(?:activeTab|tab) === 'question-bank' && isSuperadmin && \(/);
    assert.match(adminPortal, /<QuestionBankInspectorTab \/>/);
    assert.match(adminPortal, /React\.lazy\(\(\) => import\('\.\/admin\/tabs\/QuestionBankInspectorTab'\)\)/);
    assert.doesNotMatch(adminPortal, /const ADMIN_TABS:[^\n]+question-bank/);
});
