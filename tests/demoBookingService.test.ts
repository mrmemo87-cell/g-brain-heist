import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  DEMO_BOOKING_DAYS,
  DEMO_BOOKING_TIMES,
  checkDemoBookingAvailability,
  friendlyDemoBookingError,
  formatDemoBookingTime,
  formatDemoBookingLocalTime,
  getDemoBookingLocalDate,
  isDemoBookingSlotPast,
  normalizeDemoBooking,
  validateDemoBooking,
  type DemoBookingInput,
} from '../services/demoBookingService.js';

const bookedDemoPage = readFileSync('src/pages/BookedDemoPage.tsx', 'utf8');
const bookedDemoStyles = readFileSync('src/pages/BookedDemoPage.css', 'utf8');
const demoBookingServiceSource = readFileSync('services/demoBookingService.ts', 'utf8');
const bookedEntry = readFileSync('booked.tsx', 'utf8');
const bookedHtml = readFileSync('booked.html', 'utf8');
const vercelConfig = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
  rewrites: Array<{ source: string; destination: string }>;
};
const viteConfig = readFileSync('vite.config.ts', 'utf8');

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

test('replaces technical booking errors with instructions the visitor can act on', () => {
  assert.equal(
    friendlyDemoBookingError(new Error('typecheck error: invalid input syntax for type date')),
    'Some booking details could not be read. Please check the school name, country, city, street address, phone number, and selected time, then try again.',
  );
  assert.equal(
    friendlyDemoBookingError(new Error('TypeError: Failed to fetch')),
    'We could not reach the live booking calendar. Please check your internet connection and try again.',
  );
});

test('preserves specific booking validation guidance and hides unknown backend details', () => {
  assert.equal(friendlyDemoBookingError(new Error('Please enter the school name.')), 'Please enter the school name.');
  assert.equal(
    friendlyDemoBookingError(new Error('internal database implementation detail')),
    'We could not complete the booking. Please check all required details and try again.',
  );
});

test('keeps the booking dialog viewport-centered and dismissible only through OK', () => {
  assert.match(bookedDemoStyles, /\.booked-slot-check \{ position: fixed; z-index: 1000; inset: 0;[\s\S]*place-items: center;/);
  assert.match(bookedDemoPage, /role="dialog" aria-modal="true"/);
  assert.match(bookedDemoPage, /event\.key === 'Escape'[\s\S]*event\.preventDefault\(\)/);
  assert.match(bookedDemoPage, /className="booked-dialog-ok"[\s\S]*onClick=\{acknowledgeBookingDialog\}>OK<\/button>/);
  assert.doesNotMatch(bookedDemoPage, /booked-slot-check[^\n]*onClick=/);
});

test('serves the public booking page from its own lightweight entry', () => {
  assert.match(bookedEntry, /import BookedDemoPage from '.\/src\/pages\/BookedDemoPage'/);
  assert.doesNotMatch(bookedEntry, /App|RouterProvider|authService/);
  assert.match(viteConfig, /booked: path\.resolve\(__dirname, 'booked\.html'\)/);
  assert.deepEqual(
    vercelConfig.rewrites.find((rewrite) => rewrite.source === '/booked'),
    { source: '/booked', destination: '/booked.html' },
  );
  assert.match(bookedHtml, /family=IBM\+Plex\+Sans[^"']*&display=swap/);
  assert.match(bookedHtml, /See how every learner becomes visible\./);
});

test('keeps non-critical booking media off the initial loading path', () => {
  assert.match(bookedDemoPage, /assessment\.webp[^>]*loading="lazy"[^>]*decoding="async"/);
  assert.match(bookedDemoPage, /writing\.webp[^>]*loading="lazy"[^>]*decoding="async"/);
  assert.match(bookedDemoPage, /ielts\.webp[^>]*loading="lazy"[^>]*decoding="async"/);
  assert.match(bookedDemoPage, /classroom\.webp[^>]*loading="lazy"[^>]*decoding="async"/);
  assert.match(bookedDemoPage, /new IntersectionObserver[\s\S]*rootMargin: '600px 0px'/);
  assert.doesNotMatch(bookedDemoPage, /lottie-react|fflate|SLOT_CHECK_ANIMATION_URL/);
  assert.match(demoBookingServiceSource, /await import\('\.\/supabaseClient\.js'\)/);
  assert.doesNotMatch(demoBookingServiceSource, /^import \{ supabase \}/m);
});
