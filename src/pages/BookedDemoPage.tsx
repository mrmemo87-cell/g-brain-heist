import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEMO_BOOKING_DAYS,
  DEMO_BOOKING_TIMES,
  formatDemoBookingTime,
  listDemoBookingSlots,
  submitDemoBooking,
  type DemoBookingInput,
  type DemoBookingSlot,
} from '../../services/demoBookingService';
import './BookedDemoPage.css';

const initialBooking = (): DemoBookingInput => ({
  contact_name: '',
  phone: '',
  preferred_date: DEMO_BOOKING_DAYS[0].date,
  preferred_time: '',
  website: '',
});

const BookedDemoPage: React.FC = () => {
  const [booking, setBooking] = useState<DemoBookingInput>(initialBooking);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [bookingId, setBookingId] = useState('');
  const [slots, setSlots] = useState<DemoBookingSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [slotsError, setSlotsError] = useState('');
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [flipSequence, setFlipSequence] = useState(0);
  const [flipDirection, setFlipDirection] = useState<'next' | 'previous'>('next');

  const selectedDay = DEMO_BOOKING_DAYS[selectedDayIndex];
  const takenSlots = useMemo(
    () => new Set(slots.filter((slot) => slot.is_taken).map((slot) => `${slot.booking_date}:${slot.booking_time}`)),
    [slots],
  );
  const availableCount = DEMO_BOOKING_TIMES.filter((time) => !takenSlots.has(`${selectedDay.date}:${time}`)).length;

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

  const setField = <K extends keyof DemoBookingInput>(field: K, value: DemoBookingInput[K]) => {
    setBooking((current) => ({ ...current, [field]: value }));
  };

  const selectDay = (index: number) => {
    if (index === selectedDayIndex) return;
    setFlipDirection(index > selectedDayIndex ? 'next' : 'previous');
    setSelectedDayIndex(index);
    setFlipSequence((current) => current + 1);
    setField('preferred_date', DEMO_BOOKING_DAYS[index].date);
    setField('preferred_time', '');
    setError('');
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const id = await submitDemoBooking(booking);
      setBookingId(id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'We could not submit your request. Please try again.');
      void loadAvailability();
    } finally {
      setSubmitting(false);
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
            <span>{DEMO_BOOKING_DAYS.find((day) => day.date === booking.preferred_date)?.weekday}</span>
            <strong>August {booking.preferred_date.slice(-2)} · {formatDemoBookingTime(booking.preferred_time)}</strong>
            <small>Bishkek time · GMT+6</small>
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
          <p>Just your name, phone number, and one available 30-minute slot. Times are shown in Bishkek time (GMT+6).</p>
        </div>

        <form className="booked-scheduler" onSubmit={handleSubmit} noValidate>
          <div className="booked-scheduler-topline">
            <span>LIVE AVAILABILITY</span>
            <div><i /> Updating in real time</div>
          </div>

          <div className="booked-identity-fields">
            <label className="booked-field">Your name<input required maxLength={120} autoComplete="name" value={booking.contact_name} onChange={(event) => setField('contact_name', event.target.value)} placeholder="Full name" /></label>
            <label className="booked-field">Phone / WhatsApp<input required maxLength={50} autoComplete="tel" inputMode="tel" value={booking.phone} onChange={(event) => setField('phone', event.target.value)} placeholder="+996 555 123 456" /></label>
          </div>

          <div className="booked-day-strip" role="tablist" aria-label="Choose a demonstration day">
            {DEMO_BOOKING_DAYS.map((day, index) => {
              const dayAvailable = DEMO_BOOKING_TIMES.filter((time) => !takenSlots.has(`${day.date}:${time}`)).length;
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
                <div><span>AUGUST 2026</span><h3>{selectedDay.weekday}</h3></div>
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
                  {DEMO_BOOKING_TIMES.map((time) => {
                    const isTaken = slotsLoading || takenSlots.has(`${selectedDay.date}:${time}`);
                    const isSelected = booking.preferred_date === selectedDay.date && booking.preferred_time === time;
                    return (
                      <button key={time} type="button" disabled={isTaken} aria-pressed={isSelected} onClick={() => setField('preferred_time', time)} className={`${isTaken ? 'taken' : 'available'} ${isSelected ? 'selected' : ''}`}>
                        <span>{formatDemoBookingTime(time)}</span><small>{isTaken ? 'TAKEN' : isSelected ? 'SELECTED' : 'OPEN'}</small>
                      </button>
                    );
                  })}
                </div>
              )}
              {!slotsLoading && availableCount === 0 && <p className="booked-full-day-note">Sunday is fully booked. Flip to the next day to find an open time.</p>}
            </div>
            <button type="button" className="booked-calendar-arrow" onClick={() => selectDay(Math.min(DEMO_BOOKING_DAYS.length - 1, selectedDayIndex + 1))} disabled={selectedDayIndex === DEMO_BOOKING_DAYS.length - 1} aria-label="Next day">→</button>
          </div>

          <label className="booked-honeypot" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={booking.website} onChange={(event) => setField('website', event.target.value)} /></label>
          <div className="booked-selection-summary">
            <div><span>YOUR SELECTION</span><strong>{booking.preferred_time ? `${selectedDay.weekday}, August ${selectedDay.dayNumber} · ${formatDemoBookingTime(booking.preferred_time)}` : 'Choose an open time above'}</strong></div>
            <span className="booked-timezone-pill">GMT+6</span>
          </div>
          {error && <div className="booked-error" role="alert">{error}</div>}
          <button className="booked-submit" type="submit" disabled={submitting || slotsLoading || Boolean(slotsError) || !booking.preferred_time}>
            {submitting ? 'Locking your time…' : 'Book this demo'}<span aria-hidden="true">→</span>
          </button>
          <p className="booked-form-footnote">Your number is used only to coordinate this demonstration.</p>
        </form>
      </section>

      <footer className="booked-footer"><a className="booked-brand" href="/"><img src="/logo.png" alt="" /><span><strong>BRAINS</strong> HEIST</span></a><p>Assessment intelligence. Teacher insight. Student momentum.</p><span>© {new Date().getFullYear()} Brains Heist</span></footer>
    </main>
  );
};

export default BookedDemoPage;
