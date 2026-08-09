import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEMO_BOOKING_DAYS,
  DEMO_BOOKING_TIMES,
  checkDemoBookingAvailability,
  formatDemoBookingTime,
  formatDemoBookingLocalTime,
  getDemoBookingLocalDate,
  isDemoBookingSlotPast,
  normalizeDemoBooking,
  validateDemoBooking,
  type DemoBookingInput,
} from '../services/demoBookingService.js';

const validBooking = (): DemoBookingInput => ({
  school_name: 'Northbridge International School',
  contact_name: 'Dr. Maya Chen',
  phone: '+1 555 0100',
  country: 'United States',
  city: 'New York',
  street_address: '15 Learning Avenue',
  preferred_date: '2026-08-10',
  preferred_time: '10:00',
  timezone: 'America/New_York',
  website: '',
});

test('normalizes a demo booking before submission', () => {
  const normalized = normalizeDemoBooking({
    ...validBooking(),
    school_name: '  Northbridge International School  ',
    contact_name: '  Dr. Maya Chen  ',
    phone: '  +1 555 0100  ',
    country: '  United States  ',
    city: '  New York  ',
    street_address: '  15 Learning Avenue  ',
  });

  assert.equal(normalized.school_name, 'Northbridge International School');
  assert.equal(normalized.contact_name, 'Dr. Maya Chen');
  assert.equal(normalized.phone, '+1 555 0100');
  assert.equal(normalized.country, 'United States');
  assert.equal(normalized.city, 'New York');
  assert.equal(normalized.street_address, '15 Learning Avenue');
});

test('requires the school and its location', () => {
  assert.equal(validateDemoBooking({ ...validBooking(), school_name: '' }), 'Please enter the school name.');
  assert.equal(validateDemoBooking({ ...validBooking(), country: '' }), 'Please choose the school country.');
  assert.equal(validateDemoBooking({ ...validBooking(), city: '' }), 'Please enter the school city.');
  assert.equal(validateDemoBooking({ ...validBooking(), street_address: '' }), 'Please enter the school street or address.');
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

test('converts canonical Bishkek slots into the visitor local timezone', () => {
  assert.equal(getDemoBookingLocalDate('2026-08-10', '10:00', 'Pacific/Honolulu'), '2026-08-09');
  assert.equal(formatDemoBookingLocalTime('2026-08-10', '10:00', 'America/New_York'), '12:00 AM');
});

test('marks a slot taken once its canonical appointment instant has passed', () => {
  assert.equal(isDemoBookingSlotPast('2026-08-10', '10:00', Date.parse('2026-08-10T03:59:00Z')), false);
  assert.equal(isDemoBookingSlotPast('2026-08-10', '10:00', Date.parse('2026-08-10T04:00:00Z')), true);
});

test('checks live database availability before booking', async () => {
  const calls: Array<{ name: string; args: unknown }> = [];
  const client = {
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { data: true, error: null };
    },
    from: () => { throw new Error('not used'); },
  };

  assert.equal(await checkDemoBookingAvailability('2026-08-10', '10:00', client as never), true);
  assert.deepEqual(calls, [{
    name: 'rpc_check_demo_booking_slot',
    args: { p_booking_date: '2026-08-10', p_booking_time: '10:00' },
  }]);
});
