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

export type DemoInterest = (typeof DEMO_INTEREST_OPTIONS)[number]['value'];
export type DemoBookingStatus = 'new' | 'contacted' | 'confirmed' | 'completed' | 'cancelled';
export type DemoMeetingFormat = 'online' | 'in_person' | 'either';

export interface DemoBookingInput {
  school_name: string;
  contact_name: string;
  email: string;
  phone: string;
  role_title: string;
  country: string;
  school_size: string;
  preferred_format: DemoMeetingFormat;
  preferred_date: string;
  preferred_time: string;
  timezone: string;
  interests: DemoInterest[];
  message: string;
  consent: boolean;
  website: string;
}

export interface DemoBookingRecord extends Omit<DemoBookingInput, 'consent' | 'website' | 'phone' | 'school_size' | 'message'> {
  id: string;
  status: DemoBookingStatus;
  admin_notes: string | null;
  source: string;
  created_at: string;
  updated_at: string;
  phone: string | null;
  school_size: string | null;
  message: string | null;
}

type DemoBookingClient = Pick<typeof supabase, 'rpc' | 'from'>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeDemoBooking = (input: DemoBookingInput): DemoBookingInput => ({
  ...input,
  school_name: input.school_name.trim(),
  contact_name: input.contact_name.trim(),
  email: input.email.trim().toLowerCase(),
  phone: input.phone.trim(),
  role_title: input.role_title.trim(),
  country: input.country.trim(),
  school_size: input.school_size.trim(),
  preferred_time: input.preferred_time.trim(),
  timezone: input.timezone.trim(),
  interests: [...new Set(input.interests)],
  message: input.message.trim(),
  website: input.website.trim(),
});

export const validateDemoBooking = (input: DemoBookingInput): string | null => {
  if (input.school_name.trim().length < 2) return 'Please enter the school name.';
  if (input.contact_name.trim().length < 2) return 'Please enter your full name.';
  if (!EMAIL_PATTERN.test(input.email.trim())) return 'Please enter a valid work email.';
  if (input.role_title.trim().length < 2) return 'Please enter your role at the school.';
  if (input.country.trim().length < 2) return 'Please enter your country.';
  if (!input.preferred_date) return 'Please choose a preferred date.';
  if (input.preferred_date < new Date().toISOString().slice(0, 10)) return 'Please choose today or a future date.';
  if (!input.preferred_time.trim()) return 'Please choose a preferred time.';
  if (!input.timezone.trim()) return 'Please provide your timezone.';
  if (input.interests.length === 0) return 'Please select at least one area to explore.';
  if (!input.consent) return 'Please allow our team to contact you about the demo.';
  return null;
};

export const submitDemoBooking = async (
  input: DemoBookingInput,
  client: DemoBookingClient = supabase,
): Promise<string> => {
  const normalized = normalizeDemoBooking(input);
  const validationError = validateDemoBooking(normalized);
  if (validationError) throw new Error(validationError);

  const { data, error } = await client.rpc('rpc_create_demo_booking', { p_booking: normalized });
  if (error) throw new Error(error.message || 'We could not submit your booking request.');
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
