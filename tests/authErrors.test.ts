import test from 'node:test';
import assert from 'node:assert/strict';
import { EMAIL_ALREADY_REGISTERED_MESSAGE, isDuplicateEmailError, toAuthSafeErrorMessage } from '../services/authErrors.js';

test('maps public.users duplicate email constraint to safe login guidance', () => {
  const error = new Error('duplicate key value violates unique constraint "users_email_key"');

  assert.equal(isDuplicateEmailError(error), true);
  assert.equal(toAuthSafeErrorMessage(error), EMAIL_ALREADY_REGISTERED_MESSAGE);
});

test('maps Supabase duplicate auth signup errors to safe login guidance', () => {
  assert.equal(toAuthSafeErrorMessage('User already registered'), EMAIL_ALREADY_REGISTERED_MESSAGE);
  assert.equal(toAuthSafeErrorMessage('Email already exists'), EMAIL_ALREADY_REGISTERED_MESSAGE);
});

test('preserves non-duplicate auth errors', () => {
  assert.equal(toAuthSafeErrorMessage(new Error('Password should be at least 6 characters')), 'Password should be at least 6 characters');
});
