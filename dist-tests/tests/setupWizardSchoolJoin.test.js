import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const setupWizard = readFileSync('components/onboarding/SetupWizard.tsx', 'utf8');
const migration = readFileSync('supabase/migrations/20260812153614_fix_school_invite_setup_atomicity.sql', 'utf8');
const schoolSubmitBranch = setupWizard.match(/if \(path === 'school'\) \{[\s\S]+?\n      \} else if \(path === 'individual'\) \{/)?.[0] || '';
test('setup wizard joins schools only through the governed invite-code RPC', () => {
    assert.match(schoolSubmitBranch, /complete_school_setup_by_code/);
    assert.match(schoolSubmitBranch, /p_invite_code:\s*inviteCodeNormalized/);
    assert.doesNotMatch(schoolSubmitBranch, /bootstrapProfile\(/);
    assert.doesNotMatch(schoolSubmitBranch, /from\('users'\)/);
});
test('atomic school setup joins membership before completing the profile', () => {
    assert.match(migration, /security definer/i);
    assert.match(migration, /set search_path = ''/i);
    assert.match(migration, /join_school_by_code\(p_invite_code, p_role\)/i);
    assert.match(migration, /profile_bootstrap\(\s*null,/i);
    assert.match(migration, /complete_school_setup_rollback/i);
    assert.match(migration, /revoke all on function public\.complete_school_setup_by_code/i);
    assert.match(migration, /grant execute on function public\.complete_school_setup_by_code/i);
});
