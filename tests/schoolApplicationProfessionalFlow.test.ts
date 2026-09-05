import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const modal = readFileSync('components/SchoolRequestModal.tsx', 'utf8');
const service = readFileSync('services/schoolRequestService.ts', 'utf8');
const admin = readFileSync('components/AdminPortal.tsx', 'utf8');
const migration = readFileSync('supabase/migrations/20260905060000_professional_school_application_flow.sql', 'utf8');

test('pending applicants have a passive single-application experience', () => {
  assert.match(modal, /Your school application/);
  assert.match(modal, /No action required right now/);
  assert.match(modal, /reviewed within 24 hours/);
  assert.match(modal, /selectedRequest\.status === 'needs_more_info'/);
  assert.doesNotMatch(modal, /selectedRequest\.status === 'pending' \|\| selectedRequest\.status === 'needs_more_info'/);
});

test('approval messaging reflects automatic school leadership provisioning', () => {
  assert.match(admin, /requester has been provisioned as School Admin and School Head/);
  assert.doesNotMatch(admin, /Requester joined as student\/teacher/);
  assert.match(modal, /School Admin and School Head/);
});

test('backend allows one active application and applicant replies only when requested', () => {
  assert.match(migration, /school_requests_one_active_per_requester_uidx/);
  assert.match(migration, /status in \('pending', 'needs_more_info'\)/i);
  assert.match(migration, /v_status <> 'needs_more_info'/);
  assert.match(migration, /owner-school-request-/);
});

test('submission copy is customer-facing rather than queue-internal', () => {
  assert.match(service, /Application submitted\. No action is required right now/);
  assert.doesNotMatch(service, /A confirmation is queued/);
});
