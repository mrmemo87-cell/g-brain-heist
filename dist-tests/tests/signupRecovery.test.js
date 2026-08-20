import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const migration = readFileSync('supabase/migrations/20260511120000_fix_signup_profile_email_recovery.sql', 'utf8');
const adminDeleteUser = readFileSync('supabase/functions/admin_delete_user/index.ts', 'utf8');
test('signup profile trigger reclaims orphaned public.users rows by email only when auth user is gone', () => {
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.handle_new_user\(\)/);
    assert.match(migration, /lower\(u\.email\) = v_email/);
    assert.match(migration, /NOT EXISTS \(SELECT 1 FROM auth\.users au WHERE au\.id = u\.id\)/);
    assert.match(migration, /UPDATE public\.users\s+SET id = NEW\.id/);
    assert.match(migration, /IF FOUND THEN\s+RETURN NEW;/);
    assert.doesNotMatch(migration, /RAISE NOTICE/);
    assert.match(migration, /ON CONFLICT \(id\) DO UPDATE/);
});
test('admin delete cleanup includes onboarding and profile metadata rows before public.users/auth deletion', () => {
    for (const table of [
        'user_onboarding',
        'onboarding_events',
        'sessions',
        'user_sessions',
        'auth_tokens',
        'password_reset_tokens',
        'email_verification_tokens',
        'ielts_users',
        'bh_writing_student_profiles',
        'bh_writing_student_states',
    ]) {
        assert.match(adminDeleteUser, new RegExp(`table: "${table}"`));
    }
    assert.match(adminDeleteUser, /deleteRows\("users", \(q\) => q\.eq\("email", targetUserEmail\)\)/);
    assert.match(adminDeleteUser, /admin\.auth\.admin\.deleteUser\(targetUserId\)/);
});
