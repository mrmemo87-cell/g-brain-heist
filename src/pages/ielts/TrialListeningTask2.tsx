import React from 'react';
import { useNavigate } from 'react-router-dom';

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
          A better Listening screener is being prepared.
        </h1>
        <p style={{ margin: '1rem 0 0', color: '#475569', lineHeight: 1.7, fontSize: '1rem' }}>
          We are replacing the previous short screener with reviewed Brains Heist content built for a clearer, more reliable IELTS starting point.
          Until that version is approved, the old screener will not be used to estimate readiness.
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
            'Reviewed, original assessment content',
            'Clear practice results without false band claims',
            'Evidence that can support a broader four-skill baseline later',
          ].map((item) => (
            <div key={item} style={{ display: 'flex', gap: '.65rem', alignItems: 'flex-start', color: '#334155', lineHeight: 1.5 }}>
              <span style={{ color: '#0891b2', display: 'inline-flex', marginTop: 1 }}><CheckIcon /></span>
              <span>{item}</span>
            </div>
          ))}
        </div>

        <p style={{ margin: '1.2rem 0 0', color: '#64748b', fontSize: '.9rem', lineHeight: 1.6 }}>
          Existing classroom assignments and IELTS practice remain available from your dashboard.
        </p>

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
