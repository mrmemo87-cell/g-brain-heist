export const DEMO_INTEREST_OPTIONS = [
    { value: 'admissions', label: 'Admission tests: English, Maths & Science' },
    { value: 'writing_ai', label: 'AI-supported writing assessment' },
    { value: 'teacher_assignments', label: 'Auto-checked teacher assignments' },
    { value: 'analytics', label: 'Student strengths & weakness analytics' },
    { value: 'cambridge', label: 'Cambridge assessment support' },
    { value: 'ielts', label: 'IELTS preparation & exam readiness' },
    { value: 'class_activities', label: 'Engaging in-class group activities' },
];
export const DEMO_BOOKING_TIMES = [
    '10:00', '10:30', '11:00', '11:30',
    '12:00', '12:30', '13:00', '13:30',
    '14:00', '14:30', '15:00', '15:30',
    '16:00', '16:30', '17:00', '17:30',
];
export const DEMO_BOOKING_TIME_ZONE = 'Asia/Bishkek';
const DEMO_BOOKING_UTC_OFFSET_HOURS = 6;
const DEMO_BOOKING_FIRST_SUNDAY_UTC = Date.UTC(2026, 7, 16);
const DEMO_BOOKING_DAY_MS = 24 * 60 * 60 * 1000;
const DEMO_BOOKING_WEEKDAYS = [
    { weekday: 'Sunday', shortDay: 'SUN' },
    { weekday: 'Monday', shortDay: 'MON' },
    { weekday: 'Tuesday', shortDay: 'TUE' },
    { weekday: 'Wednesday', shortDay: 'WED' },
    { weekday: 'Thursday', shortDay: 'THU' },
];
const resolveDemoBookingClient = async (client) => {
    if (client)
        return client;
    const { supabase } = await import('./supabaseClient.js');
    return supabase;
};
export const formatDemoBookingTime = (time) => {
    const [hours, minutes] = time.split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes))
        return time;
    const suffix = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 || 12;
    return `${displayHour}:${String(minutes).padStart(2, '0')} ${suffix}`;
};
const bookingDateFromUtc = (instant) => {
    const date = new Date(instant);
    return [
        date.getUTCFullYear(),
        String(date.getUTCMonth() + 1).padStart(2, '0'),
        String(date.getUTCDate()).padStart(2, '0'),
    ].join('-');
};
export const getDemoBookingDays = (now = Date.now()) => {
    const nowMs = now instanceof Date ? now.getTime() : now;
    const bishkekNow = new Date(nowMs + (DEMO_BOOKING_UTC_OFFSET_HOURS * 60 * 60 * 1000));
    const localDateUtc = Date.UTC(bishkekNow.getUTCFullYear(), bishkekNow.getUTCMonth(), bishkekNow.getUTCDate());
    let sundayUtc = localDateUtc - (bishkekNow.getUTCDay() * DEMO_BOOKING_DAY_MS);
    const thursdayLastSlotUtc = sundayUtc
        + (4 * DEMO_BOOKING_DAY_MS)
        + ((17 * 60 + 30) * 60 * 1000);
    const bishkekClockUtc = nowMs + (DEMO_BOOKING_UTC_OFFSET_HOURS * 60 * 60 * 1000);
    if (bishkekClockUtc >= thursdayLastSlotUtc)
        sundayUtc += 7 * DEMO_BOOKING_DAY_MS;
    sundayUtc = Math.max(sundayUtc, DEMO_BOOKING_FIRST_SUNDAY_UTC);
    return DEMO_BOOKING_WEEKDAYS.map((day, index) => {
        const date = bookingDateFromUtc(sundayUtc + (index * DEMO_BOOKING_DAY_MS));
        return {
            date,
            weekday: day.weekday,
            shortDay: day.shortDay,
            dayNumber: date.slice(-2),
        };
    });
};
export const getDemoBookingSlotInstant = (bookingDate, bookingTime) => {
    const [year, month, day] = bookingDate.split('-').map(Number);
    const [hours, minutes] = bookingTime.split(':').map(Number);
    if (![year, month, day, hours, minutes].every(Number.isFinite))
        return new Date(Number.NaN);
    return new Date(Date.UTC(year, month - 1, day, hours - DEMO_BOOKING_UTC_OFFSET_HOURS, minutes));
};
const supportedTimeZone = (timeZone) => {
    try {
        new Intl.DateTimeFormat('en', { timeZone }).format();
        return timeZone;
    }
    catch {
        return 'UTC';
    }
};
export const detectDemoBookingTimeZone = () => {
    try {
        return supportedTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    }
    catch {
        return 'UTC';
    }
};
export const getDemoBookingLocalDate = (bookingDate, bookingTime, timeZone) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: supportedTimeZone(timeZone),
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(getDemoBookingSlotInstant(bookingDate, bookingTime));
    const read = (type) => parts.find((part) => part.type === type)?.value ?? '';
    return `${read('year')}-${read('month')}-${read('day')}`;
};
export const formatDemoBookingLocalTime = (bookingDate, bookingTime, timeZone) => new Intl.DateTimeFormat('en', {
    timeZone: supportedTimeZone(timeZone),
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
}).format(getDemoBookingSlotInstant(bookingDate, bookingTime));
export const formatDemoBookingLocalDateTime = (bookingDate, bookingTime, timeZone) => new Intl.DateTimeFormat('en', {
    timeZone: supportedTimeZone(timeZone),
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
}).format(getDemoBookingSlotInstant(bookingDate, bookingTime));
export const isDemoBookingSlotPast = (bookingDate, bookingTime, now = Date.now()) => {
    const instant = getDemoBookingSlotInstant(bookingDate, bookingTime).getTime();
    const comparison = now instanceof Date ? now.getTime() : now;
    return !Number.isFinite(instant) || instant <= comparison;
};
export const normalizeDemoBooking = (input) => ({
    ...input,
    school_name: input.school_name.trim(),
    contact_name: input.contact_name.trim(),
    phone: input.phone.trim(),
    country: input.country.trim(),
    city: input.city.trim(),
    street_address: input.street_address.trim(),
    preferred_date: input.preferred_date.trim(),
    preferred_time: input.preferred_time.trim(),
    timezone: supportedTimeZone(input.timezone.trim() || 'UTC'),
    website: input.website.trim(),
});
export const validateDemoBooking = (input, now = Date.now()) => {
    if (input.school_name.trim().length < 2)
        return 'Please enter the school name.';
    if (input.contact_name.trim().length < 2)
        return 'Please enter your full name.';
    if (input.phone.trim().length < 6)
        return 'Please enter a valid phone or WhatsApp number.';
    if (input.country.trim().length < 2)
        return 'Please choose the school country.';
    if (input.city.trim().length < 2)
        return 'Please enter the school city.';
    if (input.street_address.trim().length < 2)
        return 'Please enter the school street or address.';
    if (!getDemoBookingDays(now).some((day) => day.date === input.preferred_date))
        return 'Please choose a booking day.';
    if (!DEMO_BOOKING_TIMES.some((time) => time === input.preferred_time))
        return 'Please choose an available time slot.';
    return null;
};
const readDemoBookingErrorMessage = (error) => {
    if (error instanceof Error)
        return error.message.trim();
    if (typeof error === 'string')
        return error.trim();
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
        return error.message.trim();
    }
    return '';
};
export const friendlyDemoBookingError = (error, fallback = 'We could not complete the booking. Please check all required details and try again.') => {
    const message = readDemoBookingErrorMessage(error);
    const normalized = message.toLowerCase();
    if (/typecheck|type check|type mismatch|invalid input syntax|cannot cast|22p02|pgrst/.test(normalized)) {
        return 'Some booking details could not be read. Please check the school name, country, city, street address, phone number, and selected time, then try again.';
    }
    if (/failed to fetch|network|load failed|connection|offline|timeout|timed out/.test(normalized)) {
        return 'We could not reach the live booking calendar. Please check your internet connection and try again.';
    }
    if (/permission denied|row-level security|schema cache|function .* does not exist|42501/.test(normalized)) {
        return 'The booking service is temporarily unavailable. Please wait a moment and try again.';
    }
    if (/please (enter|choose)|already passed|just taken|time slot|booking response was incomplete|calendar is temporarily unavailable/.test(normalized)) {
        return message;
    }
    return fallback;
};
export const listDemoBookingSlots = async (client) => {
    const bookingClient = await resolveDemoBookingClient(client);
    const { data, error } = await bookingClient.rpc('rpc_list_demo_booking_slots');
    if (error)
        throw new Error(friendlyDemoBookingError(error, 'The calendar is temporarily unavailable. Please try again.'));
    return (data ?? []);
};
export const submitDemoBooking = async (input, client) => {
    const normalized = normalizeDemoBooking(input);
    const validationError = validateDemoBooking(normalized);
    if (validationError)
        throw new Error(validationError);
    const bookingClient = await resolveDemoBookingClient(client);
    const { data, error } = await bookingClient.rpc('rpc_create_demo_booking', { p_booking: normalized });
    if (error)
        throw new Error(friendlyDemoBookingError(error));
    if (typeof data !== 'string')
        throw new Error('The booking response was incomplete. Please try again.');
    return data;
};
export const checkDemoBookingAvailability = async (bookingDate, bookingTime, client) => {
    const bookingClient = await resolveDemoBookingClient(client);
    const { data, error } = await bookingClient.rpc('rpc_check_demo_booking_slot', {
        p_booking_date: bookingDate,
        p_booking_time: bookingTime,
    });
    if (error)
        throw new Error(friendlyDemoBookingError(error, 'We could not verify that appointment time. Please try again.'));
    return data === true;
};
export const listDemoBookings = async (client) => {
    const bookingClient = await resolveDemoBookingClient(client);
    const { data, error } = await bookingClient
        .from('demo_bookings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
    if (error)
        throw new Error(error.message || 'Could not load booked appointments.');
    return (data ?? []);
};
export const updateDemoBooking = async (id, update, client) => {
    const bookingClient = await resolveDemoBookingClient(client);
    const { data, error } = await bookingClient
        .from('demo_bookings')
        .update({
        status: update.status,
        admin_notes: update.admin_notes?.trim() || null,
        updated_at: new Date().toISOString(),
    })
        .eq('id', id)
        .select('*')
        .single();
    if (error)
        throw new Error(error.message || 'Could not update the appointment.');
    return data;
};
