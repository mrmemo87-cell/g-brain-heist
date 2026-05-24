import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import type { IeltsStudentJourney } from '../../../../services/ieltsJourneyService';
import IeltsBandGauge from './IeltsBandGauge';

interface IeltsMissionCardProps {
  journey: IeltsStudentJourney;
  animate?: boolean;
}

const SCORE_SOURCE_LABELS: Record<'reading' | 'listening' | 'writing' | 'speaking', string> = {
  reading: 'Latest result',
  listening: 'Latest result',
  writing: 'Latest reviewed feedback',
  speaking: 'Latest reviewed feedback',
};

const confidenceLabel = (level: string | null) => {
  if (!level) return null;
  if (level === 'high') return { text: 'High confidence', color: '#0891b2' };
  if (level === 'medium') return { text: 'Building confidence', color: '#7c3aed' };
  return { text: 'More practice needed', color: '#ea580c' };
};

const IeltsMissionCard: React.FC<IeltsMissionCardProps> = ({ journey, animate = true }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isNarrowPhone, setIsNarrowPhone] = useState(false);
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    if (!cardRef.current || !animate) return;
    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    gsap.fromTo(cardRef.current, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const phoneQuery = window.matchMedia('(max-width: 768px)');
    const narrowQuery = window.matchMedia('(max-width: 480px)');

    const sync = () => {
      setIsPhone(phoneQuery.matches);
      setIsNarrowPhone(narrowQuery.matches);
    };

    sync();
    phoneQuery.addEventListener('change', sync);
    narrowQuery.addEventListener('change', sync);

    return () => {
      phoneQuery.removeEventListener('change', sync);
      narrowQuery.removeEventListener('change', sync);
    };
  }, []);

  const { current_estimates, target_band, confidence_level } = journey;
  const conf = confidenceLabel(confidence_level);
  const overall = current_estimates?.overall;

  const activeAssignments = journey.assigned_practice ?? [];
  const completedPractice = journey.completed_practice ?? [];
  const total = activeAssignments.length;
  const completed = activeAssignments.filter((item) => (item.status ?? '').toLowerCase() === 'completed').length;
  const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const overallGaugeSize = isNarrowPhone ? 136 : isPhone ? 150 : 164;
  const skillGaugeSize = isNarrowPhone ? 94 : isPhone ? 102 : 112;

  return (
    <div
      ref={cardRef}
      data-anim="mission-card"
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '1.25rem',
        padding: '1.5rem',
        boxShadow: '0 2px 16px rgba(0,0,0,0.07)',
        opacity: 1,
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
        <div>
          <p style={{ margin: 0, fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#0891b2' }}>
            IELTS MISSION
          </p>
          <h2 style={{ margin: '0.3rem 0 0', fontSize: '1.5rem', fontWeight: 900, color: '#0f172a', lineHeight: 1.2 }}>
            Readiness Overview
          </h2>
          {conf && (
            <span style={{
              display: 'inline-block',
              marginTop: '0.5rem',
              fontSize: '0.72rem',
              fontWeight: 700,
              padding: '0.25rem 0.65rem',
              borderRadius: '9999px',
              border: `1px solid ${conf.color}40`,
              color: conf.color,
              background: `${conf.color}14`,
              letterSpacing: '0.04em',
            }}>
              {conf.text}
            </span>
          )}
        </div>

        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: 0, fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Target Band
          </p>
          <p style={{ margin: '0.2rem 0 0', fontSize: '2rem', fontWeight: 900, color: target_band ? '#0891b2' : '#cbd5e1', lineHeight: 1 }}>
            {target_band ? target_band.toFixed(1) : '—'}
          </p>
          {!target_band && (
            <>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.65rem', color: '#94a3b8', fontStyle: 'italic' }}>
                No target set
              </p>
              <a href="/ielts/prime" style={{ marginTop: '0.3rem', display: 'inline-block', fontSize: '0.72rem', fontWeight: 800, color: '#0369a1', textDecoration: 'none' }}>
                Set target band
              </a>
            </>
          )}
        </div>
      </div>

      {/* Gauges: Overall hero left, 2×2 skills right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: isPhone ? '1rem' : '1.25rem', flexDirection: isPhone ? 'column' : 'row', marginBottom: '1.25rem' }}>
        <div style={{ flex: '0 0 auto', paddingRight: isPhone ? 0 : '1.25rem', borderRight: isPhone ? 'none' : '2px solid #f1f5f9', borderBottom: isPhone ? '2px solid #f1f5f9' : 'none', paddingBottom: isPhone ? '0.9rem' : 0, width: isPhone ? '100%' : 'auto', display: 'flex', justifyContent: 'center' }}>
          <IeltsBandGauge band={overall} size={overallGaugeSize} label="Overall" animate={animate} />
        </div>
        <div style={{ width: '100%', display: 'grid', gridTemplateColumns: isNarrowPhone ? '1fr' : '1fr 1fr', gap: isNarrowPhone ? '0.9rem' : '0.35rem 0.75rem', minWidth: 0, justifyItems: 'center' }}>
          <IeltsBandGauge band={current_estimates?.reading} size={skillGaugeSize} label="Reading" animate={animate} />
          <IeltsBandGauge band={current_estimates?.listening} size={skillGaugeSize} label="Listening" animate={animate} />
          <IeltsBandGauge band={current_estimates?.writing} size={skillGaugeSize} label="Writing" animate={animate} />
          <IeltsBandGauge band={current_estimates?.speaking} size={skillGaugeSize} label="Speaking" animate={animate} />
        </div>
      </div>

      <p style={{ margin: '0 0 0.65rem', fontSize: '0.72rem', color: '#64748b' }}>
        Based on your latest completed results and finalized feedback.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.35rem', marginBottom: '1.1rem' }}>
        {(Object.keys(SCORE_SOURCE_LABELS) as Array<keyof typeof SCORE_SOURCE_LABELS>).map((skill) => (
          <div key={skill} style={{ fontSize: '0.7rem', color: '#64748b' }}>
            <strong style={{ color: '#334155' }}>{skill.charAt(0).toUpperCase() + skill.slice(1)}:</strong> {SCORE_SOURCE_LABELS[skill]}
          </div>
        ))}
      </div>

      {/* Assignment progress */}
      {total > 0 ? (
        <div style={{ marginBottom: '0.9rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 700, color: '#64748b', marginBottom: '0.45rem' }}>
            <span>Current assignment progress</span>
            <span style={{ color: progressPct === 100 ? '#0891b2' : '#64748b' }}>
              {completed}/{total} · {progressPct}%
            </span>
          </div>
          <div style={{ height: '0.45rem', borderRadius: '9999px', background: '#f1f5f9', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${progressPct}%`,
              borderRadius: '9999px',
              background: progressPct === 100
                ? 'linear-gradient(90deg, #0891b2, #059669)'
                : 'linear-gradient(90deg, #0891b2, #7c3aed)',
              transition: 'width 0.6s ease',
            }} />
          </div>
        </div>
      ) : (
        <p style={{ margin: '0 0 0.8rem', fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic' }}>
          No active assignments right now.
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 700, color: '#64748b' }}>
        <span>Completed practice</span>
        <span>{completedPractice.length}</span>
      </div>
    </div>
  );
};

export default IeltsMissionCard;
