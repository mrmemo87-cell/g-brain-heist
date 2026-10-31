import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { getDemoCountryOptions } from '../../src/data/demoBookingLocations';
import {
  getDemoPersonas, readStoredDemoVisitor, storeDemoVisitor, clearStoredDemoVisitor, type DemoPersona,
} from '../../services/demoMode';
import './DemoEntryGate.css';

interface DemoEntryGateProps {
  onLogin: (email: string, password: string) => Promise<void>;
}

const ROLES = ['Teacher', 'Head of department', 'Deputy head / Principal', 'School owner / Director', 'Parent', 'Other'];
const CLASS_SIZES = ['Under 100 students', '100–300 students', '300–800 students', '800+ students'];
const INTERESTS = [
  'Finding struggling students early', 'Support plans that prove they worked', 'Cambridge-aligned assessments',
  'Class Conquest & classroom battles', 'Student motivation (missions, streaks, clans)', 'School Head dashboards',
  'Reports for parents', 'Replacing paper tests',
];

const HIGHLIGHTS: Array<{ title: string; text: string; icon: string }> = [
  { icon: '🎯', title: 'Spots the gap in week 3', text: 'Three weekly checks flag five students on the present perfect. One review, one plan, one targeted practice set.' },
  { icon: '📈', title: 'Proves it worked by week 8', text: 'Frozen baseline, five follow-up checks, three recoveries confirmed, one honest “no change” waiting for the teacher.' },
  { icon: '🏆', title: 'Students actually want to play', text: '46 students, 800 daily missions this month, a 12-day streak, four clans, 97 battles and a Class Conquest map.' },
];

const detectDevice = (): string => {
  const ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua) || (navigator.maxTouchPoints > 1 && window.innerWidth >= 768 && window.innerWidth < 1100)) return 'tablet';
  if (/Mobi|Android|iPhone/i.test(ua)) return 'phone';
  return 'desktop';
};

const readUtm = (): Record<string, string> => {
  const params = new URLSearchParams(window.location.search);
  const utm: Record<string, string> = {};
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref'].forEach((key) => {
    const value = params.get(key);
    if (value) utm[key] = value.slice(0, 120);
  });
  return utm;
};

const fetchGeo = async (): Promise<Record<string, string | null>> => {
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 2500);
    const response = await fetch('/api/demo-geo', { signal: controller.signal });
    window.clearTimeout(timer);
    if (!response.ok) return {};
    const payload = await response.json() as { country?: string | null; region?: string | null; city?: string | null; timezone?: string | null };
    return { geo_country: payload.country ?? null, geo_region: payload.region ?? null, geo_city: payload.city ?? null, geo_timezone: payload.timezone ?? null };
  } catch {
    return {};
  }
};

const DemoEntryGate: React.FC<DemoEntryGateProps> = ({ onLogin }) => {
  const personas = useMemo(() => getDemoPersonas(), []);
  const countries = useMemo(() => getDemoCountryOptions(), []);
  const returning = useMemo(() => readStoredDemoVisitor(), []);

  const [fullName, setFullName] = useState(returning?.name ?? '');
  const [email, setEmail] = useState(returning?.email ?? '');
  const [school, setSchool] = useState('');
  const [role, setRole] = useState('Teacher');
  const [country, setCountry] = useState('');
  const [classSize, setClassSize] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [consent, setConsent] = useState(false);
  const [persona, setPersona] = useState<DemoPersona['key']>('teacher');
  const [busy, setBusy] = useState<DemoPersona['key'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(!returning);

  useEffect(() => {
    // Guess the country from the browser locale so most visitors only confirm it.
    try {
      const region = new Intl.Locale(navigator.language).maximize().region;
      const match = region ? countries.find((item) => item.code === region) : undefined;
      if (match && !country) setCountry(match.name);
    } catch { /* ignore */ }
  }, [countries, country]);

  const toggleInterest = (value: string) => setInterests((current) => (
    current.includes(value) ? current.filter((item) => item !== value) : [...current, value].slice(0, 5)
  ));

  const enter = async (key: DemoPersona['key'], register: boolean) => {
    const chosen = personas.find((item) => item.key === key);
    if (!chosen || busy) return;
    setError(null);
    setBusy(key);
    try {
      let visitorId = returning?.id ?? null;
      if (register || !visitorId) {
        if (fullName.trim().length < 2) throw new Error('Please tell us your name.');
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) throw new Error('Please enter a valid email address.');
        if (!consent) throw new Error('Please confirm you are happy for us to record your demo visit.');
        const geo = await fetchGeo();
        const { data, error: rpcError } = await supabase.rpc('rpc_demo_register_visitor', {
          p: {
            full_name: fullName.trim(), email: email.trim(), school: school.trim(), role, country, class_size: classSize,
            interests, message: message.trim(), consent: true, entered_as: key,
            locale: navigator.language, user_agent: navigator.userAgent, referrer: document.referrer || null,
            utm: readUtm(), screen: `${window.screen.width}x${window.screen.height}`, device: detectDevice(), ...geo,
          },
        });
        if (rpcError) throw new Error('We could not register your visit just now. Please try again.');
        const payload = data as { ok?: boolean; visitor_id?: string; error?: string } | null;
        if (!payload?.ok || !payload.visitor_id) throw new Error(payload?.error || 'We could not register your visit just now.');
        visitorId = payload.visitor_id;
        storeDemoVisitor({ id: visitorId, name: fullName.trim(), email: email.trim(), enteredAs: key, registeredAt: new Date().toISOString() });
      } else {
        storeDemoVisitor({ ...returning!, enteredAs: key });
      }
      await onLogin(chosen.email, chosen.password);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong. Please try again.');
      setBusy(null);
    }
  };

  return (
    <div className="demo-gate">
      <div className="demo-gate-glow" aria-hidden="true" />
      <header className="demo-gate-top">
        <div className="demo-gate-brand">
          <img src="/logo.png" alt="" width={40} height={40} />
          <div><strong>Brains Heist</strong><span>Interactive school demo</span></div>
        </div>
        <a className="demo-gate-toplink" href="https://www.brainsheist.com/booked" target="_blank" rel="noreferrer">Book a guided demo ↗</a>
      </header>

      <main className="demo-gate-main">
        <section className="demo-gate-hero">
          <p className="demo-gate-eyebrow">Demo International School · Grade 7 · live data, real engine</p>
          <h1>Walk into a school where every struggling student was caught in week 3.</h1>
          <p className="demo-gate-lede">
            This is a complete Brains Heist school, not a slideshow: two Grade 7 classes, eight weeks of weekly checks,
            800 daily missions, a Class Conquest map, clans and battles. Every chart you will see was computed by the same
            engine real schools use. Click anything. It resets every night.
          </p>
          <div className="demo-gate-highlights">
            {HIGHLIGHTS.map((item) => (
              <div key={item.title} className="demo-gate-highlight">
                <span className="demo-gate-highlight-icon" aria-hidden="true">{item.icon}</span>
                <strong>{item.title}</strong>
                <p>{item.text}</p>
              </div>
            ))}
          </div>
          <ul className="demo-gate-stats" aria-label="What is inside the demo">
            <li><b>46</b><span>students in 7A and 7B</span></li>
            <li><b>16</b><span>weekly checks, all verified questions</span></li>
            <li><b>5</b><span>support plans, three confirmed recoveries</span></li>
            <li><b>1</b><span>Class Conquest trophy (7A, week of 26 Oct)</span></li>
          </ul>
        </section>

        <section className="demo-gate-card" aria-labelledby="demo-gate-form-title">
          {returning && !showForm ? (
            <div className="demo-gate-welcome">
              <p className="demo-gate-eyebrow">Welcome back</p>
              <h2 id="demo-gate-form-title">Good to see you again, {returning.name.split(' ')[0]}.</h2>
              <p className="demo-gate-muted">Pick how you want to look around today. The school has been rebuilt since your last visit.</p>
              <button type="button" className="demo-gate-link" onClick={() => { clearStoredDemoVisitor(); setShowForm(true); }}>Not you? Register as someone else</button>
            </div>
          ) : (
            <div className="demo-gate-form-head">
              <p className="demo-gate-eyebrow">Step 1 of 2 · Tell us who you are</p>
              <h2 id="demo-gate-form-title">Open the demo school</h2>
              <p className="demo-gate-muted">Takes 30 seconds. We use this to send you your own pilot setup afterwards.</p>
            </div>
          )}

          {showForm ? (
            <form className="demo-gate-form" onSubmit={(event) => { event.preventDefault(); void enter(persona, true); }}>
              <label><span>Your name</span><input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" required maxLength={120} placeholder="e.g. Aigerim Sadykova" /></label>
              <label><span>Work email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required maxLength={160} placeholder="you@school.edu" /></label>
              <label><span>School</span><input value={school} onChange={(event) => setSchool(event.target.value)} autoComplete="organization" maxLength={160} placeholder="School name" /></label>
              <div className="demo-gate-row">
                <label><span>Your role</span>
                  <select value={role} onChange={(event) => setRole(event.target.value)}>{ROLES.map((item) => <option key={item} value={item}>{item}</option>)}</select>
                </label>
                <label><span>Country</span>
                  <select value={country} onChange={(event) => setCountry(event.target.value)}>
                    <option value="">Choose country</option>
                    {countries.map((item) => <option key={item.code} value={item.name}>{item.name}</option>)}
                  </select>
                </label>
              </div>
              <label><span>School size</span>
                <select value={classSize} onChange={(event) => setClassSize(event.target.value)}>
                  <option value="">Choose</option>
                  {CLASS_SIZES.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <fieldset className="demo-gate-chips">
                <legend>What matters most to you? <small>(pick up to 5)</small></legend>
                {INTERESTS.map((item) => (
                  <button type="button" key={item} className={interests.includes(item) ? 'is-on' : ''} onClick={() => toggleInterest(item)} aria-pressed={interests.includes(item)}>{item}</button>
                ))}
              </fieldset>
              <label><span>Anything you want to see? <small>(optional)</small></span>
                <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={500} rows={2} placeholder="e.g. We run IGCSE in Year 10 and need parent reports." />
              </label>
              <label className="demo-gate-consent">
                <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                <span>I’m happy for Brains Heist to record my details and how I use the demo, and to contact me about a pilot for my school.</span>
              </label>
              <p className="demo-gate-eyebrow demo-gate-step2">Step 2 of 2 · Choose your seat</p>
              <div className="demo-gate-personas" role="radiogroup" aria-label="Enter the demo as">
                {personas.map((item) => (
                  <button type="button" key={item.key} role="radio" aria-checked={persona === item.key} className={persona === item.key ? 'is-selected' : ''} onClick={() => setPersona(item.key)}>
                    <strong>{item.title}</strong><span>{item.description}</span>
                  </button>
                ))}
              </div>
              {error ? <div className="demo-gate-error" role="alert">{error}</div> : null}
              <button type="submit" className="demo-gate-cta" disabled={busy !== null}>
                {busy ? 'Opening your seat…' : persona === 'teacher' ? 'Enter as the teacher →' : 'Enter as a student →'}
              </button>
              <p className="demo-gate-fineprint">Shared demo account · anything you change is wiped at the nightly rebuild · emails, push notifications and AI feedback are switched off in the demo.</p>
            </form>
          ) : (
            <div className="demo-gate-personas demo-gate-personas--big" role="group" aria-label="Enter the demo as">
              {personas.map((item) => (
                <button type="button" key={item.key} disabled={busy !== null} onClick={() => void enter(item.key, false)}>
                  <strong>{busy === item.key ? 'Opening…' : item.title}</strong><span>{item.description}</span>
                </button>
              ))}
              {error ? <div className="demo-gate-error" role="alert">{error}</div> : null}
            </div>
          )}
        </section>
      </main>
      <footer className="demo-gate-foot">
        <span>Brains Heist LLC · Bishkek, Kyrgyzstan · <a href="https://www.brainsheist.com" target="_blank" rel="noreferrer">brainsheist.com</a></span>
        <span>Names and results in this school are fictional. The engine is real.</span>
      </footer>
    </div>
  );
};

export default DemoEntryGate;
