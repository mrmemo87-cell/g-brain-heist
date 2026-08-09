import { supabase } from './supabaseClient.js';

export const DEMO_INTEREST_OPTIONS = [
  { value: 'admissions', label: 'Admission tests: English, Maths & Science' },
  { value: 'writing_ai', label: 'AI-supported writing assessment' },
  { value: 'teacher_assignments', label: 'Auto-checked teacher assignments' },
  { value: 'analytics', label: 'Student strengths & weakness analytics' },
  { value: 'cambridge', label: 'Cambridge assessment support' },
  { value: 'ielts', label: 'IELTS preparation & exam readiness' },
  { value: 'class_activities', label: 'Engaging in-class group activities' },
] as const;

export const DEMO_BOOKING_DAYS = [
  { date: '2026-08-09', weekday: 'Sunday', shortDay: 'SUN', dayNumber: '09' },
  { date: '2026-08-10', weekday: 'Monday', shortDay: 'MON', dayNumber: '10' },
  { date: '2026-08-11', weekday: 'Tuesday', shortDay: 'TUE', dayNumber: '11' },
  { date: '2026-08-12', weekday: 'Wednesday', shortDay: 'WED', dayNumber: '12' },
  { date: '2026-08-13', weekday: 'Thursday', shortDay: 'THU', dayNumber: '13' },
] as const;

export const DEMO_BOOKING_TIMES = [
  '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30',
] as const;

export type DemoInterest = (typeof DEMO_INTEREST_OPTIONS)[number]['value'];
export type DemoBookingDate = (typeof DEMO_BOOKING_DAYS)[number]['date'];
export type DemoBookingTime = (typeof DEMO_BOOKING_TIMES)[number];
export type DemoBookingStatus = 'new' | 'contacted' | 'confirmed' | 'completed' | 'cancelled';
export type DemoMeetingFormat = 'online' | 'in_person' | 'either';

export interface DemoBookingInput {
  contact_name: string;
  phone: string;
  preferred_date: string;
  preferred_time: string;
  website: string;
}

export interface DemoBookingSlot {
  booking_date: string;
  booking_time: string;
  is_taken: boolean;
}

interface DemoBookingSlotRow {
  booking_date: string;
  booking_time: string;
  is_blocked: boolean;
  booking_id: string | null;
}

export interface DemoBookingRecord {
  id: string;
  school_name: string | null;
  contact_name: string;
  email: string | null;
  phone: string | null;
  role_title: string | null;
  country: string | null;
  school_size: string | null;
  preferred_format: DemoMeetingFormat | null;
  preferred_date: string;
  preferred_time: string;
  timezone: string | null;
  interests: DemoInterest[] | null;
  message: string | null;
  status: DemoBookingStatus;
  admin_notes: string | null;
  source: string;
  created_at: string;
  updated_at: string;
}

type DemoBookingClient = Pick<typeof supabase, 'rpc' | 'from'>;

export const formatDemoBookingTime = (time: string): string => {
  const [hours, minutes] = time.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return time;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${String(minutes).padStart(2, '0')} ${suffix}`;
};

export const normalizeDemoBooking = (input: DemoBookingInput): DemoBookingInput => ({
  ...input,
  contact_name: input.contact_name.trim(),
  phone: input.phone.trim(),
  preferred_date: input.preferred_date.trim(),
  preferred_time: input.preferred_time.trim(),
  website: input.website.trim(),
});

export const validateDemoBooking = (input: DemoBookingInput): string | null => {
  if (input.contact_name.trim().length < 2) return 'Please enter your full name.';
  if (input.phone.trim().length < 6) return 'Please enter a valid phone or WhatsApp number.';
  if (!DEMO_BOOKING_DAYS.some((day) => day.date === input.preferred_date)) return 'Please choose a booking day.';
  if (!DEMO_BOOKING_TIMES.some((time) => time === input.preferred_time)) return 'Please choose an available time slot.';
  return null;
};

export const listDemoBookingSlots = async (
  client: DemoBookingClient = supabase,
): Promise<DemoBookingSlot[]> => {
  const { data, error } = await client
    .from('demo_booking_slots')
    .select('booking_date, booking_time, is_blocked, booking_id')
    .order('booking_date', { ascending: true })
    .order('booking_time', { ascending: true });

  if (error) throw new Error(error.message || 'Could not load the booking calendar.');
  return ((data ?? []) as DemoBookingSlotRow[]).map((slot) => ({
    booking_date: slot.booking_date,
    booking_time: slot.booking_time,
    is_taken: Boolean(slot.is_blocked || slot.booking_id),
  }));
};

export const submitDemoBooking = async (
  input: DemoBookingInput,
  client: DemoBookingClient = supabase,
): Promise<string> => {
  const normalized = normalizeDemoBooking(input);
  const validationError = validateDemoBooking(normalized);
  if (validationError) throw new Error(validationError);

  const { data, error } = await client.rpc('rpc_create_demo_booking', { p_booking: normalized });
  if (error) throw new Error(error.message || 'We could not secure that appointment.');
  if (typeof data !== 'string') throw new Error('The booking response was incomplete. Please try again.');
  return data;
};

export const listDemoBookings = async (
  client: DemoBookingClient = supabase,
): Promise<DemoBookingRecord[]> => {
  const { data, error } = await client
    .from('demo_bookings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message || 'Could not load booked appointments.');
  return (data ?? []) as DemoBookingRecord[];
};

export const updateDemoBooking = async (
  id: string,
  update: Pick<DemoBookingRecord, 'status' | 'admin_notes'>,
  client: DemoBookingClient = supabase,
): Promise<DemoBookingRecord> => {
  const { data, error } = await client
    .from('demo_bookings')
    .update({
      status: update.status,
      admin_notes: update.admin_notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message || 'Could not update the appointment.');
  return data as DemoBookingRecord;
};
