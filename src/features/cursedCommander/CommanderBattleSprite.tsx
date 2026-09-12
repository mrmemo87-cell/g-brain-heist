import React from 'react';
import type { CommanderPracticeCombatant } from '../../../services/commanderPracticeService';

type Props = {
  combatant: CommanderPracticeCombatant;
  active?: boolean;
  defeated?: boolean;
  className?: string;
};

const colorsFor = (combatant: CommanderPracticeCombatant) => {
  const player = combatant.side === 'player';
  return {
    accent: player ? '#22d3ee' : '#fb7185',
    accent2: player ? '#a78bfa' : '#f59e0b',
    armor: player ? '#0b1f32' : '#26101b',
    armor2: player ? '#142f45' : '#3a1725',
    dark: '#020617',
  };
};

const Head: React.FC<{ accent: string; accent2: string; armor: string; horned?: boolean; visor?: boolean }> = ({ accent, accent2, armor, horned, visor }) => (
  <g>
    {horned && <path d="M48 41 31 18l5 31M92 41l17-23-5 31" fill="#310b16" stroke={accent} strokeWidth="4" strokeLinejoin="round" />}
    <path d="M45 42 53 27h34l9 15-5 35-21 13-21-13Z" fill={armor} stroke={accent} strokeWidth="4" />
    {visor ? (
      <path d="M53 50h34l-6 11H59Z" fill={accent} opacity=".88" />
    ) : (
      <>
        <path d="m54 51 11 4-11 4M86 51l-11 4 11 4" fill="none" stroke={accent2} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="70" cy="42" r="4" fill={accent2} />
      </>
    )}
  </g>
);

const CommanderBody: React.FC<{ accent: string; accent2: string; armor: string; armor2: string; enemy: boolean }> = ({ accent, accent2, armor, armor2, enemy }) => (
  <>
    <Head accent={accent} accent2={accent2} armor={armor} horned={enemy} visor={!enemy} />
    <path d="M42 91 54 80h32l13 12-8 69H48Z" fill={armor2} stroke={accent} strokeWidth="4" />
    <path d="M53 99h34l-4 27-13 9-13-9Z" fill={accent} opacity=".12" stroke={accent2} strokeWidth="2.5" />
    <path d="M47 99 24 117l8 42M94 99l23 18-8 42" fill="none" stroke={accent} strokeWidth="7" strokeLinecap="round" />
    <path d="M57 160 49 204M83 160l8 44" stroke={accent} strokeWidth="8" strokeLinecap="round" />
    <path d="M42 204h20M79 204h20" stroke={accent2} strokeWidth="6" strokeLinecap="round" />
    <circle cx="70" cy="112" r="7" fill={accent2} opacity=".85" />
    <path d="M112 104v52M106 111h12" stroke={accent2} strokeWidth="4" strokeLinecap="round" opacity=".8" />
  </>
);

const GuardBody: React.FC<{ accent: string; accent2: string; armor: string; armor2: string; enemy: boolean }> = ({ accent, accent2, armor, armor2, enemy }) => (
  <>
    <Head accent={accent} accent2={accent2} armor={armor} visor />
    <path d="M33 94 48 79h45l18 15-8 70H39Z" fill={armor2} stroke={accent} strokeWidth="4" />
    <path d="M29 104 12 119v54h24M108 102l19 18-2 53h-22" stroke={accent} strokeWidth="9" strokeLinecap="round" />
    <path d="M49 160 43 205M90 160l7 45" stroke={accent} strokeWidth="10" strokeLinecap="round" />
    <path d="M35 205h25M85 205h27" stroke={accent2} strokeWidth="7" strokeLinecap="round" />
    <path d="M16 109c20 2 31 17 31 38s-11 38-31 44Z" fill={enemy ? '#3c1823' : '#0d3143'} stroke={accent2} strokeWidth="4" />
    <path d="M21 126h17M22 145h20M21 164h17" stroke={accent} strokeWidth="3" strokeLinecap="round" />
    {enemy && <path d="M111 104c17 2 25 14 23 31M115 116l13-6M119 128l14-2M118 141l13 5" stroke={accent2} strokeWidth="4" strokeLinecap="round" />}
  </>
);

const ArcherBody: React.FC<{ accent: string; accent2: string; armor: string; armor2: string; enemy: boolean }> = ({ accent, accent2, armor, armor2, enemy }) => (
  <>
    <path d="M42 47c4-17 14-28 28-34 14 6 24 17 28 34l-7 42H49Z" fill={armor} stroke={accent} strokeWidth="4" />
    <path d="M53 50h34" stroke={accent} strokeWidth="5" strokeLinecap="round" />
    <path d="M44 91 55 80h31l11 11-8 69H51Z" fill={armor2} stroke={accent} strokeWidth="3.5" />
    <path d="M56 158 50 204M82 158l6 46" stroke={accent} strokeWidth="7" strokeLinecap="round" />
    <path d="M43 204h21M78 204h21" stroke={accent2} strokeWidth="5.5" strokeLinecap="round" />
    <path d="M42 103 21 123l11 43M94 102l17 25-5 37" fill="none" stroke={accent} strokeWidth="6" strokeLinecap="round" />
    <path d="M24 78C2 101 3 151 28 176" fill="none" stroke={accent2} strokeWidth="4" strokeLinecap="round" />
    <path d="M25 79 16 126l12 50" fill="none" stroke={accent2} strokeWidth="2.5" />
    <path d="m17 126 72-35" stroke={accent} strokeWidth="3" strokeLinecap="round" />
    <path d="m91 90-10 0 7 8" fill={accent} />
    {enemy && <path d="M95 57 122 39M99 64l25-4" stroke={accent2} strokeWidth="3" strokeLinecap="round" />}
  </>
);

const artFor = (combatant: CommanderPracticeCombatant, colors: ReturnType<typeof colorsFor>) => {
  const enemy = combatant.side === 'enemy';
  if (combatant.role === 'commander') return <CommanderBody {...colors} enemy={enemy} />;
  if (combatant.id.includes('guard') || combatant.name.toLowerCase().includes('revenant')) return <GuardBody {...colors} enemy={enemy} />;
  return <ArcherBody {...colors} enemy={enemy} />;
};

const CommanderBattleSprite: React.FC<Props> = ({ combatant, active = false, defeated = false, className = '' }) => {
  const colors = colorsFor(combatant);
  const player = combatant.side === 'player';
  const mirror = player ? '' : '-scale-x-100';

  return (
    <svg
      aria-hidden
      viewBox="0 0 140 220"
      className={`h-full w-full overflow-visible ${mirror} ${className}`}
      style={{ filter: defeated ? 'grayscale(.85) brightness(.55)' : active ? `drop-shadow(0 0 18px ${colors.accent})` : `drop-shadow(0 0 9px ${colors.accent}55)` }}
    >
      <defs>
        <radialGradient id={`spriteGlow-${combatant.id}`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor={colors.accent} stopOpacity={active ? 0.28 : 0.12} />
          <stop offset="1" stopColor={colors.accent} stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="70" cy="205" rx="48" ry="10" fill={`url(#spriteGlow-${combatant.id})`} />
      <g opacity={defeated ? 0.5 : 1}>{artFor(combatant, colors)}</g>
      {defeated && (
        <g transform="translate(0 12)">
          <rect x="40" y="102" width="60" height="26" rx="6" fill="#020617" fillOpacity=".88" stroke="#ef4444" strokeWidth="2" />
          <text x="70" y="120" textAnchor="middle" fill="#fecaca" fontFamily="system-ui, sans-serif" fontWeight="900" fontSize="15" letterSpacing="3">K.O.</text>
        </g>
      )}
    </svg>
  );
};

export default CommanderBattleSprite;
