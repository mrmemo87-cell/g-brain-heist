import React from 'react';
import type {
  CommanderPracticeCombatant,
  CommanderPracticeStatus,
} from '../../../services/commanderPracticeService';
import type { CommanderCinematicStep } from './commanderCinematicPlayback';
import {
  commanderEventText,
  type CommanderCopy,
  type CommanderLanguage,
} from './commanderPracticeCopy';

export type CommanderPlaybackPhase = 'windup' | 'impact' | 'settle' | null;

type Props = {
  combatants: CommanderPracticeCombatant[];
  selectedTargetId: string | null;
  playerFocusTarget: string | null;
  enemyFocusTarget: string | null;
  activeStep: CommanderCinematicStep | null;
  phase: CommanderPlaybackPhase;
  status: CommanderPracticeStatus;
  targetable: boolean;
  animationsOn: boolean;
  effectsOn: boolean;
  speed: 1 | 2;
  language: CommanderLanguage;
  copy: CommanderCopy;
  onSelectTarget: (id: string) => void;
  onToggleAnimations: () => void;
  onToggleEffects: () => void;
  onToggleSpeed: () => void;
};

const hpPercent = (combatant: CommanderPracticeCombatant) =>
  Math.max(0, Math.min(100, Math.round((combatant.hp / combatant.maxHp) * 100)));

const unitEmoji = (combatant: CommanderPracticeCombatant) => {
  const id = combatant.id.toLowerCase();
  const name = combatant.name.toLowerCase();
  if (combatant.role === 'commander') return combatant.side === 'player' ? '🤖' : '👹';
  if (id.includes('guard') || name.includes('guard') || name.includes('revenant')) return combatant.side === 'player' ? '🛡️' : '🦾';
  if (id.includes('archer') || name.includes('archer') || name.includes('ranger')) return combatant.side === 'player' ? '🏹' : '🥷';
  return combatant.side === 'player' ? '⚔️' : '🗡️';
};

const eventGlyph = (step: CommanderCinematicStep | null) => {
  switch (step?.event.code) {
    case 'focus_target': return '🎯';
    case 'death_bolt': return '☄️';
    case 'guard': return '🛡️';
    case 'unit_attack': return '⚡';
    case 'combatant_defeated': return '💥';
    case 'battle_victory': return '🏆';
    case 'battle_defeat': return '☠️';
    case 'battle_draw': return '⚖️';
    default: return '⚔️';
  }
};

const ArenaBackdrop = () => (
  <svg
    aria-hidden
    className="pointer-events-none absolute inset-0 h-full w-full"
    viewBox="0 0 1200 520"
    preserveAspectRatio="none"
  >
    <defs>
      <linearGradient id="ccSky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#07152a" />
        <stop offset="0.54" stopColor="#0b1430" />
        <stop offset="1" stopColor="#020617" />
      </linearGradient>
      <linearGradient id="ccHorizon" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#22d3ee" stopOpacity="0.8" />
        <stop offset="0.5" stopColor="#8b5cf6" stopOpacity="0.95" />
        <stop offset="1" stopColor="#ec4899" stopOpacity="0.8" />
      </linearGradient>
      <linearGradient id="ccFloor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#111c35" stopOpacity="0.48" />
        <stop offset="1" stopColor="#020617" stopOpacity="0.96" />
      </linearGradient>
      <radialGradient id="ccMoon">
        <stop offset="0" stopColor="#c4b5fd" stopOpacity="0.75" />
        <stop offset="0.45" stopColor="#8b5cf6" stopOpacity="0.24" />
        <stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
      </radialGradient>
      <filter id="ccGlow" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation="7" result="blur" />
        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>

    <rect width="1200" height="520" fill="url(#ccSky)" />
    <circle cx="600" cy="100" r="150" fill="url(#ccMoon)" />
    <path d="M0 280 L120 175 L205 250 L325 128 L420 258 L560 180 L660 256 L790 142 L915 258 L1040 185 L1200 278 V330 H0Z" fill="#091225" opacity="0.95" />
    <path d="M0 300 L150 248 L260 282 L390 226 L510 292 L650 246 L790 296 L930 235 L1080 282 L1200 250 V338 H0Z" fill="#050c19" opacity="0.92" />

    <g opacity="0.78">
      <rect x="72" y="208" width="28" height="96" fill="#0f2640" />
      <rect x="108" y="238" width="18" height="66" fill="#0f2640" />
      <rect x="171" y="225" width="34" height="80" fill="#11263d" />
      <rect x="1000" y="214" width="34" height="92" fill="#2d1028" />
      <rect x="1044" y="246" width="20" height="60" fill="#2d1028" />
      <rect x="1106" y="224" width="29" height="82" fill="#321026" />
      <path d="M86 208 V172 H95 V208M1020 214 V174 H1029 V214" stroke="url(#ccHorizon)" strokeWidth="3" />
    </g>

    <line x1="0" y1="306" x2="1200" y2="306" stroke="url(#ccHorizon)" strokeWidth="2" filter="url(#ccGlow)" />
    <rect y="307" width="1200" height="213" fill="url(#ccFloor)" />

    <g stroke="#38bdf8" strokeOpacity="0.12" strokeWidth="1">
      <path d="M600 307 L120 520M600 307 L300 520M600 307 L480 520M600 307 L720 520M600 307 L900 520M600 307 L1080 520" />
      <path d="M80 350 H1120M25 395 H1175M0 455 H1200" />
    </g>

    <g opacity="0.7" filter="url(#ccGlow)">
      <circle cx="105" cy="292" r="3" fill="#22d3ee" />
      <circle cx="190" cy="270" r="2" fill="#67e8f9" />
      <circle cx="1010" cy="291" r="3" fill="#ec4899" />
      <circle cx="1087" cy="267" r="2" fill="#f9a8d4" />
      <circle cx="604" cy="307" r="4" fill="#c4b5fd" />
    </g>
  </svg>
);

const UnitAura: React.FC<{ side: 'player' | 'enemy'; selected: boolean; focused: boolean; shield: number }> = ({ side, selected, focused, shield }) => (
  <svg aria-hidden className="pointer-events-none absolute -inset-5 h-[calc(100%+2.5rem)] w-[calc(100%+2.5rem)]" viewBox="0 0 180 180">
    <defs>
      <linearGradient id={`ccAura-${side}`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={side === 'player' ? '#22d3ee' : '#fb7185'} />
        <stop offset="1" stopColor={side === 'player' ? '#8b5cf6' : '#ec4899'} />
      </linearGradient>
    </defs>
    <ellipse cx="90" cy="150" rx="58" ry="15" fill="none" stroke={`url(#ccAura-${side})`} strokeWidth={selected ? 4 : 2} opacity={selected ? 1 : 0.45} className="cc-arena-ring" />
    {shield > 0 && <path d="M90 22 C132 22 151 45 151 82 C151 118 127 137 90 148 C53 137 29 118 29 82 C29 45 48 22 90 22Z" fill={side === 'player' ? '#22d3ee' : '#f472b6'} opacity="0.055" stroke={side === 'player' ? '#67e8f9' : '#f9a8d4'} strokeOpacity="0.28" />}
    {focused && <g className="cc-focus-reticle" stroke="#fbbf24" fill="none" strokeWidth="3">
      <circle cx="90" cy="70" r="35" strokeDasharray="9 8" />
      <path d="M90 24 V39M90 101 V116M44 70 H59M121 70 H136" />
    </g>}
  </svg>
);

const Projectile: React.FC<{ step: CommanderCinematicStep; phase: CommanderPlaybackPhase }> = ({ step, phase }) => {
  if (step.kind !== 'attack' || phase === 'settle') return null;
  const player = step.event.side === 'player';
  const deathBolt = step.event.code === 'death_bolt';
  return (
    <div
      aria-hidden
      key={`${step.id}-${phase}`}
      className={`pointer-events-none absolute top-[46%] z-30 ${player ? 'cc-shot-player' : 'cc-shot-enemy'} ${deathBolt ? 'cc-death-bolt-shot' : 'cc-normal-shot'}`}
    >
      <svg width={deathBolt ? 96 : 68} height={deathBolt ? 54 : 36} viewBox="0 0 96 54">
        <defs>
          <radialGradient id="ccBoltCore">
            <stop offset="0" stopColor="#fff" />
            <stop offset="0.3" stopColor={player ? '#67e8f9' : '#fda4af'} />
            <stop offset="1" stopColor={deathBolt ? '#a855f7' : player ? '#0ea5e9' : '#e11d48'} stopOpacity="0" />
          </radialGradient>
          <filter id="ccBoltGlow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="4" /></filter>
        </defs>
        <path d="M5 27 C25 8 52 8 82 27 C52 46 25 46 5 27Z" fill={deathBolt ? '#8b5cf6' : player ? '#38bdf8' : '#fb7185'} opacity="0.32" filter="url(#ccBoltGlow)" />
        <path d="M4 27 H71" stroke={deathBolt ? '#c4b5fd' : player ? '#67e8f9' : '#fda4af'} strokeWidth={deathBolt ? 6 : 3} strokeLinecap="round" />
        <circle cx="76" cy="27" r={deathBolt ? 18 : 10} fill="url(#ccBoltCore)" />
      </svg>
    </div>
  );
};

const CommanderCinematicBattlefield: React.FC<Props> = ({
  combatants,
  selectedTargetId,
  playerFocusTarget,
  enemyFocusTarget,
  activeStep,
  phase,
  status,
  targetable,
  animationsOn,
  effectsOn,
  speed,
  language,
  copy,
  onSelectTarget,
  onToggleAnimations,
  onToggleEffects,
  onToggleSpeed,
}) => {
  const players = combatants.filter((combatant) => combatant.side === 'player');
  const enemies = combatants.filter((combatant) => combatant.side === 'enemy');
  const isDeathBoltImpact = effectsOn && activeStep?.event.code === 'death_bolt' && phase === 'impact';
  const outcomeLabel = status === 'victory' ? copy.victory : status === 'defeat' ? copy.defeat : status === 'draw' ? copy.draw : null;

  const unit = (combatant: CommanderPracticeCombatant) => {
    const selected = combatant.side === 'enemy' && selectedTargetId === combatant.id;
    const focused = combatant.side === 'enemy' ? playerFocusTarget === combatant.id : enemyFocusTarget === combatant.id;
    const actor = activeStep?.event.actorName === combatant.name;
    const target = activeStep?.event.targetName === combatant.name;
    const defeat = activeStep?.kind === 'defeat' && activeStep.event.actorName === combatant.name;
    const guard = activeStep?.kind === 'guard' && activeStep.event.actorName === combatant.name;
    const focusLock = activeStep?.kind === 'focus_lock' && activeStep.event.targetName === combatant.name;
    const canTarget = combatant.side === 'enemy' && targetable && combatant.hp > 0;
    const impactTarget = target && phase === 'impact';
    const impactGuard = guard && phase === 'impact';

    const actorMotion = actor && animationsOn
      ? activeStep?.kind === 'attack'
        ? combatant.side === 'player' ? 'cc-lunge-player' : 'cc-lunge-enemy'
        : guard ? 'cc-guard-cast' : ''
      : '';

    return (
      <button
        type="button"
        key={combatant.id}
        disabled={!canTarget}
        onClick={() => canTarget && onSelectTarget(combatant.id)}
        className={`relative z-20 min-w-0 rounded-2xl border px-2 py-3 text-center transition-all duration-300 ${
          combatant.hp <= 0
            ? 'border-slate-800/70 bg-slate-950/60 opacity-35 grayscale'
            : selected
              ? 'border-amber-300/90 bg-amber-300/[0.08] shadow-[0_0_34px_rgba(251,191,36,0.28)]'
              : combatant.side === 'player'
                ? 'border-cyan-400/25 bg-cyan-400/[0.055]'
                : 'border-fuchsia-400/25 bg-fuchsia-400/[0.055]'
        } ${actorMotion} ${impactTarget && animationsOn ? 'cc-impact-hit' : ''} ${defeat && animationsOn ? 'cc-unit-defeat' : ''} ${focusLock && animationsOn ? 'cc-focus-lock-hit' : ''} ${canTarget ? 'cursor-pointer hover:-translate-y-1 hover:brightness-125' : 'cursor-default'}`}
        aria-label={`${combatant.name}${selected ? `, ${copy.selected}` : ''}`}
      >
        <UnitAura side={combatant.side} selected={selected} focused={focused || focusLock} shield={combatant.shield} />
        {selected && combatant.hp > 0 && <span className="absolute -top-2 start-1/2 z-30 -translate-x-1/2 rounded-full bg-amber-300 px-2 py-0.5 text-[9px] font-black uppercase text-slate-950 shadow-lg">{copy.selected}</span>}
        {combatant.role === 'commander' && <span className="absolute start-2 top-2 z-30 rounded-full border border-violet-300/30 bg-slate-950/65 px-1.5 py-0.5 text-[8px] font-black text-violet-100">CMD</span>}

        <div className="relative mx-auto mt-2 flex h-16 w-16 items-center justify-center sm:h-20 sm:w-20">
          <div aria-hidden className={`absolute inset-1 rounded-full blur-xl ${combatant.side === 'player' ? 'bg-cyan-400/16' : 'bg-fuchsia-500/16'}`} />
          <span aria-hidden className="relative z-10 text-4xl drop-shadow-[0_0_16px_rgba(255,255,255,0.18)] sm:text-5xl">{unitEmoji(combatant)}</span>
          {guard && effectsOn && phase !== 'settle' && <span aria-hidden className="cc-shield-bloom absolute inset-0 rounded-full border-2 border-cyan-200/70 bg-cyan-300/10 shadow-[0_0_30px_rgba(34,211,238,0.55)]" />}
        </div>

        <div className="relative z-10 mt-1 truncate text-[10px] font-black text-white sm:text-xs">{combatant.name}</div>
        {combatant.hp <= 0 ? (
          <div className="relative z-10 mt-2 text-[9px] font-black uppercase tracking-wider text-slate-500">{copy.knockedOut}</div>
        ) : (
          <>
            <div className="relative z-10 mt-2 flex items-center justify-between gap-1 text-[8px] font-bold sm:text-[10px]">
              <span className="text-emerald-100">{copy.hp} {combatant.hp}/{combatant.maxHp}</span>
              <span className="text-sky-200">◇ {combatant.shield}</span>
            </div>
            <div className="relative z-10 mt-1 h-1.5 overflow-hidden rounded-full bg-slate-900 ring-1 ring-white/5">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 transition-[width] duration-500 ease-out" style={{ width: `${hpPercent(combatant)}%` }} />
            </div>
            <div className="relative z-10 mt-1 h-1 overflow-hidden rounded-full bg-slate-900 ring-1 ring-white/5">
              <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-200 transition-[width] duration-500 ease-out" style={{ width: `${Math.min(100, (combatant.shield / 30) * 100)}%` }} />
            </div>
          </>
        )}

        {impactTarget && activeStep?.kind === 'attack' && (
          <div key={`${activeStep.id}-damage`} className="pointer-events-none absolute inset-x-0 -top-12 z-40 flex flex-col items-center gap-0.5">
            {activeStep.shieldDamage > 0 && <span className="cc-damage-float rounded-full border border-sky-300/30 bg-sky-950/90 px-2 py-0.5 text-[10px] font-black text-sky-200 shadow-lg">◇ -{activeStep.shieldDamage} {copy.shield}</span>}
            {activeStep.hpDamage > 0 && <span className={`cc-damage-float font-heading text-xl font-black ${activeStep.event.code === 'death_bolt' ? 'text-fuchsia-200 drop-shadow-[0_0_12px_rgba(217,70,239,0.9)]' : 'text-rose-300'}`}>-{activeStep.hpDamage}</span>}
          </div>
        )}

        {impactGuard && (
          <span key={`${activeStep?.id}-guard`} className="cc-damage-float pointer-events-none absolute inset-x-0 -top-7 z-40 text-xs font-black text-cyan-200">◇ +{activeStep?.event.amount ?? 0} {copy.shield}</span>
        )}
      </button>
    );
  };

  return (
    <section className={`relative overflow-hidden rounded-[2rem] border border-cyan-400/30 bg-[#020617] shadow-[0_0_65px_rgba(34,211,238,0.12)] ${isDeathBoltImpact && animationsOn ? 'cc-arena-impact' : ''}`}>
      <style>{`
        @keyframes ccAmbientDrift { 0%,100% { transform: translate3d(0,0,0); opacity:.18 } 50% { transform: translate3d(18px,-10px,0); opacity:.34 } }
        @keyframes ccRingPulse { 0%,100% { opacity:.35; transform:scale(.96) } 50% { opacity:.9; transform:scale(1.04) } }
        @keyframes ccFocusSpin { to { transform-origin:90px 70px; transform:rotate(360deg) } }
        @keyframes ccLungePlayer { 0%,100% { transform:translateX(0) scale(1) } 40% { transform:translateX(18px) scale(1.055) } 58% { transform:translateX(13px) scale(1.03) } }
        @keyframes ccLungeEnemy { 0%,100% { transform:translateX(0) scale(1) } 40% { transform:translateX(-18px) scale(1.055) } 58% { transform:translateX(-13px) scale(1.03) } }
        @keyframes ccImpactHit { 0%,100% { transform:translateX(0); filter:brightness(1) } 20% { transform:translateX(-6px); filter:brightness(1.8) } 42% { transform:translateX(5px) } 62% { transform:translateX(-3px) } }
        @keyframes ccGuardCast { 0%,100% { transform:scale(1) } 48% { transform:scale(1.06); filter:brightness(1.3) } }
        @keyframes ccShieldBloom { 0% { transform:scale(.5); opacity:0 } 55% { transform:scale(1.12); opacity:1 } 100% { transform:scale(1.25); opacity:0 } }
        @keyframes ccShotPlayer { 0% { left:24%; opacity:0; transform:scale(.7) } 18% { opacity:1 } 88% { opacity:1 } 100% { left:67%; opacity:0; transform:scale(1.2) } }
        @keyframes ccShotEnemy { 0% { left:67%; opacity:0; transform:scale(.7) } 18% { opacity:1 } 88% { opacity:1 } 100% { left:24%; opacity:0; transform:scale(1.2) } }
        @keyframes ccDamageFloat { 0% { opacity:0; transform:translateY(10px) scale(.78) } 20% { opacity:1; transform:translateY(0) scale(1.12) } 100% { opacity:0; transform:translateY(-24px) scale(1) } }
        @keyframes ccUnitDefeat { 0% { opacity:1; transform:translateY(0) scale(1) } 55% { opacity:.75; transform:translateY(5px) rotate(2deg) scale(.96) } 100% { opacity:.35; transform:translateY(12px) scale(.88); filter:grayscale(1) } }
        @keyframes ccFocusLockHit { 0% { filter:brightness(1) } 45% { filter:brightness(1.8) drop-shadow(0 0 16px rgba(251,191,36,.7)) } 100% { filter:brightness(1) } }
        @keyframes ccArenaImpact { 0%,100% { transform:translateX(0) } 25% { transform:translateX(-2px) } 50% { transform:translateX(2px) } 75% { transform:translateX(-1px) } }
        .cc-arena-ring { animation:ccRingPulse 3.2s ease-in-out infinite; transform-origin:center; }
        .cc-focus-reticle { animation:ccFocusSpin 5s linear infinite; }
        .cc-lunge-player { animation:ccLungePlayer 700ms cubic-bezier(.2,.8,.2,1); }
        .cc-lunge-enemy { animation:ccLungeEnemy 700ms cubic-bezier(.2,.8,.2,1); }
        .cc-impact-hit { animation:ccImpactHit 520ms ease-out; }
        .cc-guard-cast { animation:ccGuardCast 720ms ease-in-out; }
        .cc-shield-bloom { animation:ccShieldBloom 760ms ease-out forwards; }
        .cc-shot-player { animation:ccShotPlayer 620ms cubic-bezier(.2,.75,.2,1) forwards; }
        .cc-shot-enemy { animation:ccShotEnemy 620ms cubic-bezier(.2,.75,.2,1) forwards; }
        .cc-death-bolt-shot { filter:drop-shadow(0 0 16px rgba(168,85,247,.85)); }
        .cc-normal-shot { filter:drop-shadow(0 0 10px rgba(56,189,248,.75)); }
        .cc-damage-float { animation:ccDamageFloat 900ms ease-out forwards; }
        .cc-unit-defeat { animation:ccUnitDefeat 800ms ease-out forwards; }
        .cc-focus-lock-hit { animation:ccFocusLockHit 700ms ease-out; }
        .cc-arena-impact { animation:ccArenaImpact 180ms linear; }
        @media (prefers-reduced-motion: reduce) {
          .cc-arena-ring,.cc-focus-reticle,.cc-lunge-player,.cc-lunge-enemy,.cc-impact-hit,.cc-guard-cast,.cc-shield-bloom,.cc-shot-player,.cc-shot-enemy,.cc-damage-float,.cc-unit-defeat,.cc-focus-lock-hit,.cc-arena-impact { animation:none !important; }
        }
      `}</style>

      <ArenaBackdrop />
      {effectsOn && (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <span className="absolute left-[12%] top-[32%] h-28 w-28 rounded-full bg-cyan-400/10 blur-3xl [animation:ccAmbientDrift_5s_ease-in-out_infinite]" />
          <span className="absolute right-[11%] top-[35%] h-28 w-28 rounded-full bg-fuchsia-500/10 blur-3xl [animation:ccAmbientDrift_6s_ease-in-out_infinite_reverse]" />
          <span className="absolute left-[47%] top-[24%] h-20 w-20 rounded-full bg-violet-500/10 blur-3xl [animation:ccAmbientDrift_4.5s_ease-in-out_infinite]" />
        </div>
      )}

      <div className="relative z-10 border-b border-white/5 bg-slate-950/38 px-4 py-3 backdrop-blur-sm sm:flex sm:items-center sm:justify-between sm:gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span aria-hidden className="text-lg">⚔️</span>
            <h2 className="font-heading text-sm font-black uppercase tracking-[0.14em] text-cyan-100">{copy.battlefield}</h2>
            <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-200">● LIVE</span>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">{copy.battlefieldHint}</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 sm:mt-0" dir="ltr">
          <button type="button" onClick={onToggleAnimations} className={`rounded-full border px-2.5 py-1 text-[10px] font-bold transition ${animationsOn ? 'border-emerald-400/35 bg-emerald-400/10 text-emerald-200' : 'border-slate-700 bg-slate-950/50 text-slate-500'}`}>{animationsOn ? '●' : '○'} {copy.animations}</button>
          <button type="button" onClick={onToggleEffects} className={`rounded-full border px-2.5 py-1 text-[10px] font-bold transition ${effectsOn ? 'border-cyan-400/35 bg-cyan-400/10 text-cyan-200' : 'border-slate-700 bg-slate-950/50 text-slate-500'}`}>✦ {copy.effects}</button>
          <button type="button" onClick={onToggleSpeed} className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2.5 py-1 text-[10px] font-bold text-violet-200">{copy.speed} {speed}×</button>
        </div>
      </div>

      <div className="relative z-10 min-h-[430px] px-3 pb-4 pt-3 sm:min-h-[470px] sm:px-5 sm:pb-5" dir="ltr">
        <div className="mb-3 grid grid-cols-2 text-[9px] font-black uppercase tracking-[0.18em] sm:text-[10px]">
          <span className="text-cyan-300">◀ {copy.you}</span>
          <span className="text-right text-fuchsia-300">{targetable ? `🎯 ${copy.selectTarget}` : copy.enemy} ▶</span>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_150px_minmax(0,1fr)] lg:items-center">
          <div className="order-3 grid grid-cols-3 gap-2 lg:order-1">{players.map(unit)}</div>

          <div className="order-2 relative flex min-h-24 items-center justify-center lg:min-h-48" aria-live="polite">
            <div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-cyan-300/15 via-violet-300/90 to-fuchsia-300/15" />
            <div className={`relative z-20 flex h-14 w-14 items-center justify-center rounded-full border text-2xl backdrop-blur-md transition-all ${activeStep ? 'border-violet-300/45 bg-violet-400/15 shadow-[0_0_28px_rgba(139,92,246,0.22)]' : 'border-slate-700/70 bg-slate-950/70'}`}>
              {eventGlyph(activeStep)}
            </div>
          </div>

          <div className="order-1 grid grid-cols-3 gap-2 lg:order-3">{enemies.map(unit)}</div>
        </div>

        {effectsOn && animationsOn && activeStep && <Projectile step={activeStep} phase={phase} />}

        <div className="mt-4 flex min-h-11 items-center justify-center rounded-2xl border border-white/5 bg-slate-950/70 px-3 py-2 text-center text-xs font-semibold text-slate-300 backdrop-blur-md">
          {activeStep ? (
            <span className="text-cyan-50"><span className="me-2 animate-pulse text-violet-300">▶</span>{commanderEventText(activeStep.event, language)}</span>
          ) : outcomeLabel ? (
            <span className={`font-heading text-base font-black ${status === 'victory' ? 'text-emerald-300' : status === 'defeat' ? 'text-rose-300' : 'text-amber-300'}`}>{status === 'victory' ? '🏆' : status === 'defeat' ? '☠️' : '⚖️'} {outcomeLabel}</span>
          ) : (
            <span>{copy.waiting}</span>
          )}
        </div>
      </div>

      {isDeathBoltImpact && <div aria-hidden className="pointer-events-none absolute inset-0 z-40 bg-[radial-gradient(circle_at_50%_48%,rgba(216,180,254,0.2),transparent_36%)] mix-blend-screen" />}
    </section>
  );
};

export default CommanderCinematicBattlefield;
