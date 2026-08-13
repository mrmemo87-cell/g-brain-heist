import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const migration = readFileSync('supabase/migrations/20260812203000_school_request_email_notifications.sql', 'utf8');
const edgeFunction = readFileSync('supabase/functions/school_request_email/index.ts', 'utf8');
const service = readFileSync('services/schoolRequestService.ts', 'utf8');
const modal = readFileSync('components/SchoolRequestModal.tsx', 'utf8');
test('school request email ledger is service-only and idempotent', () => {
    assert.match(migration, /unique\s*\(request_id,\s*event_key\)/i);
    assert.match(migration, /enable row level security/i);
    assert.match(migration, /revoke all on table public\.school_request_email_deliveries from public, anon, authenticated/i);
    assert.match(migration, /grant select, insert, update on table public\.school_request_email_deliveries to service_role/i);
});
test('email recipient is resolved from the verified auth account on the server', () => {
    assert.match(edgeFunction, /auth\.admin\.getUserById\(request\.requested_by\)/);
    assert.match(edgeFunction, /recipient\.email_confirmed_at\s*\|\|\s*recipient\.confirmed_at/);
    assert.match(edgeFunction, /to:\s*\[recipient\.email\]/);
    assert.doesNotMatch(edgeFunction, /to:\s*\[request\.requester_email\]/);
});
test('submission and superadmin updates require the correct caller', () => {
    assert.match(edgeFunction, /request\.requested_by !== user\.id \|\| request\.status !== "pending"/);
    assert.match(edgeFunction, /userClient\.rpc\(\s*"is_superadmin"/);
    assert.match(edgeFunction, /Superadmin access required/);
    assert.match(edgeFunction, /Idempotency-Key/);
});
test('saved requests survive mail-provider failures with visible delivery feedback', () => {
    assert.match(service, /notifySchoolRequestByEmail\(result\.requestId, 'submitted'\)/);
    assert.match(service, /notifySchoolRequestByEmail\(requestId, 'status_updated'\)/);
    assert.match(service, /The request was saved, but the email update could not be sent/);
    assert.match(modal, /verified Brains Heist account email/);
    assert.match(modal, /superadmin updates go to your verified Brains Heist account email/);
});
