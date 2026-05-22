import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import type {
  IeltsJourneyEstimates,
  IeltsJourneyTeacherFeedbackItem,
} from '../../../../services/ieltsJourneyService';

interface SkillBarProps {
  label: string;
  band: number | null | undefined;
  icon: string;
  color: string;
  animate?: boolean;
  delay?: number;
}

const SkillBar: React.FC<SkillBarProps> = ({ label, band, icon, color, animate = true, delay = 0 }) => {
  const barRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  const clamped = Math.max(0, Math.min(9, band ?? 0));
  const pct = band !== null && band !== undefined ? (clamped / 9) * 100 : 0;

  useEffect(() => {
    const bar = barRef.current;
    const txt = textRef.current;
    if (!bar || !txt) return;
    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!animate || reduced || band === null || band === undefined) {
      bar.style.width = `${pct}%`;
      txt.textContent = band !== null && band !== undefined ? clamped.toFixed(1) : '—';
      return;
    }

    gsap.fromTo(bar, { width: '0%' }, { width: `${pct}%`, duration: 0.9, ease: 'power2.out', delay });
    const counter = { v: 0 };
    gsap.to(counter, {
      v: clamped,
      duration: 0.8,
      ease: 'power2.out',
      delay,
      onUpdate: () => { txt.textContent = counter.v.toFixed(1); },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [band]);

  return (
    <div style={{ padding: '0.8rem', borderRadius: '0.85rem', background: '#f8fafc', border: `1px solid ${color}33` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.55rem' }}>
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span>{icon}</span>{label}
        </span>
        <span ref={textRef} style={{ fontSize: '1.1rem', fontWeight: 900, color, letterSpacing: '-0.02em' }}>
          {band !== null && band !== undefined ? clamped.toFixed(1) : '—'}
        </span>
      </div>
      <div style={{ height: '0.35rem', borderRadius: '9999px', background: '#e2e8f0', overflow: 'hidden' }}>
        <div
          ref={barRef}
          style={{
            height: '100%',
            width: '0%',
            borderRadius: '9999px',
            background: `linear-gradient(90deg, ${color}cc, ${color})`,
            boxShadow: `0 0 6px ${color}60`,
          }}
        />
      </div>
      {band === null || band === undefined ? (
        <p style={{ margin: '0.4rem 0 0', fontSize: '0.68rem', color: '#94a3b8', fontStyle: 'italic' }}>
          No data yet
        </p>
      ) : null}
    </div>
  );
};

interface RubricCardProps {
  label: string;
  value: number | null | undefined;
  icon: string;
  color: string;
}

const RubricCard: React.FC<RubricCardProps> = ({ label, value, icon, color }) => (
  <div style={{ padding: '0.75rem', borderRadius: '0.75rem', background: '#f1f5f9', border: `1px solid ${color}22`, textAlign: 'center' }}>
    <span style={{ fontSize: '1.1rem' }}>{icon}</span>
    <p style={{ margin: '0.3rem 0 0.15rem', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</p>
    <p style={{ margin: 0, fontSize: '1.35rem', fontWeight: 900, color: value !== null && value !== undefined ? color : '#cbd5e1' }}>
      {value !== null && value !== undefined ? (value as number).toFixed(1) : '—'}
    </p>
  </div>
);

interface IeltsSkillBreakdownGridProps {
  estimates: IeltsJourneyEstimates;
  teacherFeedback?: IeltsJourneyTeacherFeedbackItem[];
  animate?: boolean;
}

const skillConfig: Array<{ key: keyof IeltsJourneyEstimates; label: string; icon: string; color: string }> = [
  { key: 'reading', label: 'Reading', icon: '📖', color: '#0891b2' },
  { key: 'listening', label: 'Listening', icon: '🎧', color: '#7c3aed' },
  { key: 'writing', label: 'Writing', icon: '✍️', color: '#059669' },
  { key: 'speaking', label: 'Speaking', icon: '🎤', color: '#ea580c' },
];

const IeltsSkillBreakdownGrid: React.FC<IeltsSkillBreakdownGridProps> = ({
  estimates,
  teacherFeedback = [],
  animate = true,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !animate) return;
    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    gsap.fromTo(ref.current.querySelectorAll('[data-skill-card]'), { opacity: 0, y: 10 }, { opacity: 1, y: 0, stagger: 0.07, duration: 0.35, ease: 'power2.out', delay: 0.2 });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Extract rubric insight from most recent finalized review
  const latestReview = teacherFeedback.length > 0 ? teacherFeedback[0] : null;
  const rubric = latestReview ? (latestReview as unknown as { rubric?: Record<string, number | null> }).rubric ?? null : null;
  const grammar = rubric?.grammar ?? null;
  const lexical = rubric?.lexical_resource ?? null;
  const coherence = rubric?.coherence_cohesion ?? null;
  const hasRubricData = grammar !== null || lexical !== null || coherence !== null;

  return (
    <div ref={ref}>
      {/* Skill bars */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.7rem', marginBottom: hasRubricData ? '1rem' : 0 }}>
        {skillConfig.map(({ key, label, icon, color }, i) => (
          <div key={key} data-skill-card style={{ opacity: 1 }}>
            <SkillBar
              label={label}
              band={estimates?.[key] ?? null}
              icon={icon}
              color={color}
              animate={animate}
              delay={0.2 + i * 0.07}
            />
          </div>
        ))}
      </div>

      {/* Rubric insight cards (from most recent reviewed submission) */}
      {hasRubricData && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.85rem', padding: '0.9rem' }}>
          <p style={{ margin: '0 0 0.7rem', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Latest reviewed submission insights
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
            <RubricCard label="Grammar" value={grammar} icon="🔤" color="#22d3ee" />
            <RubricCard label="Vocabulary" value={lexical} icon="📚" color="#a78bfa" />
            <RubricCard label="Coherence" value={coherence} icon="🔗" color="#34d399" />
          </div>
        </div>
      )}
    </div>
  );
};

export default IeltsSkillBreakdownGrid;
