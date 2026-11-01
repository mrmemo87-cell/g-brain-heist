import React from 'react';
import '../../styles/ielts-motion.css';

/**
 * Small presentational motion for IELTS screens (Visual & UX Bible 1.3.0, sections 7 and 12).
 * Everything here is decorative: it never carries state, never delays an action and is hidden from assistive tech.
 * Meaning always lives in adjacent text. Under prefers-reduced-motion every piece renders as a still image.
 * Only loading indicators loop; every other piece is finite.
 */

/** Loading glyph shown beside a busy message. "writing" scans a page; "speaking" is a radar sweep with a trailing wedge. */
export function IeltsWorkingGlyph({ variant }: { variant: 'writing' | 'speaking' }) {
  if (variant === 'writing') {
    return (
      <svg className="ixm-glyph ixm-glyph--page" viewBox="0 0 60 60" width="44" height="44" aria-hidden="true" focusable="false">
        <path className="ixm-stroke" d="M14 6H36L46 16V54H14Z" />
        <path className="ixm-stroke" d="M36 6V16H46" />
        <line className="ixm-line" x1="21" y1="28" x2="39" y2="28" />
        <line className="ixm-line" x1="21" y1="35" x2="39" y2="35" />
        <line className="ixm-line" x1="21" y1="42" x2="34" y2="42" />
        <g className="ixm-beam">
          <rect className="ixm-beam-glow" x="14" y="16" width="32" height="6" rx="2" />
          <line className="ixm-beam-line" x1="12" y1="19" x2="48" y2="19" />
        </g>
      </svg>
    );
  }
  return (
    <svg className="ixm-glyph ixm-glyph--radar" viewBox="0 0 120 120" width="52" height="52" aria-hidden="true" focusable="false">
      <circle className="ixm-ring" cx="60" cy="60" r="52" />
      <circle className="ixm-ring ixm-ring--faint" cx="60" cy="60" r="34" />
      <circle className="ixm-ring ixm-ring--faint" cx="60" cy="60" r="16" />
      <g className="ixm-sweep">
        <path className="ixm-wedge" d="M60 60 L20.2 26.6 A52 52 0 0 1 60 8 Z" />
        <line className="ixm-sweep-line" x1="60" y1="60" x2="60" y2="8" />
      </g>
      <circle className="ixm-blip ixm-blip--a" cx="84" cy="38" r="3.5" />
      <circle className="ixm-blip ixm-blip--b" cx="36" cy="78" r="3.5" />
      <circle className="ixm-blip ixm-blip--c" cx="70" cy="90" r="3" />
      <circle className="ixm-self" cx="60" cy="60" r="3.5" />
    </svg>
  );
}

/** Three dots that hop a few times and then rest: for "waiting for your teacher" lines. Finite by design. */
export function IeltsWaitingDots() {
  return <span className="ixm-dots" aria-hidden="true"><i /><i /><i /></span>;
}

/** Faceted gem for the Prime status badge. The sparkle plays once. */
export function IeltsPrimeGem() {
  return (
    <svg className="ixm-gem" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M3 9l4-6h10l4 6-9 12z" fill="currentColor" />
      <path d="M3 9h18M9 9l3 12 3-12-3-6z" fill="none" stroke="rgba(15,23,42,.45)" strokeWidth="1" strokeLinejoin="round" />
      <path className="ixm-gem-spark" d="M20 1l.9 2.1L23 4l-2.1.9L20 7l-.9-2.1L17 4l2.1-.9z" fill="#fff" />
    </svg>
  );
}

/** A feature pill with a check that draws itself once. `index` staggers the entrance. */
export function IeltsPlanChip({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <span className="ixm-chip" style={{ ['--ixm-i' as string]: index }}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
        <path className="ixm-chip-check" pathLength={1} d="M3 8.5l3.2 3.2L13 4.8" />
      </svg>
      {children}
    </span>
  );
}
