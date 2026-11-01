import React from 'react';

/** Swirling quest portal with a glowing play button in the middle. */
export const QuestPortal: React.FC = () => (
  <svg viewBox="0 0 120 120" className="gh-portal" aria-hidden="true">
    <defs>
      <radialGradient id="ghPortalCore" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#fdf4ff" />
        <stop offset="35%" stopColor="#f472b6" />
        <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="ghPortalRing" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#22d3ee" />
        <stop offset="100%" stopColor="#f472b6" />
      </linearGradient>
    </defs>
    <circle cx="60" cy="60" r="56" fill="url(#ghPortalCore)" opacity="0.35" />
    <g className="gh-portal__ring gh-portal__ring--a">
      <circle cx="60" cy="60" r="50" fill="none" stroke="url(#ghPortalRing)" strokeWidth="3" strokeDasharray="22 12 4 12" strokeLinecap="round" />
    </g>
    <g className="gh-portal__ring gh-portal__ring--b">
      <circle cx="60" cy="60" r="40" fill="none" stroke="#a5f3fc" strokeOpacity="0.7" strokeWidth="2" strokeDasharray="6 9" strokeLinecap="round" />
    </g>
    <g className="gh-portal__ring gh-portal__ring--c">
      <circle cx="60" cy="10" r="3.5" fill="#fde68a" />
      <circle cx="110" cy="60" r="2.5" fill="#a5f3fc" />
      <circle cx="24" cy="96" r="2.5" fill="#f9a8d4" />
    </g>
    <circle className="gh-portal__core" cx="60" cy="60" r="27" fill="#1e1036" stroke="#f9a8d4" strokeWidth="2.5" />
    <path d="M52 46l20 14-20 14z" fill="#fdf4ff" stroke="#fdf4ff" strokeWidth="3" strokeLinejoin="round" />
  </svg>
);

/** Spark burst that flashes behind the crossed swords. */
export const ClashBurst: React.FC = () => (
  <svg viewBox="0 0 120 120" className="gh-burst" aria-hidden="true">
    <g stroke="#fde68a" strokeWidth="3" strokeLinecap="round">
      {Array.from({ length: 10 }).map((_, i) => {
        const a = (i / 10) * Math.PI * 2;
        const r1 = 20 + (i % 2) * 6;
        const r2 = 44 + (i % 3) * 6;
        return <line key={i} x1={60 + Math.cos(a) * r1} y1={60 + Math.sin(a) * r1} x2={60 + Math.cos(a) * r2} y2={60 + Math.sin(a) * r2} />;
      })}
    </g>
    <circle cx="60" cy="60" r="14" fill="#fff7ed" opacity="0.85" />
  </svg>
);

/** Cursed Commander sigil: rotating rune circle, crown, brain and lightning. */
export const CommanderSigil: React.FC = () => (
  <svg viewBox="0 0 140 140" className="gh-sigil" aria-hidden="true">
    <circle cx="70" cy="70" r="62" fill="#1a0b2e" opacity="0.65" />
    <g className="gh-sigil__runes">
      <circle cx="70" cy="70" r="56" fill="none" stroke="#c084fc" strokeOpacity="0.55" strokeWidth="1.5" strokeDasharray="2 6" />
      <circle cx="70" cy="70" r="48" fill="none" stroke="#22d3ee" strokeOpacity="0.5" strokeWidth="1.5" />
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2;
        const x = 70 + Math.cos(a) * 52;
        const y = 70 + Math.sin(a) * 52;
        return <path key={i} d={`M${x - 3} ${y}l3 -5 3 5 -3 5z`} fill={i % 2 ? '#22d3ee' : '#c084fc'} />;
      })}
    </g>
    <g className="gh-sigil__crown">
      <path d="M50 44l6 10 7-14 7 14 7-14 7 14 6-10-4 18H54z" fill="#fbbf24" stroke="#0f0820" strokeWidth="2" strokeLinejoin="round" />
    </g>
    <g className="gh-sigil__brain">
      <path
        d="M70 66c-4-6-14-6-17 1-6 1-8 9-4 13-2 7 4 12 10 11 3 5 9 5 11 1 2 4 8 4 11-1 6 1 12-4 10-11 4-4 2-12-4-13-3-7-13-7-17-1z"
        fill="#f0abfc"
        stroke="#0f0820"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="M70 66v28M60 76c3 2 5 2 7 0M74 82c3-2 6-2 8 1M58 86c2-2 5-2 6 0" stroke="#0f0820" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </g>
    <path className="gh-sigil__bolt" d="M104 30l-10 16h8l-8 16 18-22h-9l7-10z" fill="#67e8f9" stroke="#0f0820" strokeWidth="1.5" strokeLinejoin="round" />
    <path className="gh-sigil__bolt gh-sigil__bolt--b" d="M30 92l-6 9h5l-5 10 11-13h-5l4-6z" fill="#c084fc" stroke="#0f0820" strokeWidth="1.2" strokeLinejoin="round" />
  </svg>
);

/** Small radar for the class-battle card: "waits for the teacher". */
export const MiniRadar: React.FC = () => (
  <svg viewBox="0 0 80 80" className="gh-radar" aria-hidden="true">
    {[14, 26, 36].map((r) => <circle key={r} cx="40" cy="40" r={r} fill="none" stroke="#fb7185" strokeOpacity="0.3" strokeWidth="1.2" />)}
    <g className="gh-radar__sweep">
      <path d="M40 40L40 4A36 36 0 0 1 71 22Z" fill="#fb7185" fillOpacity="0.35" />
      <line x1="40" y1="40" x2="40" y2="4" stroke="#fecdd3" strokeWidth="1.8" strokeLinecap="round" />
    </g>
    <circle className="gh-radar__blip" cx="58" cy="26" r="3" fill="#fde68a" />
    <circle cx="40" cy="40" r="4" fill="#fecdd3" />
  </svg>
);
