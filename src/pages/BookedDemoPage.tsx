import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { strFromU8, unzipSync } from 'fflate';
import Lottie from 'lottie-react';
import {
  DEMO_BOOKING_DAYS,
  DEMO_BOOKING_TIMES,
  checkDemoBookingAvailability,
  detectDemoBookingTimeZone,
  formatDemoBookingLocalDateTime,
  formatDemoBookingLocalTime,
  getDemoBookingLocalDate,
  getDemoBookingSlotInstant,
  isDemoBookingSlotPast,
  listDemoBookingSlots,
  submitDemoBooking,
  type DemoBookingInput,
  type DemoBookingSlot,
} from '../../services/demoBookingService';
import { DEMO_CITY_SUGGESTIONS, getDemoCountryOptions } from '../data/demoBookingLocations';
import './BookedDemoPage.css';

const SLOT_CHECK_ANIMATION_URL = 'https://sozodkxwhubespiedgxm.supabase.co/storage/v1/object/public/lotties/Eye%20scanning%20logo%20Lottie%20JSON%20animation.lottie';

interface LocalBookingSlot {
  bookingDate: string;
  bookingTime: string;
  localDate: string;
  localTime: string;
}

interface LocalBookingDay {
  date: string;
  weekday: string;
  shortDay: string;
  dayNumber: string;
  monthYear: string;
  slots: LocalBookingSlot[];
}

const buildLocalBookingDays = (timeZone: string): LocalBookingDay[] => {
  const grouped = new Map<string, LocalBookingDay>();
  for (const day of DEMO_BOOKING_DAYS) {
    for (const time of DEMO_BOOKING_TIMES) {
      const instant = getDemoBookingSlotInstant(day.date, time);
      const localDate = getDemoBookingLocalDate(day.date, time, timeZone);
      const parts = new Intl.DateTimeFormat('en', {
        timeZone,
        weekday: 'long',
        month: 'long',
        year: 'numeric',
        day: '2-digit',
      }).formatToParts(instant);
      const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
      const current = grouped.get(localDate) ?? {
        date: localDate,
        weekday: read('weekday'),
        shortDay: read('weekday').slice(0, 3).toUpperCase(),
        dayNumber: read('day'),
        monthYear: `${read('month')} ${read('year')}`.toUpperCase(),
        slots: [],
      };
      current.slots.push({
        bookingDate: day.date,
        bookingTime: time,
        localDate,
        localTime: formatDemoBookingLocalTime(day.date, time, timeZone),
      });
      grouped.set(localDate, current);
    }
  }
  return [...grouped.values()].sort((left, right) => left.date.localeCompare(right.date));
};

const initialBooking = (timeZone: string): DemoBookingInput => ({
  school_name: '',
  contact_name: '',
  phone: '',
  country: '',
  city: '',
  street_address: '',
  preferred_date: DEMO_BOOKING_DAYS[0].date,
  preferred_time: '',
  timezone: timeZone,
  website: '',
});

const BookedDemoPage: React.FC = () => {
  const viewerTimeZone = useMemo(detectDemoBookingTimeZone, []);
  const countryOptions = useMemo(() => getDemoCountryOptions(), []);
  const localDays = useMemo(() => buildLocalBookingDays(viewerTimeZone), [viewerTimeZone]);
  const [booking, setBooking] = useState<DemoBookingInput>(() => initialBooking(viewerTimeZone));
  const [submissionPhase, setSubmissionPhase] = useState<'idle' | 'checking' | 'booking'>('idle');
  const [error, setError] = useState('');
  const [bookingId, setBookingId] = useState('');
  const [slots, setSlots] = useState<DemoBookingSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [slotsError, setSlotsError] = useState('');
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [flipSequence, setFlipSequence] = useState(0);
  const [flipDirection, setFlipDirection] = useState<'next' | 'previous'>('next');
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [autoSelectedDay, setAutoSelectedDay] = useState(false);
  const [slotCheckAnimation, setSlotCheckAnimation] = useState<Record<string, unknown> | null>(null);

  const submitting = submissionPhase !== 'idle';
  const selectedDay = localDays[selectedDayIndex] ?? localDays[0];
  const citySuggestions = DEMO_CITY_SUGGESTIONS[booking.country] ?? [];
  const takenSlots = useMemo(
    () => new Set(slots.filter((slot) => slot.is_taken).map((slot) => `${slot.booking_date}:${slot.booking_time}`)),
    [slots],
  );
  const slotIsTaken = (slot: LocalBookingSlot) => (
    takenSlots.has(`${slot.bookingDate}:${slot.bookingTime}`)
    || isDemoBookingSlotPast(slot.bookingDate, slot.bookingTime, clockNow)
  );
  const availableCount = selectedDay.slots.filter((slot) => !slotIsTaken(slot)).length;

  const loadAvailability = useCallback(async () => {
    setSlotsLoading(true);
    setSlotsError('');
    try {
      setSlots(await listDemoBookingSlots());
    } catch (availabilityError) {
      setSlotsError(availabilityError instanceof Error ? availabilityError.message : 'The calendar is temporarily unavailable.');
    } finally {
      setSlotsLoading(false);
    }
  }, []);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Book a Brains Heist School Demo';
    return () => { document.title = previousTitle; };
  }, []);

  useEffect(() => { void loadAvailability(); }, [loadAvailability]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    void fetch(SLOT_CHECK_ANIMATION_URL)
      .then(async (response) => {
        if (!response.ok) throw new Error('Animation unavailable');
        const archive = unzipSync(new Uint8Array(await response.arrayBuffer()));
        const animationPath = Object.keys(archive).find((path) => path.startsWith('animations/') && path.endsWith('.json'));
        if (!animationPath) throw new Error('Animation data missing');
        return JSON.parse(strFromU8(archive[animationPath])) as Record<string, unknown>;
      })
      .then((animation) => { if (active) setSlotCheckAnimation(animation); })
      .catch(() => { /* The CSS scanner remains as a graceful fallback. */ });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (slotsLoading || autoSelectedDay) return;
    const firstAvailableDay = localDays.findIndex((day) => day.slots.some((slot) => !slotIsTaken(slot)));
    if (firstAvailableDay > 0) setSelectedDayIndex(firstAvailableDay);
    setAutoSelectedDay(true);
  }, [autoSelectedDay, clockNow, localDays, slotsLoading, takenSlots]);

  const setField = <K extends keyof DemoBookingInput>(field: K, value: DemoBookingInput[K]) => {
    setBooking((current) => ({ ...current, [field]: value }));
  };

  const selectDay = (index: number) => {
    if (index === selectedDayIndex) return;
    setFlipDirection(index > selectedDayIndex ? 'next' : 'previous');
    setSelectedDayIndex(index);
    setFlipSequence((current) => current + 1);
    setField('preferred_date', localDays[index]?.slots[0]?.bookingDate ?? '');
    setField('preferred_time', '');
    setError('');
  };

  const selectSlot = (slot: LocalBookingSlot) => {
    setBooking((current) => ({
      ...current,
      preferred_date: slot.bookingDate,
      preferred_time: slot.bookingTime,
      timezone: viewerTimeZone,
    }));
    setError('');
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (isDemoBookingSlotPast(booking.preferred_date, booking.preferred_time)) {
      setError('That time has already passed. Please choose another available slot.');
      void loadAvailability();
      return;
    }
    setSubmissionPhase('checking');
    try {
      const [isAvailable] = await Promise.all([
        checkDemoBookingAvailability(booking.preferred_date, booking.preferred_time),
        new Promise<void>((resolve) => window.setTimeout(resolve, 900)),
      ]);
      if (!isAvailable) throw new Error('That time slot was just taken or has already passed. Please choose another one.');
      setSubmissionPhase('booking');
      const id = await submitDemoBooking(booking);
      setBookingId(id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'We could not submit your request. Please try again.');
      void loadAvailability();
    } finally {
      setSubmissionPhase('idle');
    }
  };

  if (bookingId) {
    return (
      <main className="booked-page booked-success-page">
        <div className="booked-orb booked-orb-one" />
        <div className="booked-orb booked-orb-two" />
        <section className="booked-success-card" aria-live="polite">
          <a className="booked-brand" href="/" aria-label="Brains Heist home">
            <img src="/logo.png" alt="" />
            <span><strong>BRAINS</strong> HEIST</span>
          </a>
          <div className="booked-success-mark" aria-hidden="true">✓</div>
          <p className="booked-eyebrow">REQUEST SECURED</p>
          <h1>Your school demo is on our radar.</h1>
          <p>
            Your 30-minute Brains Heist demonstration is reserved. We’ll contact you on the number provided if we need anything before the session.
          </p>
          <div className="booked-success-appointment">
            <span>Your local appointment time</span>
            <strong>{formatDemoBookingLocalDateTime(booking.preferred_date, booking.preferred_time, viewerTimeZone)}</strong>
            <small>{viewerTimeZone.replaceAll('_', ' ')} · School: {booking.school_name}</small>
          </div>
          <div className="booked-reference">
            <span>Booking reference</span>
            <strong>BH-{bookingId.slice(0, 8).toUpperCase()}</strong>
          </div>
          <a className="booked-button booked-button-primary" href="/">Explore Brains Heist</a>
        </section>
      </main>
    );
  }

  return (
    <main className="booked-page">
      <div className="booked-grid" />
      <div className="booked-orb booked-orb-one" />
      <div className="booked-orb booked-orb-two" />

      <header className="booked-header">
        <a className="booked-brand" href="/" aria-label="Brains Heist home">
          <img src="/logo.png" alt="" />
          <span><strong>BRAINS</strong> HEIST</span>
        </a>
        <a className="booked-header-link" href="#book-demo">Book your school demo <span aria-hidden="true">↗</span></a>
      </header>

      <section className="booked-hero">
        <div className="booked-hero-copy">
          <p className="booked-eyebrow"><span /> BUILT FOR AMBITIOUS SCHOOLS</p>
          <h1>See how every learner becomes <em>visible.</em></h1>
          <p className="booked-hero-lead">
            Book a tailored demonstration of the school intelligence platform that turns assessment, writing, assignments and classroom engagement into focused action.
          </p>
          <div className="booked-hero-actions">
            <a className="booked-button booked-button-primary" href="#book-demo">Request your demonstration <span aria-hidden="true">→</span></a>
            <span className="booked-response-note"><b>Personal response</b> from our school partnerships team</span>
          </div>
          <div className="booked-proof-row" aria-label="Platform benefits">
            <div><strong>All grades</strong><span>Admission coverage</span></div>
            <div><strong>Instant</strong><span>Automated checking</span></div>
            <div><strong>One view</strong><span>Actionable analytics</span></div>
          </div>
        </div>

        <div className="booked-hero-visual" aria-label="Brains Heist school intelligence overview">
          <div className="booked-visual-glow" />
          <div className="booked-visual-card booked-visual-main">
            <div className="booked-visual-topline"><span>LEARNER SIGNAL</span><b>LIVE</b></div>
            <div className="booked-student-row">
              <div className="booked-avatar">AS</div>
              <div><strong>Individual progress</strong><span>English · Maths · Science</span></div>
              <div className="booked-score">+18%</div>
            </div>
            <div className="booked-chart" aria-hidden="true">
              <span style={{ height: '42%' }} /><span style={{ height: '58%' }} /><span style={{ height: '52%' }} />
              <span style={{ height: '76%' }} /><span style={{ height: '68%' }} /><span style={{ height: '91%' }} />
            </div>
            <div className="booked-insight"><span>AI INSIGHT</span><p>Target scientific vocabulary next. Writing structure is now a strength.</p></div>
          </div>
          <div className="booked-visual-card booked-visual-float booked-visual-float-one">
            <span className="booked-mini-icon">✓</span><div><strong>Auto-checked</strong><span>Results organized instantly</span></div>
          </div>
          <div className="booked-visual-card booked-visual-float booked-visual-float-two">
            <span className="booked-mini-icon booked-mini-pink">◎</span><div><strong>Teacher validated</strong><span>AI writing analysis</span></div>
          </div>
        </div>
      </section>

      <section className="booked-section booked-solutions" aria-labelledby="solutions-title">
        <div className="booked-section-heading">
          <p className="booked-eyebrow">ONE CONNECTED EXPERIENCE</p>
          <h2 id="solutions-title">Critical school challenges, solved with clarity.</h2>
          <p>Choose the areas most relevant to your school and we will shape the demonstration around your priorities.</p>
        </div>
        <div className="booked-feature-grid">
          <article className="booked-feature booked-feature-wide">
            <div className="booked-feature-copy">
              <span className="booked-feature-number">01</span>
              <p className="booked-feature-kicker">ADMISSIONS, ORGANIZED</p>
              <h3>English, Maths and Science tests for every grade.</h3>
              <p>Admission assessments are checked instantly and organized automatically—saving teams hours of marking and administration while giving decision-makers clear, consistent results.</p>
              <ul><li>All-grade assessment coverage</li><li>Instant auto-checking</li><li>Structured candidate results</li></ul>
            </div>
            <img src="/mission-console-images/cambridge-tests.webp" alt="Digital assessment and results visualization" />
          </article>

          <article className="booked-feature">
            <span className="booked-feature-number">02</span>
            <img src="/mission-console-images/writing.webp" alt="Writing analysis interface illustration" />
            <p className="booked-feature-kicker">AI + TEACHER JUDGEMENT</p>
            <h3>Writing insight teachers can trust.</h3>
            <p>Advanced writing tasks are analysed by AI, then validated by teachers—combining speed, consistency and professional judgement.</p>
          </article>

          <article className="booked-feature">
            <span className="booked-feature-number">03</span>
            <img src="/mission-console-images/ielts-prep.webp" alt="IELTS preparation and progress illustration" />
            <p className="booked-feature-kicker">GLOBAL READINESS</p>
            <h3>Cambridge and IELTS pathways.</h3>
            <p>Support exam readiness with structured practice, assessment workflows and progress visibility built for international education.</p>
          </article>

          <article className="booked-feature booked-feature-dark">
            <span className="booked-feature-number">04</span>
            <p className="booked-feature-kicker">FROM DATA TO ACTION</p>
            <h3>Know exactly where support is needed.</h3>
            <p>Teacher assignments are auto-checked and analysed alongside assessment data to reveal strengths and weaknesses—helping teachers focus precisely on the areas that will move each learner forward.</p>
            <div className="booked-signal-list"><span><i />Strength identified</span><span><i />Gap prioritized</span><span><i />Progress tracked</span></div>
          </article>

          <article className="booked-feature booked-feature-accent">
            <span className="booked-feature-number">05</span>
            <p className="booked-feature-kicker">VISIBLE PERSONAL ATTENTION</p>
            <h3>Meet parent expectations—and go beyond them.</h3>
            <p>Analytical records show the attention given to every individual, across subjects and skill areas, so progress conversations become specific, credible and genuinely impressive.</p>
          </article>

          <article className="booked-feature booked-feature-wide booked-feature-activity">
            <div className="booked-feature-copy">
              <span className="booked-feature-number">06</span>
              <p className="booked-feature-kicker">ENERGY IN THE CLASSROOM</p>
              <h3>Group activities students want to join.</h3>
              <p>Transform lesson participation with attractive, engaging in-class activities that encourage collaboration, healthy challenge and purposeful practice.</p>
            </div>
            <img src="/visuals/Teacher-invite-hero-visual.png" alt="Teachers and students connecting through classroom activities" />
          </article>
        </div>
      </section>

      <section className="booked-calendar-section" id="book-demo" aria-labelledby="book-demo-title">
        <div className="booked-calendar-heading">
          <p className="booked-eyebrow">PICK A MOMENT. WE’LL HANDLE THE REST.</p>
          <h2 id="book-demo-title">Your demo, booked in seconds.</h2>
          <p>Tell us who and where your school is, then choose an available 30-minute slot. Every time is automatically shown in your local timezone.</p>
        </div>

        <form className="booked-scheduler" onSubmit={handleSubmit} noValidate aria-busy={submitting}>
          <div className="booked-scheduler-topline">
            <span>LIVE AVAILABILITY</span>
            <div><i /> Updating in real time</div>
          </div>

          <div className="booked-identity-fields">
            <label className="booked-field">Your name<input required maxLength={120} autoComplete="name" value={booking.contact_name} onChange={(event) => setField('contact_name', event.target.value)} placeholder="Full name" /></label>
            <label className="booked-field">Phone / WhatsApp<input required maxLength={50} autoComplete="tel" inputMode="tel" value={booking.phone} onChange={(event) => setField('phone', event.target.value)} placeholder="+996 555 123 456" /></label>
            <label className="booked-field booked-field-wide">School name<input required maxLength={180} autoComplete="organization" value={booking.school_name} onChange={(event) => setField('school_name', event.target.value)} placeholder="Your school’s official name" /></label>
            <label className="booked-field">Country
              <select required autoComplete="country-name" value={booking.country} onChange={(event) => setBooking((current) => ({ ...current, country: event.target.value, city: '' }))}>
                <option value="">Choose country</option>
                {countryOptions.map((country) => <option key={country.code} value={country.name}>{country.name}</option>)}
              </select>
            </label>
            <label className="booked-field">City
              <input required list="booked-city-options" maxLength={120} autoComplete="address-level2" value={booking.city} onChange={(event) => setField('city', event.target.value)} placeholder={booking.country ? 'Choose or type the city' : 'Choose a country first'} />
              <datalist id="booked-city-options">{citySuggestions.map((city) => <option key={city} value={city} />)}</datalist>
            </label>
            <label className="booked-field booked-field-wide">Street / school address<input required maxLength={240} autoComplete="street-address" value={booking.street_address} onChange={(event) => setField('street_address', event.target.value)} placeholder="Street, building, district or campus address" /></label>
          </div>

          <div className="booked-day-strip" role="tablist" aria-label="Choose a demonstration day">
            {localDays.map((day, index) => {
              const dayAvailable = day.slots.filter((slot) => !slotIsTaken(slot)).length;
              return (
                <button key={day.date} type="button" role="tab" aria-selected={selectedDayIndex === index} onClick={() => selectDay(index)} className={selectedDayIndex === index ? 'active' : ''}>
                  <span>{day.shortDay}</span><strong>{day.dayNumber}</strong><small>{slotsLoading ? '···' : dayAvailable === 0 ? 'FULL' : `${dayAvailable} LEFT`}</small>
                </button>
              );
            })}
          </div>

          <div className="booked-calendar-stage">
            <button type="button" className="booked-calendar-arrow" onClick={() => selectDay(Math.max(0, selectedDayIndex - 1))} disabled={selectedDayIndex === 0} aria-label="Previous day">←</button>
            <div key={`${selectedDay.date}-${flipSequence}`} className={`booked-calendar-sheet flip-${flipDirection}`}>
              <div className="booked-calendar-rings" aria-hidden="true"><i /><i /><i /><i /><i /></div>
              <div className="booked-calendar-date">
                <div><span>{selectedDay.monthYear}</span><h3>{selectedDay.weekday}</h3></div>
                <strong>{selectedDay.dayNumber}</strong>
              </div>
              <div className="booked-availability-line">
                <span>{slotsLoading ? 'Checking calendar…' : availableCount === 0 ? 'Fully booked' : `${availableCount} times available`}</span>
                <small>30 min each</small>
              </div>
              {slotsError ? (
                <div className="booked-slots-error" role="alert"><p>{slotsError}</p><button type="button" onClick={() => void loadAvailability()}>Try again</button></div>
              ) : (
                <div className="booked-time-grid" role="group" aria-label={`Available times for ${selectedDay.weekday}`}>
                  {selectedDay.slots.map((slot) => {
                    const isTaken = slotsLoading || slotIsTaken(slot);
                    const isSelected = booking.preferred_date === slot.bookingDate && booking.preferred_time === slot.bookingTime;
                    return (
                      <button key={`${slot.bookingDate}:${slot.bookingTime}`} type="button" disabled={isTaken} aria-pressed={isSelected} onClick={() => selectSlot(slot)} className={`${isTaken ? 'taken' : 'available'} ${isSelected ? 'selected' : ''}`} title={isDemoBookingSlotPast(slot.bookingDate, slot.bookingTime, clockNow) ? 'This time has already passed' : undefined}>
                        <span>{slot.localTime}</span><small>{isTaken ? 'TAKEN' : isSelected ? 'SELECTED' : 'OPEN'}</small>
                      </button>
                    );
                  })}
                </div>
              )}
              {!slotsLoading && availableCount === 0 && <p className="booked-full-day-note">This day has no remaining times. Flip to another day to find an open slot.</p>}
            </div>
            <button type="button" className="booked-calendar-arrow" onClick={() => selectDay(Math.min(localDays.length - 1, selectedDayIndex + 1))} disabled={selectedDayIndex === localDays.length - 1} aria-label="Next day">→</button>
          </div>

          <label className="booked-honeypot" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={booking.website} onChange={(event) => setField('website', event.target.value)} /></label>
          <div className="booked-selection-summary">
            <div><span>YOUR SELECTION · LOCAL TIME</span><strong>{booking.preferred_time ? formatDemoBookingLocalDateTime(booking.preferred_date, booking.preferred_time, viewerTimeZone) : 'Choose an open time above'}</strong></div>
            <span className="booked-timezone-pill">{viewerTimeZone.replaceAll('_', ' ')}</span>
          </div>
          {error && <div className="booked-error" role="alert">{error}</div>}
          <button className="booked-submit" type="submit" disabled={submitting || slotsLoading || Boolean(slotsError) || !booking.preferred_time}>
            {submissionPhase === 'checking' ? 'Checking availability…' : submissionPhase === 'booking' ? 'Securing your demo…' : 'Book this demo'}<span aria-hidden="true">→</span>
          </button>
          <p className="booked-form-footnote">Your number is used only to coordinate this demonstration.</p>

          {submitting && (
            <div className="booked-slot-check" role="status" aria-live="polite">
              <div className="booked-slot-check-card">
                <div className="booked-slot-check-animation" aria-hidden="true">
                  {slotCheckAnimation ? <Lottie animationData={slotCheckAnimation} loop autoplay /> : <div className="booked-css-scanner"><i /><span /></div>}
                </div>
                <p>{submissionPhase === 'checking' ? 'ONE SEC!' : 'SLOT CONFIRMED'}</p>
                <h3>{submissionPhase === 'checking' ? 'Making sure this slot is still available…' : 'Securing your school demonstration…'}</h3>
                <small>Checking the live Brains Heist calendar</small>
              </div>
            </div>
          )}
        </form>
      </section>

      <footer className="booked-footer"><a className="booked-brand" href="/"><img src="/logo.png" alt="" /><span><strong>BRAINS</strong> HEIST</span></a><p>Assessment intelligence. Teacher insight. Student momentum.</p><span>© {new Date().getFullYear()} Brains Heist</span></footer>
    </main>
  );
};

export default BookedDemoPage;
