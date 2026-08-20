import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const migration = readFileSync('supabase/migrations/20260812203000_school_request_email_notifications.sql', 'utf8');
const edgeFunction = readFileSync('supabase/functions/school_request_email/index.ts', 'utf8');
const professionalEmailMigration = readFileSync('supabase/migrations/20260815151437_professional_email_communications_v1.sql', 'utf8');
const service = readFileSync('services/schoolRequestService.ts', 'utf8');
const modal = readFileSync('components/SchoolRequestModal.tsx', 'utf8');
test('school request email ledger is service-only and idempotent', () => {
    assert.match(migration, /unique\s*\(request_id,\s*event_key\)/i);
    assert.match(migration, /enable row level security/i);
    assert.match(migration, /revoke all on table public\.school_request_email_deliveries from public, anon, authenticated/i);
    assert.match(migration, /grant select, insert, update on table public\.school_request_email_deliveries to service_role/i);
});
test('email recipient is queued by auth user id and resolved only by the server dispatcher', () => {
    assert.match(edgeFunction, /recipient_user_id:\s*request\.requested_by/);
    assert.match(professionalEmailMigration, /recipient_user_id uuid references auth\.users/);
    assert.match(professionalEmailMigration, /professional_email_school_request/);
    assert.doesNotMatch(edgeFunction, /to:\s*\[request\.requester_email\]/);
});
test('submission and superadmin updates require the correct caller', () => {
    assert.match(edgeFunction, /request\.requested_by !== user\.id \|\| request\.status !== "pending"/);
    assert.match(edgeFunction, /\.rpc\("is_superadmin"/);
    assert.match(edgeFunction, /Superadmin access required/);
    assert.match(edgeFunction, /idempotency_key:\s*idempotencyKey/);
    assert.doesNotMatch(edgeFunction, /api\.resend\.com/);
});
test('saved requests survive mail-provider failures with visible delivery feedback', () => {
    assert.match(service, /notifySchoolRequestByEmail\(result\.requestId, 'submitted'\)/);
    assert.match(service, /notifySchoolRequestByEmail\(requestId, 'status_updated'\)/);
    assert.match(service, /The request was saved, but the email update could not be sent/);
    assert.match(modal, /verified Brains Heist account email/);
    assert.match(modal, /superadmin updates go to your verified Brains Heist account email/);
});
