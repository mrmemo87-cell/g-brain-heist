import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';

const skillIcons: Record<string, string> = {
  reading: '📖',
  listening: '🎧',
  writing: '✍️',
  speaking: '🎤',
};

const skillColors: Record<string, string> = {
  reading: '#0891b2',
  listening: '#7c3aed',
  writing: '#059669',
  speaking: '#ea580c',
};

interface IeltsNextActionCardProps {
  weakSkill: string | null;
  nextRecommendation: string;
  hasActionable: boolean;
  onOpen: () => void;
  animate?: boolean;
}

const IeltsNextActionCard: React.FC<IeltsNextActionCardProps> = ({
  weakSkill,
  nextRecommendation,
  hasActionable,
  onOpen,
  animate = true,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !animate) return;
    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    gsap.fromTo(ref.current, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out', delay: 0.3 });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const accentColor = weakSkill ? (skillColors[weakSkill] ?? '#22d3ee') : '#22d3ee';
  const icon = weakSkill ? (skillIcons[weakSkill] ?? '🎯') : '🎯';
  const label = weakSkill ? `${icon} Focus: ${weakSkill.charAt(0).toUpperCase() + weakSkill.slice(1)}` : '🎯 Next Step';

  return (
    <div
      ref={ref}
      style={{
        background: '#ffffff',
        border: `1px solid ${accentColor}33`,
        borderLeft: `4px solid ${accentColor}`,
        borderRadius: '1rem',
        padding: '1.1rem 1.2rem',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        opacity: 1,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <p style={{ margin: '0 0 0.3rem', fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: accentColor }}>
            Next Best Action
          </p>
          <h3 style={{ margin: '0 0 0.4rem', fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
            {label}
          </h3>
          {nextRecommendation && (
            <p style={{ margin: 0, fontSize: '0.83rem', color: '#475569', lineHeight: 1.55 }}>
              {nextRecommendation}
            </p>
          )}
        </div>
        {hasActionable && (
          <button
            type="button"
            onClick={onOpen}
            style={{
              padding: '0.6rem 1.1rem',
              background: accentColor,
              border: 'none',
              borderRadius: '0.6rem',
              color: '#ffffff',
              fontWeight: 900,
              fontSize: '0.82rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            Start now →
          </button>
        )}
      </div>
    </div>
  );
};

export default IeltsNextActionCard;
