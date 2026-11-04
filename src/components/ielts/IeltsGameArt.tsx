import React, { useId } from 'react';
import '../../styles/ielts-game.css';

/**
 * Original animated SVG art for the IELTS course habit loop (Visual & UX Bible 13.6): "Blaze" the streak flame,
 * league shields and badge medals. Pure SVG + CSS animation, no image files or animation libraries. Every animation
 * stops under prefers-reduced-motion. Decorative: callers give the accessible label.
 */

export type BlazeMood = 'happy' | 'sleepy' | 'cheer' | 'frozen';

/** Blaze, the streak flame. Happy when today is done, sleepy while it waits, cheering in celebrations. */
export function Blaze({ mood = 'happy', size = 64, hue }: { mood?: BlazeMood; size?: number; hue?: number }) {
  const id = useId().replace(/:/g, '');
  const tint = typeof hue === 'number' ? { filter: `hue-rotate(${hue}deg) saturate(1.1)` } : undefined;
  const palette = mood === 'frozen'
    ? { outer: ['#bae6fd', '#38bdf8', '#0369a1'], inner: ['#f0f9ff', '#7dd3fc'] }
    : mood === 'sleepy'
      ? { outer: ['#fed7aa', '#fb923c', '#9a3412'], inner: ['#fff7ed', '#fdba74'] }
      : { outer: ['#fde047', '#f97316', '#dc2626'], inner: ['#fffbeb', '#fde047'] };
  return (
    <svg className={`blaze blaze--${mood}`} width={size} height={size} viewBox="0 0 120 120" aria-hidden="true" style={tint}>
      <defs>
        <radialGradient id={`${id}o`} cx="50%" cy="78%" r="70%">
          <stop offset="0%" stopColor={palette.outer[0]} />
          <stop offset="55%" stopColor={palette.outer[1]} />
          <stop offset="100%" stopColor={palette.outer[2]} />
        </radialGradient>
        <radialGradient id={`${id}i`} cx="50%" cy="80%" r="65%">
          <stop offset="0%" stopColor={palette.inner[0]} />
          <stop offset="100%" stopColor={palette.inner[1]} />
        </radialGradient>
      </defs>
      <ellipse className="blaze-shadow" cx="60" cy="112" rx="26" ry="5" />
      <g className="blaze-body">
        {mood === 'cheer' && (
          <g className="blaze-arms">
            <path d="M28 70 Q14 56 18 40" />
            <path d="M92 70 Q106 56 102 40" />
          </g>
        )}
        <path className="blaze-outer" fill={`url(#${id}o)`}
          d="M60 8 C66 26 84 30 88 50 C91 38 89 30 86 24 C100 36 104 56 100 74 C96 96 80 108 60 108 C40 108 24 96 20 74 C16 56 24 40 34 32 C34 42 38 48 42 52 C40 34 48 20 60 8 Z" />
        <path className="blaze-inner" fill={`url(#${id}i)`}
          d="M60 44 C64 56 76 60 78 74 C80 90 70 100 60 100 C50 100 40 92 42 78 C43 70 48 66 50 60 C52 66 55 68 57 69 C55 60 56 52 60 44 Z" />
        <g className="blaze-face">
          {mood === 'sleepy' ? (
            <>
              <path className="blaze-lid" d="M45 74 q5 4 10 0" />
              <path className="blaze-lid" d="M65 74 q5 4 10 0" />
            </>
          ) : (
            <g className="blaze-eyes">
              <ellipse cx="50" cy="73" rx="5.2" ry="6.4" fill="#fff" />
              <ellipse cx="70" cy="73" rx="5.2" ry="6.4" fill="#fff" />
              <circle className="blaze-pupil" cx="51" cy="74.5" r="2.9" fill="#1f2937" />
              <circle className="blaze-pupil" cx="71" cy="74.5" r="2.9" fill="#1f2937" />
              <circle cx="52.2" cy="72.6" r="1" fill="#fff" />
              <circle cx="72.2" cy="72.6" r="1" fill="#fff" />
            </g>
          )}
          <circle cx="42" cy="84" r="3.6" fill="#fb7185" opacity=".45" />
          <circle cx="78" cy="84" r="3.6" fill="#fb7185" opacity=".45" />
          {mood === 'cheer'
            ? <path d="M51 85 q9 11 18 0 z" fill="#7f1d1d" />
            : mood === 'sleepy'
              ? <ellipse cx="60" cy="88" rx="3" ry="2.2" fill="#7c2d12" opacity=".7" />
              : <path d="M52 86 q8 7 16 0" fill="none" stroke="#7c2d12" strokeWidth="2.6" strokeLinecap="round" />}
        </g>
      </g>
      {mood === 'sleepy' && (
        <g className="blaze-z" fill="#64748b" fontWeight="900" fontFamily="system-ui, sans-serif">
          <text x="88" y="34" fontSize="14">z</text>
          <text x="98" y="22" fontSize="10">z</text>
        </g>
      )}
      {mood === 'cheer' && (
        <g className="blaze-sparkles" fill="#fde047">
          <path d="M14 22 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" />
          <path d="M104 16 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" />
          <path d="M108 86 l2 4 4 2 -4 2 -2 4 -2 -4 -4 -2 4 -2z" />
        </g>
      )}
      {mood === 'frozen' && (
        <g className="blaze-frost" fill="none" stroke="#e0f2fe" strokeWidth="2" strokeLinecap="round">
          <path d="M30 40 l8 8 M38 40 l-8 8" />
          <path d="M86 92 l7 7 M93 92 l-7 7" />
        </g>
      )}
    </svg>
  );
}

export const LEAGUE_TIERS = [
  { tier: 1, name: 'Bronze', a: '#fcd9b6', b: '#c2410c', c: '#7c2d12', gem: '#fdba74' },
  { tier: 2, name: 'Silver', a: '#f8fafc', b: '#94a3b8', c: '#334155', gem: '#e2e8f0' },
  { tier: 3, name: 'Gold', a: '#fef9c3', b: '#eab308', c: '#854d0e', gem: '#fde047' },
  { tier: 4, name: 'Sapphire', a: '#dbeafe', b: '#2563eb', c: '#1e3a8a', gem: '#60a5fa' },
  { tier: 5, name: 'Ruby', a: '#ffe4e6', b: '#e11d48', c: '#881337', gem: '#fb7185' },
  { tier: 6, name: 'Emerald', a: '#d1fae5', b: '#059669', c: '#064e3b', gem: '#34d399' },
  { tier: 7, name: 'Amethyst', a: '#ede9fe', b: '#7c3aed', c: '#3b0764', gem: '#c4b5fd' },
  { tier: 8, name: 'Diamond', a: '#ecfeff', b: '#06b6d4', c: '#164e63', gem: '#a5f3fc' },
] as const;

export const leagueTier = (tier: number) => LEAGUE_TIERS[Math.max(1, Math.min(8, tier)) - 1]!;

/** A league shield: a gem in a faceted shield, with a moving shine. Locked tiers are grey outlines. */
export function LeagueShield({ tier, size = 72, locked = false, glow = false }: { tier: number; size?: number; locked?: boolean; glow?: boolean }) {
  const id = useId().replace(/:/g, '');
  const t = leagueTier(tier);
  const gemSides = 3 + ((tier - 1) % 6);
  const gem = Array.from({ length: gemSides }).map((_, i) => {
    const a = (Math.PI * 2 * i) / gemSides - Math.PI / 2;
    return `${60 + Math.cos(a) * 17},${58 + Math.sin(a) * 17}`;
  }).join(' ');
  return (
    <svg className={`shield${locked ? ' shield--locked' : ''}${glow ? ' shield--glow' : ''}`} width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={locked ? '#f1f5f9' : t.a} />
          <stop offset="55%" stopColor={locked ? '#cbd5e1' : t.b} />
          <stop offset="100%" stopColor={locked ? '#94a3b8' : t.c} />
        </linearGradient>
        <linearGradient id={`${id}h`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="50%" stopColor="#fff" stopOpacity=".75" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}c`}><path d="M60 8 L102 22 C102 62 88 94 60 112 C32 94 18 62 18 22 Z" /></clipPath>
      </defs>
      <path d="M60 8 L102 22 C102 62 88 94 60 112 C32 94 18 62 18 22 Z" fill={`url(#${id}s)`} stroke={locked ? '#94a3b8' : t.c} strokeWidth="3" />
      <path d="M60 18 L92 29 C92 61 81 86 60 101 C39 86 28 61 28 29 Z" fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth="2" />
      <polygon points={gem} fill={locked ? '#e2e8f0' : t.gem} stroke="#fff" strokeWidth="2.5" strokeLinejoin="round" className="shield-gem" />
      <polygon points={gem} fill="#fff" opacity=".35" transform="translate(60 58) scale(.45) translate(-60 -58)" />
      {!locked && <rect className="shield-shine" x="-60" y="0" width="40" height="120" fill={`url(#${id}h)`} clipPath={`url(#${id}c)`} transform="skewX(-18)" />}
      {locked && <path d="M52 86 v-6 a8 8 0 0 1 16 0 v6 M49 86 h22 v14 h-22 z" fill="#94a3b8" stroke="#64748b" strokeWidth="2" />}
    </svg>
  );
}

const MEDAL_COLORS: Record<string, [string, string, string]> = {
  streak: ['#fed7aa', '#f97316', '#9a3412'],
  xp: ['#e9d5ff', '#8b5cf6', '#4c1d95'],
  perfect: ['#bbf7d0', '#10b981', '#065f46'],
  units: ['#bfdbfe', '#3b82f6', '#1e3a8a'],
  league: ['#fef08a', '#eab308', '#713f12'],
};

function MedalGlyph({ family }: { family: string }) {
  switch (family) {
    case 'streak': return <path d="M60 36 C64 46 74 48 74 60 C74 70 67 76 60 76 C53 76 46 70 46 61 C46 55 50 52 52 48 C53 53 55 55 57 56 C56 49 57 42 60 36 Z" fill="#fff" />;
    case 'xp': return <path d="M60 36 l6 13 14 2 -10 10 2 14 -12 -7 -12 7 2 -14 -10 -10 14 -2z" fill="#fff" />;
    case 'perfect': return <g fill="none" stroke="#fff" strokeWidth="4"><circle cx="60" cy="56" r="17" /><circle cx="60" cy="56" r="8" /><circle cx="60" cy="56" r="1.5" fill="#fff" /></g>;
    case 'units': return <path d="M48 76 V36 M48 38 h24 l-6 8 6 8 h-24" fill="#fff" stroke="#fff" strokeWidth="4" strokeLinejoin="round" />;
    default: return <path d="M42 70 l4 -26 10 12 4 -16 4 16 10 -12 4 26 z" fill="#fff" />;
  }
}

/** A badge medal on a ribbon. Unearned medals are grey with a progress ring. */
export function BadgeMedal({ family, earned, progress = 0, size = 64, label }: { family: string; earned: boolean; progress?: number; size?: number; label?: string }) {
  const id = useId().replace(/:/g, '');
  const [a, b, c] = earned ? (MEDAL_COLORS[family] ?? MEDAL_COLORS.xp) : ['#f1f5f9', '#cbd5e1', '#94a3b8'];
  const ring = 2 * Math.PI * 30;
  return (
    <svg className={`medal${earned ? ' medal--earned' : ''}`} width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}m`} cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor={a} />
          <stop offset="60%" stopColor={b} />
          <stop offset="100%" stopColor={c} />
        </radialGradient>
      </defs>
      <path d="M44 84 L34 114 L48 106 L56 118 L62 88 Z" fill={earned ? c : '#cbd5e1'} />
      <path d="M76 84 L86 114 L72 106 L64 118 L58 88 Z" fill={earned ? b : '#e2e8f0'} />
      <circle cx="60" cy="56" r="38" fill={`url(#${id}m)`} stroke="#fff" strokeWidth="4" />
      {!earned && progress > 0 && (
        <circle cx="60" cy="56" r="30" fill="none" stroke="#f59e0b" strokeWidth="5" strokeLinecap="round"
          strokeDasharray={ring} strokeDashoffset={ring * (1 - Math.min(1, progress))} transform="rotate(-90 60 56)" />
      )}
      <g opacity={earned ? 1 : .7}><MedalGlyph family={family} /></g>
      {label && <text x="60" y="94" textAnchor="middle" fontSize="11" fontWeight="900" fill="#fff" fontFamily="system-ui, sans-serif">{label}</text>}
      {earned && <circle className="medal-glint" cx="40" cy="36" r="5" fill="#fff" />}
    </svg>
  );
}

/** A tiny round avatar for the leaderboard: a Blaze tinted by a stable per-learner hue. */
export function LeagueAvatar({ hue, me }: { hue: number; me?: boolean }) {
  return <span className={`league-avatar${me ? ' is-me' : ''}`} style={{ background: `hsl(${hue} 85% 94%)` }}><Blaze size={34} hue={hue} mood="happy" /></span>;
}
