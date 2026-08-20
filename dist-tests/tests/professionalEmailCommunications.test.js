import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read = (path) => readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20260815151437_professional_email_communications_v1.sql');
const branding = read('supabase/functions/_shared/email.ts');
const dispatcher = read('supabase/functions/school_email_dispatcher/index.ts');
const webhook = read('supabase/functions/resend_webhook/index.ts');
const config = read('supabase/config.toml');
const ieltsAdmin = read('components/IeltsAdminDashboard.tsx');
test('professional outbox is service-only, idempotent, retryable, and distinguishes acceptance from delivery', () => {
    assert.match(migration, /create table if not exists public\.transactional_email_outbox/);
    assert.match(migration, /idempotency_key text not null unique/);
    assert.match(migration, /for update skip locked/i);
    assert.match(migration, /'accepted','delivered','delayed','bounced','complained','suppressed'/);
    assert.match(migration, /revoke all on table public\.transactional_email_outbox from public, anon, authenticated/);
    assert.match(migration, /grant select, insert, update on table public\.transactional_email_outbox to service_role/);
});
test('all transactional templates use the shared school and Brains Heist co-brand', () => {
    assert.match(branding, /schoolLogo = safeHttpsUrl\(school\.logo_url\)/);
    assert.match(branding, /alt=\"Brains Heist logo\"/);
    assert.match(branding, /Brains Heist/);
    assert.doesNotMatch(branding, /\bBrain Heist\b/);
    assert.match(dispatcher, /renderBrandedEmail\(school/);
    assert.doesNotMatch(dispatcher, /\bBrain Heist\b/);
});
test('IELTS email requests are automatically queued and the manual fake-send control is removed', () => {
    assert.match(migration, /professional_email_ielts_preference/);
    assert.match(migration, /insert into public\.transactional_email_outbox[\s\S]*ielts-result-/);
    assert.match(dispatcher, /ielts_notification_preferences/);
    assert.doesNotMatch(ieltsAdmin, /Mark email sent/);
    assert.match(ieltsAdmin, /Email queued automatically/);
});
test('signed Resend webhooks update delivery state and maintain suppressions', () => {
    assert.match(webhook, /RESEND_WEBHOOK_SECRET/);
    assert.match(webhook, /svix-signature/);
    assert.match(webhook, /email\.delivered/);
    assert.match(webhook, /email\.bounced/);
    assert.match(webhook, /email\.complained/);
    assert.match(webhook, /email_suppressions/);
    assert.match(config, /\[functions\.resend_webhook\][\s\S]*verify_jwt = false/);
});
test('professional events cover each school audience and platform operations', () => {
    for (const audience of ['school_head', 'school_admin', 'teacher', 'student', 'parent', 'applicant', 'platform_owner']) {
        assert.match(migration, new RegExp(audience));
    }
    for (const event of [
        'assignment_result_ready', 'assignment_submission_received', 'academic_report_ready',
        'school_membership_active', 'billing_quote_status', 'billing_subscription_status',
        'assignment_due_reminder', 'guardian_invitation_expiry_reminder',
        'assignment_updated', 'assignment_cancelled', 'guardian_access_confirmed',
        'teacher_allocation_active', 'admission_status_',
    ]) {
        assert.match(migration, new RegExp(event));
    }
});
