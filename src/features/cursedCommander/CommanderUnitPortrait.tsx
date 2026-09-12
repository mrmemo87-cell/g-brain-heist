import React from 'react';
import type { CommanderPracticeCombatant } from '../../../services/commanderPracticeService';

type CommanderUnitPortraitProps = {
  combatant: CommanderPracticeCombatant;
  instance?: string;
  defeated?: boolean;
  className?: string;
};

const safeId = (value: string) => value.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();

const CipherCommander = ({ accent, secondary }: { accent: string; secondary: string }) => (
  <>
    <path d="M33 42 47 24h26l14 18-4 35-23 17-23-17Z" fill="#071525" stroke={accent} strokeWidth="3" />
    <path d="M42 45h36l-3 19-15 8-15-8Z" fill="#0e2638" stroke={secondary} strokeOpacity=".7" />
    <path d="M45 48h30l-5 9H50Z" fill={accent} opacity=".88" />
    <path d="M52 78h16M60 71v14" stroke={secondary} strokeWidth="3" strokeLinecap="round" />
    <circle cx="60" cy="19" r="6" fill={secondary} />
    <path d="M60 25v8M31 52l-10 8 13 7M89 52l10 8-13 7" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

const NeonGuard = ({ accent, secondary }: { accent: string; secondary: string }) => (
  <>
    <path d="M28 91V58l14-17h36l14 17v33Z" fill="#081724" stroke={accent} strokeWidth="3" />
    <path d="M43 40 50 24h20l7 16-17 12Z" fill="#10293b" stroke={secondary} strokeWidth="2.5" />
    <path d="M50 30h20" stroke={accent} strokeWidth="5" strokeLinecap="round" />
    <path d="M37 57h46v28H37Z" fill="#0d2434" stroke={secondary} strokeOpacity=".75" />
    <path d="M60 55 76 63v14L60 88 44 77V63Z" fill={accent} opacity=".15" stroke={accent} strokeWidth="2.5" />
    <path d="m53 69 5 5 10-12" fill="none" stroke={secondary} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M28 62 16 69v17h13M92 62l12 7v17H91" stroke={accent} strokeWidth="4" strokeLinecap="round" />
  </>
);

const ShadeArcher = ({ accent, secondary }: { accent: string; secondary: string }) => (
  <>
    <path d="M35 91 30 61c2-21 13-35 30-40 17 5 28 19 30 40l-5 30Z" fill="#080f20" stroke={accent} strokeWidth="3" />
    <path d="M42 51c4-12 10-18 18-21 8 3 14 9 18 21l-8 23H50Z" fill="#101a2d" stroke={secondary} strokeOpacity=".8" />
    <path d="M49 54h22" stroke={accent} strokeWidth="4" strokeLinecap="round" />
    <path d="M28 40C10 53 10 76 28 90M28 40l-7 25 7 25" fill="none" stroke={secondary} strokeWidth="3" strokeLinecap="round" />
    <path d="m18 65 45-18" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
    <path d="m64 47-9-1 6 7" fill={accent} />
    <path d="M44 81h32" stroke={secondary} strokeWidth="2" strokeDasharray="4 4" opacity=".7" />
  </>
);

const WardenNull = ({ accent, secondary }: { accent: string; secondary: string }) => (
  <>
    <path d="m39 36-14-18 4 27M81 36l14-18-4 27" fill="#2a0812" stroke={accent} strokeWidth="3" strokeLinejoin="round" />
    <path d="M31 42 42 25h36l11 17-6 38-23 15-23-15Z" fill="#230914" stroke={accent} strokeWidth="3.5" />
    <path d="M41 46h38l-5 16-14 8-14-8Z" fill="#3b0b16" stroke={secondary} strokeOpacity=".85" />
    <path d="m45 51 11 4-11 4M75 51l-11 4 11 4" fill="none" stroke={secondary} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M51 77h18l-4 8H55Z" fill={accent} opacity=".7" />
    <path d="M34 67 21 76M86 67l13 9" stroke={accent} strokeWidth="4" strokeLinecap="round" />
    <circle cx="60" cy="37" r="4" fill={secondary} />
  </>
);

const IronRevenant = ({ accent, secondary }: { accent: string; secondary: string }) => (
  <>
    <path d="M29 91V58l12-18h32l18 17 3 34Z" fill="#11131b" stroke={accent} strokeWidth="3" />
    <path d="M41 42 46 24h25l8 14-8 25H49Z" fill="#1d2430" stroke={secondary} strokeOpacity=".8" />
    <path d="M49 35h22l-3 8H52Z" fill={accent} opacity=".9" />
    <circle cx="48" cy="72" r="10" fill="#141a24" stroke={secondary} strokeWidth="2.5" />
    <path d="M82 51c16 5 24 16 22 32M84 61l12-7M90 70l13-3M91 79l12 3" stroke={accent} strokeWidth="4" strokeLinecap="round" />
    <path d="M38 82h43" stroke={secondary} strokeWidth="3" opacity=".7" />
    <path d="M63 64v18" stroke={accent} strokeWidth="3" strokeDasharray="4 4" />
  </>
);

const HollowRanger = ({ accent, secondary }: { accent: string; secondary: string }) => (
  <>
    <path d="M26 91c3-29 9-50 34-67 25 17 31 38 34 67Z" fill="#070b14" stroke={accent} strokeWidth="3" />
    <path d="M40 47c5-13 11-20 20-24 9 4 15 11 20 24l-7 29H47Z" fill="#0c1320" stroke={secondary} strokeOpacity=".65" />
    <path d="M46 52h28" stroke={accent} strokeWidth="4" strokeLinecap="round" />
    <path d="m52 61 8 4 8-4" fill="none" stroke={secondary} strokeWidth="2" />
    <path d="M33 80h54" stroke={accent} strokeOpacity=".5" strokeWidth="2" />
    <path d="M79 40 98 27M82 45l18-4" stroke={secondary} strokeWidth="3" strokeLinecap="round" />
    <path d="m96 26 8-2-4 8" fill={accent} />
    <circle cx="60" cy="52" r="19" fill="none" stroke={accent} strokeOpacity=".17" strokeDasharray="5 7" />
  </>
);

const portraitArt = (combatant: CommanderPracticeCombatant, accent: string, secondary: string) => {
  switch (combatant.id) {
    case 'player_commander': return <CipherCommander accent={accent} secondary={secondary} />;
    case 'player_guard': return <NeonGuard accent={accent} secondary={secondary} />;
    case 'player_archer': return <ShadeArcher accent={accent} secondary={secondary} />;
    case 'enemy_commander': return <WardenNull accent={accent} secondary={secondary} />;
    case 'enemy_guard': return <IronRevenant accent={accent} secondary={secondary} />;
    case 'enemy_archer': return <HollowRanger accent={accent} secondary={secondary} />;
    default: return combatant.role === 'commander'
      ? <CipherCommander accent={accent} secondary={secondary} />
      : <NeonGuard accent={accent} secondary={secondary} />;
  }
};

const CommanderUnitPortrait: React.FC<CommanderUnitPortraitProps> = ({
  combatant,
  instance = 'field',
  defeated = false,
  className = '',
}) => {
  const player = combatant.side === 'player';
  const accent = player ? '#22d3ee' : '#fb7185';
  const secondary = player ? '#a78bfa' : '#fbbf24';
  const id = `${safeId(instance)}-${safeId(combatant.id)}`;

  return (
    <svg
      aria-hidden
      viewBox="0 0 120 120"
      className={`h-full w-full overflow-visible ${className}`}
    >
      <defs>
        <radialGradient id={`${id}-bg`} cx="50%" cy="38%" r="70%">
          <stop offset="0" stopColor={accent} stopOpacity=".22" />
          <stop offset=".55" stopColor={player ? '#172554' : '#3b0a28'} stopOpacity=".48" />
          <stop offset="1" stopColor="#020617" stopOpacity=".96" />
        </radialGradient>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={accent} />
          <stop offset="1" stopColor={secondary} />
        </linearGradient>
        <filter id={`${id}-glow`} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <circle cx="60" cy="60" r="53" fill={`url(#${id}-bg)`} stroke={`url(#${id}-rim)`} strokeWidth="1.8" opacity={defeated ? 0.38 : 1} />
      <circle cx="60" cy="60" r="47" fill="none" stroke={accent} strokeOpacity=".13" strokeDasharray="3 8" />
      <g opacity={defeated ? 0.34 : 1} filter={defeated ? undefined : `url(#${id}-glow)`}>
        {portraitArt(combatant, accent, secondary)}
      </g>

      {defeated && (
        <g>
          <path d="M20 34 100 86M18 48l78 51M29 22l76 51" stroke="#ef4444" strokeOpacity=".22" strokeWidth="2" />
          <rect x="27" y="49" width="66" height="24" rx="5" fill="#020617" fillOpacity=".9" stroke="#ef4444" strokeWidth="2" />
          <text x="60" y="66" textAnchor="middle" fill="#fca5a5" fontFamily="system-ui, sans-serif" fontWeight="900" fontSize="16" letterSpacing="3">K.O.</text>
        </g>
      )}
    </svg>
  );
};

export default CommanderUnitPortrait;
