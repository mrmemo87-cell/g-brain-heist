import React from 'react';
import type { ProgramArtworkKey } from '../lib/programArtwork';

// A plain Brains Heist mark for each programme: one line icon on a quiet tinted panel.
// It never imitates an exam board's own logo or wordmark.
const MARKS: Record<ProgramArtworkKey, { label: string; tint: string; ink: string; icon: React.ReactNode }> = {
  cambridge: {
    label: 'Assessments',
    tint: '#eef4ff',
    ink: '#1d4ed8',
    icon: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 3v2h6V3M9 11l2 2 4-4M9 17h6" /></>,
  },
  ielts: {
    label: 'Exam preparation',
    tint: '#f1f5f9',
    ink: '#0f766e',
    icon: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3Z" /></>,
  },
  writing: {
    label: 'Writing',
    tint: '#f5f3ff',
    ink: '#6d28d9',
    icon: <><path d="M4 20h4L19 9l-4-4L4 16Z" /><path d="m13 7 4 4" /></>,
  },
  admissions: {
    label: 'Admissions',
    tint: '#f0fdf4',
    ink: '#15803d',
    icon: <><circle cx="10" cy="8" r="3.5" /><path d="M3 20c1-4 4-6 7-6 1.5 0 3 .4 4.2 1.2M17 15v6M14 18h6" /></>,
  },
};

type ProgramMarkProps = { program: ProgramArtworkKey; className?: string; style?: React.CSSProperties };

const ProgramMark: React.FC<ProgramMarkProps> = ({ program, className = '', style }) => {
  const mark = MARKS[program];
  return (
    <div
      className={`program-mark ${className}`}
      aria-hidden="true"
      style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '0 1.1rem', background: mark.tint, color: mark.ink, ...style }}
    >
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{mark.icon}</svg>
      <span style={{ fontSize: '.72rem', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>{mark.label}</span>
    </div>
  );
};

export default ProgramMark;
