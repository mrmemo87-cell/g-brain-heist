import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEMO_BOOKING_DAYS,
  DEMO_BOOKING_TIMES,
  formatDemoBookingTime,
  normalizeDemoBooking,
  validateDemoBooking,
  type DemoBookingInput,
} from '../services/demoBookingService.js';

const validBooking = (): DemoBookingInput => ({
  contact_name: 'Dr. Maya Chen',
  phone: '+1 555 0100',
  preferred_date: '2026-08-10',
  preferred_time: '10:00',
  website: '',
});

test('normalizes a demo booking before submission', () => {
  const normalized = normalizeDemoBooking({
    ...validBooking(),
    contact_name: '  Dr. Maya Chen  ',
    phone: '  +1 555 0100  ',
  });

  assert.equal(normalized.contact_name, 'Dr. Maya Chen');
  assert.equal(normalized.phone, '+1 555 0100');
});

test('requires a valid campaign day', () => {
  assert.equal(
    validateDemoBooking({ ...validBooking(), preferred_date: '2026-08-14' }),
    'Please choose a booking day.',
  );
});

test('requires a phone or WhatsApp number', () => {
  assert.equal(
    validateDemoBooking({ ...validBooking(), phone: '123' }),
    'Please enter a valid phone or WhatsApp number.',
  );
});

test('offers five campaign days and sixteen half-hour appointments each day', () => {
  assert.deepEqual(DEMO_BOOKING_DAYS.map((day) => day.date), [
    '2026-08-09', '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13',
  ]);
  assert.equal(DEMO_BOOKING_TIMES.length, 16);
  assert.equal(DEMO_BOOKING_TIMES[0], '10:00');
  assert.equal(DEMO_BOOKING_TIMES.at(-1), '17:30');
  assert.equal(formatDemoBookingTime('17:30'), '5:30 PM');
});

test('rejects times outside the fixed half-hour calendar', () => {
  assert.equal(
    validateDemoBooking({ ...validBooking(), preferred_time: '18:00' }),
    'Please choose an available time slot.',
  );
});
