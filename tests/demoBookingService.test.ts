import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeDemoBooking,
  validateDemoBooking,
  type DemoBookingInput,
} from '../services/demoBookingService.js';

const validBooking = (): DemoBookingInput => ({
  school_name: 'North Star Academy',
  contact_name: 'Dr. Maya Chen',
  email: 'Maya.Chen@School.EDU',
  phone: '+1 555 0100',
  role_title: 'Head of School',
  country: 'Singapore',
  school_size: '501–1,000 students',
  preferred_format: 'online',
  preferred_date: '2099-01-15',
  preferred_time: '10:00–12:00',
  timezone: 'Asia/Singapore',
  interests: ['admissions', 'analytics'],
  message: 'We want to improve our admissions workflow.',
  consent: true,
  website: '',
});

test('normalizes a demo booking before submission', () => {
  const normalized = normalizeDemoBooking({
    ...validBooking(),
    school_name: '  North Star Academy  ',
    email: '  Maya.Chen@School.EDU ',
    interests: ['analytics', 'analytics', 'ielts'],
  });

  assert.equal(normalized.school_name, 'North Star Academy');
  assert.equal(normalized.email, 'maya.chen@school.edu');
  assert.deepEqual(normalized.interests, ['analytics', 'ielts']);
});

test('requires a selected demo interest', () => {
  assert.equal(
    validateDemoBooking({ ...validBooking(), interests: [] }),
    'Please select at least one area to explore.',
  );
});

test('rejects an invalid work email', () => {
  assert.equal(
    validateDemoBooking({ ...validBooking(), email: 'not-an-email' }),
    'Please enter a valid work email.',
  );
});
