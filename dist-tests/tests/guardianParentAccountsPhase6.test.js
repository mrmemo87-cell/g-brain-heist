import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const migration = readFileSync('supabase/migrations/20260809176000_guardian_parent_accounts.sql', 'utf8');
const portal = readFileSync('components/guardian/ParentPortal.tsx', 'utf8');
const admin = readFileSync('components/guardian/GuardianManagementPage.tsx', 'utf8');
const vite = readFileSync('vite.config.ts', 'utf8');
test('guardian relationships are separate from school membership and raw tables stay private', () => {
    assert.match(migration, /create table if not exists public\.student_guardian_relationships/i);
    assert.match(migration, /guardian_user_id uuid not null references auth\.users/i);
    assert.doesNotMatch(migration, /role_in_school\s*=\s*'guardian'/i);
    assert.match(migration, /enable row level security/i);
    assert.match(migration, /revoke all on table public\.student_guardian_relationships from public, anon, authenticated/i);
});
test('guardian invitations are one-time email-bound verified claims', () => {
    assert.match(migration, /token_hash bytea not null unique/i);
    assert.match(migration, /extensions\.digest\(v_token,'sha256'\)/i);
    assert.match(migration, /email_confirmed_at is null/i);
    assert.match(migration, /lower\(trim\(v_auth\.email\)\) <> v_inv\.invited_email/i);
    assert.match(migration, /claimed_at is not null/i);
    assert.match(migration, /expires_at < now\(\)/i);
    assert.match(migration, /revoked_at is not null/i);
});
test('parent progress contract excludes private teacher notes and raw evidence json', () => {
    assert.match(migration, /source_type in\('assignment_result','writing_attempt'\)/i);
    assert.doesNotMatch(migration, /'evidence',o\.evidence/i);
    assert.match(portal, /Private staff records remain internal/i);
    assert.match(portal, /one isolated low result is never labelled as a persistent problem/i);
});
test('school admins can create and revoke guardian access from a dedicated workflow', () => {
    assert.match(admin, /Parent & Guardian Access/i);
    assert.match(admin, /Review & send secure invitation/i);
    assert.match(admin, /Send this parent invitation\?/i);
    assert.match(admin, /Revoke/i);
    assert.match(migration, /role_in_school='school_admin'/i);
});
test('parent and guardian management pages are production build entries', () => {
    assert.match(vite, /parentPortal:\s*path\.resolve\(__dirname, 'parent-portal\.html'\)/i);
    assert.match(vite, /guardianManagement:\s*path\.resolve\(__dirname, 'guardian-management\.html'\)/i);
});
