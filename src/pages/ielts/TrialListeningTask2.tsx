import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchIeltsScreenerCatalog, launchIeltsScreener, type IeltsScreenerEntry } from '../../../services/ieltsScreenerLaunchService';

const CheckIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const ShieldIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3 5 6v5c0 4.6 2.8 8.3 7 10 4.2-1.7 7-5.4 7-10V6l-7-3Z" />
    <path d="m9.5 12 1.7 1.7 3.8-4" />
  </svg>
);

const TrialListeningTask2: React.FC = () => {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<IeltsScreenerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    fetchIeltsScreenerCatalog().then((value) => { if (active) setEntries(value); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Please try again.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);
  const entry = entries[0];
  const canOpen = entry && ['ready', 'in_progress', 'completed', 'expired'].includes(entry.status);
  const open = async () => {
    if (!entry || !canOpen || opening) return;
    setOpening(true);
    setError('');
    try { navigate(await launchIeltsScreener(entry)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Please try again.'); }
    finally { setOpening(false); }
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'linear-gradient(145deg,#f8fafc 0%,#eef2ff 52%,#ecfeff 100%)',
        padding: 'clamp(1rem,4vw,2.5rem)',
      }}
    >
      <section
        aria-labelledby="ielts-screener-review-heading"
        style={{
          width: 'min(100%,680px)',
          background: '#ffffff',
          border: '1px solid #dbeafe',
          borderRadius: '1.5rem',
          padding: 'clamp(1.4rem,5vw,2.5rem)',
          boxShadow: '0 28px 80px rgba(37,99,235,0.12)',
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 20,
            color: '#2563eb',
            background: 'linear-gradient(145deg,#dbeafe,#ecfeff)',
            border: '1px solid #bfdbfe',
            marginBottom: '1.25rem',
          }}
        >
          <ShieldIcon />
        </div>

        <p
          style={{
            margin: '0 0 .65rem',
            color: '#0369a1',
            fontSize: '.76rem',
            fontWeight: 900,
            letterSpacing: '.12em',
            textTransform: 'uppercase',
          }}
        >
          Brains Heist IELTS
        </p>
        <h1
          id="ielts-screener-review-heading"
          style={{
            margin: 0,
            color: '#0f172a',
            fontSize: 'clamp(1.9rem,6vw,3.2rem)',
            lineHeight: 1.02,
            letterSpacing: '-.045em',
          }}
        >
          Listening Readiness Screener
        </h1>
        <p style={{ margin: '1rem 0 0', color: '#475569', lineHeight: 1.7, fontSize: '1rem' }}>
          A short starting-point check using reviewed Brains Heist content. Listen to three recordings and answer 12 questions.
          Your result shows raw performance and evidence coverage. This screener does not give an IELTS band.
        </p>

        <div
          style={{
            marginTop: '1.4rem',
            display: 'grid',
            gap: '.7rem',
            padding: '1rem',
            borderRadius: '1rem',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
          }}
        >
          {[
            'Use headphones and find a quiet place',
            '30 seconds to read each group; 15 seconds to finish your answers',
            'Pause or replay the audio when you need to',
          ].map((item) => (
            <div key={item} style={{ display: 'flex', gap: '.65rem', alignItems: 'flex-start', color: '#334155', lineHeight: 1.5 }}>
              <span style={{ color: '#0891b2', display: 'inline-flex', marginTop: 1 }}><CheckIcon /></span>
              <span>{item}</span>
            </div>
          ))}
        </div>

        <div aria-live="polite" style={{ margin: '1.2rem 0 0', color: '#475569', fontSize: '.95rem', lineHeight: 1.6 }}>
          {loading ? 'Checking your screener…' : error ? <p role="alert">{error}</p>
            : !entry ? 'The reviewed screener is awaiting its final delivery checks. Please check back here.'
            : entry.status === 'completed' ? 'Your completed screener and saved result are ready to view.'
            : entry.status === 'in_progress' ? 'Your screener is in progress. Resume your saved attempt.'
            : entry.status === 'expired' ? 'Your attempt time has ended. Open it to finish saving your responses.'
            : entry.status === 'scheduled' ? 'Your screener is scheduled. Check back when it opens.'
            : entry.status === 'paused' ? 'The screener is temporarily paused. Your saved work is safe.'
            : entry.status === 'ready' ? `Allow ${entry.duration_minutes} minutes. Your answers save as you work.`
            : 'This screener is currently unavailable. Your saved work is safe.'}
        </div>

        {canOpen && <button type="button" disabled={opening || loading} onClick={() => void open()}
          className="mt-5 w-full rounded-full bg-gradient-to-r from-cyan-600 via-blue-600 to-violet-700 px-5 py-4 font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 disabled:opacity-60">
          {opening ? 'Opening…' : entry.status === 'completed' ? 'View screener result' : entry.status === 'in_progress' ? 'Resume screener' : entry.status === 'expired' ? 'Open saved attempt' : 'Start Listening screener'}
        </button>}
        {!loading && <button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-4 w-full rounded-xl px-4 py-3 text-sm font-semibold text-blue-700 underline focus-visible:outline focus-visible:outline-2">Check availability again</button>}

        <button
          type="button"
          onClick={() => navigate('/ielts')}
          style={{
            marginTop: '1.25rem',
            width: '100%',
            border: 0,
            borderRadius: 999,
            padding: '.95rem 1.2rem',
            background: 'linear-gradient(135deg,#0891b2,#2563eb 58%,#6d28d9)',
            color: '#ffffff',
            fontWeight: 900,
            fontSize: '.96rem',
            cursor: 'pointer',
          }}
        >
          Return to IELTS Dashboard
        </button>
      </section>
    </main>
  );
};

export default TrialListeningTask2;
