import assert from 'node:assert/strict';
import test from 'node:test';
import { ONBOARDING_PROFILE_SELECT } from '../src/features/onboarding/profileSelect.js';

test('onboarding profile select only uses deployed public.users columns', () => {
  assert.ok(ONBOARDING_PROFILE_SELECT.includes('school_id'));
  assert.equal(ONBOARDING_PROFILE_SELECT.includes('school_name'), false);
});
