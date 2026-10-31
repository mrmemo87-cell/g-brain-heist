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

const ROLES = ['Teacher', 'Head of department', 'Principal', 'School owner', 'Other'];
const SIZES = ['< 100', '100–300', '300–800', '800+'];

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

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const DemoEntryGate: React.FC<DemoEntryGateProps> = ({ onLogin }) => {
  const personas = useMemo(() => getDemoPersonas(), []);
  const countries = useMemo(() => getDemoCountryOptions(), []);
  const returning = useMemo(() => readStoredDemoVisitor(), []);

  const [step, setStep] = useState<1 | 2 | 3>(returning ? 3 : 1);
  const [fullName, setFullName] = useState(returning?.name ?? '');
  const [email, setEmail] = useState(returning?.email ?? '');
  const [school, setSchool] = useState('');
  const [role, setRole] = useState('Teacher');
  const [country, setCountry] = useState('');
  const [size, setSize] = useState('');
  const [consent, setConsent] = useState(!!returning);
  const [busy, setBusy] = useState<DemoPersona['key'] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const region = new Intl.Locale(navigator.language).maximize().region;
      const match = region ? countries.find((item) => item.code === region) : undefined;
      if (match) setCountry((current) => current || match.name);
    } catch { /* ignore */ }
  }, [countries]);

  const next = () => {
    setError(null);
    if (step === 1) {
      if (fullName.trim().length < 2) { setError('Your name, please.'); return; }
      if (!EMAIL_RE.test(email.trim())) { setError('That email doesn’t look right.'); return; }
      setStep(2);
    } else if (step === 2) {
      if (!school.trim()) { setError('Your school’s name, please.'); return; }
      setStep(3);
    }
  };

  const enter = async (key: DemoPersona['key']) => {
    const chosen = personas.find((item) => item.key === key);
    if (!chosen || busy) return;
    setError(null);
    if (!consent) { setError('Please tick the box first.'); return; }
    setBusy(key);
    try {
      let visitorId = returning?.id ?? null;
      if (!returning) {
        const geo = await fetchGeo();
        const { data, error: rpcError } = await supabase.rpc('rpc_demo_register_visitor', {
          p: {
            full_name: fullName.trim(), email: email.trim(), school: school.trim(), role, country, class_size: size,
            consent: true, entered_as: key, locale: navigator.language, user_agent: navigator.userAgent,
            referrer: document.referrer || null, utm: readUtm(), screen: `${window.screen.width}x${window.screen.height}`,
            device: detectDevice(), ...geo,
          },
        });
        if (rpcError) throw new Error('Couldn’t register your visit. Please try again.');
        const payload = data as { ok?: boolean; visitor_id?: string; error?: string } | null;
        if (!payload?.ok || !payload.visitor_id) throw new Error(payload?.error || 'Couldn’t register your visit.');
        visitorId = payload.visitor_id;
      }
      storeDemoVisitor({ id: visitorId!, name: fullName.trim(), email: email.trim(), enteredAs: key, registeredAt: returning?.registeredAt ?? new Date().toISOString() });
      await onLogin(chosen.email, chosen.password);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong. Please try again.');
      setBusy(null);
    }
  };

  const restart = () => { clearStoredDemoVisitor(); setConsent(false); setStep(1); };

  return (
    <div className="demo-gate">
      <div className="demo-gate-glow" aria-hidden="true" />
      <div className="demo-gate-wrap">
        <header className="demo-gate-brand">
          <img src="/logo.png" alt="" width={36} height={36} />
          <strong>Brains Heist</strong>
        </header>

        <h1>See a school where no student slips through.</h1>
        <p className="demo-gate-lede">A real Grade 7 school: 46 students, 8 weeks of data, Class Conquest, clans and battles. Resets nightly.</p>

        <section className="demo-gate-card" aria-live="polite">
          {!returning ? (
            <ol className="demo-gate-steps" aria-label="Progress">
              {[1, 2, 3].map((n) => <li key={n} className={n === step ? 'is-now' : n < step ? 'is-done' : ''} aria-current={n === step ? 'step' : undefined}>{n}</li>)}
            </ol>
          ) : null}

          {step === 1 ? (
            <form className="demo-gate-form" onSubmit={(event) => { event.preventDefault(); next(); }}>
              <h2>Hi! Who are you?</h2>
              <input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" placeholder="Your name" aria-label="Your name" autoFocus />
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="Work email" aria-label="Work email" />
              {error ? <div className="demo-gate-error" role="alert">{error}</div> : null}
              <button type="submit" className="demo-gate-cta">Next →</button>
            </form>
          ) : null}

          {step === 2 ? (
            <form className="demo-gate-form" onSubmit={(event) => { event.preventDefault(); next(); }}>
              <h2>Your school</h2>
              <input value={school} onChange={(event) => setSchool(event.target.value)} autoComplete="organization" placeholder="School name" aria-label="School name" autoFocus />
              <div className="demo-gate-chips" role="radiogroup" aria-label="Your role">
                {ROLES.map((item) => <button type="button" key={item} role="radio" aria-checked={role === item} className={role === item ? 'is-on' : ''} onClick={() => setRole(item)}>{item}</button>)}
              </div>
              <select value={country} onChange={(event) => setCountry(event.target.value)} aria-label="Country">
                <option value="">Country</option>
                {countries.map((item) => <option key={item.code} value={item.name}>{item.name}</option>)}
              </select>
              <div className="demo-gate-chips" role="radiogroup" aria-label="Number of students">
                {SIZES.map((item) => <button type="button" key={item} role="radio" aria-checked={size === item} className={size === item ? 'is-on' : ''} onClick={() => setSize(item)}>{item} students</button>)}
              </div>
              {error ? <div className="demo-gate-error" role="alert">{error}</div> : null}
              <div className="demo-gate-nav">
                <button type="button" className="demo-gate-back" onClick={() => setStep(1)}>← Back</button>
                <button type="submit" className="demo-gate-cta">Next →</button>
              </div>
            </form>
          ) : null}

          {step === 3 ? (
            <div className="demo-gate-form">
              <h2>{returning ? `Welcome back, ${returning.name.split(' ')[0]}. Pick a seat.` : 'Pick your seat'}</h2>
              <div className="demo-gate-personas" role="group" aria-label="Enter the demo as">
                {personas.map((item) => (
                  <button type="button" key={item.key} disabled={busy !== null} onClick={() => void enter(item.key)}>
                    <span className="demo-gate-persona-icon" aria-hidden="true">{item.key === 'teacher' ? '👩‍🏫' : '🎒'}</span>
                    <strong>{busy === item.key ? 'Opening…' : item.key === 'teacher' ? 'Teacher & School Head' : 'Student'}</strong>
                    <span>{item.key === 'teacher' ? 'Classes, evidence, support plans, dashboards' : 'Missions, Class Conquest, clans, battles'}</span>
                  </button>
                ))}
              </div>
              {!returning ? (
                <label className="demo-gate-consent">
                  <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                  <span>Brains Heist may record my demo visit and contact me about a pilot.</span>
                </label>
              ) : null}
              {error ? <div className="demo-gate-error" role="alert">{error}</div> : null}
              <div className="demo-gate-nav">
                {returning
                  ? <button type="button" className="demo-gate-back" onClick={restart}>Not {returning.name.split(' ')[0]}?</button>
                  : <button type="button" className="demo-gate-back" onClick={() => setStep(2)}>← Back</button>}
              </div>
            </div>
          ) : null}
        </section>

        <footer className="demo-gate-foot">
          <a href="https://www.brainsheist.com/booked" target="_blank" rel="noreferrer">Prefer a guided demo? Book one ↗</a>
          <span>Shared demo · names are fictional · emails and AI are off</span>
        </footer>
      </div>
    </div>
  );
};

export default DemoEntryGate;
