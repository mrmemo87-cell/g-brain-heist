import React, { useEffect, useMemo, useState } from 'react';
import {
  DEMO_INTEREST_OPTIONS,
  submitDemoBooking,
  type DemoBookingInput,
  type DemoInterest,
} from '../../services/demoBookingService';
import './BookedDemoPage.css';

const initialBooking = (): DemoBookingInput => ({
  school_name: '',
  contact_name: '',
  email: '',
  phone: '',
  role_title: '',
  country: '',
  school_size: '',
  preferred_format: 'online',
  preferred_date: '',
  preferred_time: '',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  interests: ['admissions', 'analytics'],
  message: '',
  consent: false,
  website: '',
});

const BookedDemoPage: React.FC = () => {
  const [booking, setBooking] = useState<DemoBookingInput>(initialBooking);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [bookingId, setBookingId] = useState('');
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Book a Brains Heist School Demo';
    return () => { document.title = previousTitle; };
  }, []);

  const setField = <K extends keyof DemoBookingInput>(field: K, value: DemoBookingInput[K]) => {
    setBooking((current) => ({ ...current, [field]: value }));
  };

  const toggleInterest = (interest: DemoInterest) => {
    setBooking((current) => ({
      ...current,
      interests: current.interests.includes(interest)
        ? current.interests.filter((item) => item !== interest)
        : [...current.interests, interest],
    }));
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
            Thank you. A Brains Heist education specialist will review your priorities and contact you to confirm the meeting time.
          </p>
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

      <section className="booked-demo-section" id="book-demo" aria-labelledby="book-demo-title">
        <aside className="booked-demo-aside">
          <p className="booked-eyebrow">YOUR PRIVATE WALKTHROUGH</p>
          <h2 id="book-demo-title">Let’s focus the demo on your school.</h2>
          <p>Tell us where your teams lose the most time or visibility. We’ll demonstrate the workflows that matter most.</p>
          <ol>
            <li><span>1</span><div><strong>Share your priorities</strong><p>Select the challenges you want to solve.</p></div></li>
            <li><span>2</span><div><strong>We tailor the session</strong><p>Our team prepares a relevant walkthrough.</p></div></li>
            <li><span>3</span><div><strong>See Brains Heist live</strong><p>Explore workflows, evidence and next steps.</p></div></li>
          </ol>
          <div className="booked-security-note"><span aria-hidden="true">◇</span><p><strong>Your information stays private.</strong><br />It is used only to arrange and tailor your demonstration.</p></div>
        </aside>

        <form className="booked-form" onSubmit={handleSubmit} noValidate>
          <div className="booked-form-heading"><span>DEMO REQUEST</span><p>Required fields are marked *</p></div>
          <div className="booked-form-grid">
            <label className="booked-field booked-field-full">School name *<input required maxLength={180} autoComplete="organization" value={booking.school_name} onChange={(event) => setField('school_name', event.target.value)} placeholder="Your school or education group" /></label>
            <label className="booked-field">Your name *<input required maxLength={120} autoComplete="name" value={booking.contact_name} onChange={(event) => setField('contact_name', event.target.value)} placeholder="Full name" /></label>
            <label className="booked-field">Role at school *<input required maxLength={100} autoComplete="organization-title" value={booking.role_title} onChange={(event) => setField('role_title', event.target.value)} placeholder="e.g. Head of School" /></label>
            <label className="booked-field">Work email *<input required type="email" maxLength={254} autoComplete="email" value={booking.email} onChange={(event) => setField('email', event.target.value)} placeholder="you@school.edu" /></label>
            <label className="booked-field">Phone / WhatsApp<input maxLength={50} autoComplete="tel" value={booking.phone} onChange={(event) => setField('phone', event.target.value)} placeholder="Include country code" /></label>
            <label className="booked-field">Country *<input required maxLength={100} autoComplete="country-name" value={booking.country} onChange={(event) => setField('country', event.target.value)} placeholder="Country" /></label>
            <label className="booked-field">School size<select value={booking.school_size} onChange={(event) => setField('school_size', event.target.value)}><option value="">Select range</option><option>Up to 250 students</option><option>251–500 students</option><option>501–1,000 students</option><option>1,001–2,500 students</option><option>More than 2,500 students</option></select></label>
          </div>

          <fieldset className="booked-fieldset">
            <legend>What would you like to explore? *</legend>
            <div className="booked-choice-grid">
              {DEMO_INTEREST_OPTIONS.map((option) => (
                <label key={option.value} className={booking.interests.includes(option.value) ? 'booked-choice selected' : 'booked-choice'}>
                  <input type="checkbox" checked={booking.interests.includes(option.value)} onChange={() => toggleInterest(option.value)} />
                  <span>{option.label}</span><i aria-hidden="true">✓</i>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="booked-form-grid booked-schedule-grid">
            <label className="booked-field">Preferred date *<input required type="date" min={today} value={booking.preferred_date} onChange={(event) => setField('preferred_date', event.target.value)} /></label>
            <label className="booked-field">Preferred time *<select required value={booking.preferred_time} onChange={(event) => setField('preferred_time', event.target.value)}><option value="">Select a window</option><option>08:00–10:00</option><option>10:00–12:00</option><option>12:00–14:00</option><option>14:00–16:00</option><option>16:00–18:00</option><option>Other — contact me</option></select></label>
            <label className="booked-field">Meeting format *<select required value={booking.preferred_format} onChange={(event) => setField('preferred_format', event.target.value as DemoBookingInput['preferred_format'])}><option value="online">Online meeting</option><option value="in_person">In person</option><option value="either">Either works</option></select></label>
            <label className="booked-field">Timezone *<input required maxLength={100} value={booking.timezone} onChange={(event) => setField('timezone', event.target.value)} /></label>
            <label className="booked-field booked-field-full">Anything we should prepare?<textarea maxLength={2000} rows={4} value={booking.message} onChange={(event) => setField('message', event.target.value)} placeholder="Tell us about your current systems, priorities or questions." /></label>
          </div>

          <label className="booked-honeypot" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={booking.website} onChange={(event) => setField('website', event.target.value)} /></label>
          <label className="booked-consent"><input type="checkbox" checked={booking.consent} onChange={(event) => setField('consent', event.target.checked)} /><span>I agree that Brains Heist may contact me to arrange and tailor this school demonstration. *</span></label>
          {error && <div className="booked-error" role="alert">{error}</div>}
          <button className="booked-submit" type="submit" disabled={submitting}>{submitting ? 'Securing your request…' : 'Request my school demo'}<span aria-hidden="true">→</span></button>
          <p className="booked-form-footnote">Submitting a request does not confirm the appointment. Our team will contact you to finalize the date and time.</p>
        </form>
      </section>

      <footer className="booked-footer"><a className="booked-brand" href="/"><img src="/logo.png" alt="" /><span><strong>BRAINS</strong> HEIST</span></a><p>Assessment intelligence. Teacher insight. Student momentum.</p><span>© {new Date().getFullYear()} Brains Heist</span></footer>
    </main>
  );
};

export default BookedDemoPage;
