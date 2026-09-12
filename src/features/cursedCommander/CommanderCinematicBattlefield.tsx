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
import CommanderUnitPortrait from './CommanderUnitPortrait';

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

type CombatFloatTone = 'damage' | 'heal' | 'shieldDamage' | 'shieldGain' | 'ko';

const hpPercent = (combatant: CommanderPracticeCombatant) =>
  Math.max(0, Math.min(100, Math.round((combatant.hp / combatant.maxHp) * 100)));

const ActionGlyph: React.FC<{ step: CommanderCinematicStep | null; className?: string }> = ({ step, className = '' }) => {
  const code = step?.event.code;
  const stroke = code === 'death_bolt' ? '#d8b4fe' : code === 'guard' ? '#67e8f9' : code === 'focus_target' ? '#fbbf24' : '#f8fafc';
  return (
    <svg aria-hidden viewBox="0 0 48 48" className={className}>
      <defs>
        <filter id="ccActionGlow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="2.8" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      {code === 'focus_target' ? (
        <g fill="none" stroke={stroke} strokeWidth="3" filter="url(#ccActionGlow)">
          <circle cx="24" cy="24" r="10" /><circle cx="24" cy="24" r="3" fill={stroke} />
          <path d="M24 5v8M24 35v8M5 24h8M35 24h8" strokeLinecap="round" />
        </g>
      ) : code === 'death_bolt' ? (
        <g filter="url(#ccActionGlow)">
          <path d="M8 31 24 8l-2 14h17L20 42l3-13Z" fill={stroke} opacity=".95" />
          <circle cx="31" cy="20" r="8" fill="#a855f7" opacity=".22" />
        </g>
      ) : code === 'guard' ? (
        <path d="M24 5 39 11v12c0 10-6 16-15 20C15 39 9 33 9 23V11Z" fill="#164e63" stroke={stroke} strokeWidth="2.5" filter="url(#ccActionGlow)" />
      ) : code === 'combatant_defeated' ? (
        <path d="M12 12 36 36M36 12 12 36" stroke="#fb7185" strokeWidth="5" strokeLinecap="round" />
      ) : code === 'battle_victory' ? (
        <path d="M14 9h20v8c0 8-4 13-10 15-6-2-10-7-10-15Zm0 4H8c0 7 3 10 8 11M34 13h6c0 7-3 10-8 11M19 38h10" fill="none" stroke="#6ee7b7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="m9 31 9-18 6 11 6-16 9 23-15 10Z" fill="#38bdf8" opacity=".9" filter="url(#ccActionGlow)" />
      )}
    </svg>
  );
};

const ArenaBackdrop = () => (
  <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1200 520" preserveAspectRatio="none">
    <defs>
      <linearGradient id="ccSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#07152a" /><stop offset="0.54" stopColor="#0b1430" /><stop offset="1" stopColor="#020617" /></linearGradient>
      <linearGradient id="ccHorizon" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#22d3ee" stopOpacity="0.8" /><stop offset="0.5" stopColor="#8b5cf6" stopOpacity="0.95" /><stop offset="1" stopColor="#ec4899" stopOpacity="0.8" /></linearGradient>
      <linearGradient id="ccFloor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#111c35" stopOpacity="0.48" /><stop offset="1" stopColor="#020617" stopOpacity="0.96" /></linearGradient>
      <radialGradient id="ccMoon"><stop offset="0" stopColor="#c4b5fd" stopOpacity="0.75" /><stop offset="0.45" stopColor="#8b5cf6" stopOpacity="0.24" /><stop offset="1" stopColor="#8b5cf6" stopOpacity="0" /></radialGradient>
      <filter id="ccGlow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="7" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
    </defs>
    <rect width="1200" height="520" fill="url(#ccSky)" />
    <circle cx="600" cy="100" r="150" fill="url(#ccMoon)" />
    <path d="M0 280 120 175l85 75 120-122 95 130 140-78 100 76 130-114 125 116 125-73 160 93v52H0Z" fill="#091225" opacity=".95" />
    <path d="M0 300 150 248l110 34 130-56 120 66 140-46 140 50 140-61 150 47 120-32v88H0Z" fill="#050c19" opacity=".92" />
    <g opacity=".78"><rect x="72" y="208" width="28" height="96" fill="#0f2640" /><rect x="108" y="238" width="18" height="66" fill="#0f2640" /><rect x="171" y="225" width="34" height="80" fill="#11263d" /><rect x="1000" y="214" width="34" height="92" fill="#2d1028" /><rect x="1044" y="246" width="20" height="60" fill="#2d1028" /><rect x="1106" y="224" width="29" height="82" fill="#321026" /><path d="M86 208v-36h9v36M1020 214v-40h9v40" stroke="url(#ccHorizon)" strokeWidth="3" /></g>
    <line x1="0" y1="306" x2="1200" y2="306" stroke="url(#ccHorizon)" strokeWidth="2" filter="url(#ccGlow)" />
    <rect y="307" width="1200" height="213" fill="url(#ccFloor)" />
    <g stroke="#38bdf8" strokeOpacity=".12" strokeWidth="1"><path d="M600 307 120 520M600 307 300 520M600 307 480 520M600 307 720 520M600 307 900 520M600 307 1080 520" /><path d="M80 350h1040M25 395h1150M0 455h1200" /></g>
    <g opacity=".7" filter="url(#ccGlow)"><circle cx="105" cy="292" r="3" fill="#22d3ee" /><circle cx="190" cy="270" r="2" fill="#67e8f9" /><circle cx="1010" cy="291" r="3" fill="#ec4899" /><circle cx="1087" cy="267" r="2" fill="#f9a8d4" /><circle cx="604" cy="307" r="4" fill="#c4b5fd" /></g>
  </svg>
);

const UnitAura: React.FC<{ id: string; side: 'player' | 'enemy'; selected: boolean; focused: boolean; shield: number }> = ({ id, side, selected, focused, shield }) => {
  const gradientId = `ccAura-${id}`;
  return (
    <svg aria-hidden className="pointer-events-none absolute -inset-5 h-[calc(100%+2.5rem)] w-[calc(100%+2.5rem)]" viewBox="0 0 180 180">
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={side === 'player' ? '#22d3ee' : '#fb7185'} /><stop offset="1" stopColor={side === 'player' ? '#8b5cf6' : '#ec4899'} /></linearGradient></defs>
      <ellipse cx="90" cy="150" rx="58" ry="15" fill="none" stroke={`url(#${gradientId})`} strokeWidth={selected ? 4 : 2} opacity={selected ? 1 : 0.45} className="cc-arena-ring" />
      {shield > 0 && <path d="M90 22c42 0 61 23 61 60 0 36-24 55-61 66-37-11-61-30-61-66 0-37 19-60 61-60Z" fill={side === 'player' ? '#22d3ee' : '#f472b6'} opacity=".055" stroke={side === 'player' ? '#67e8f9' : '#f9a8d4'} strokeOpacity=".28" />}
      {focused && <g className="cc-focus-reticle" stroke="#fbbf24" fill="none" strokeWidth="3"><circle cx="90" cy="70" r="35" strokeDasharray="9 8" /><path d="M90 24v15M90 101v15M44 70h15M121 70h15" /></g>}
    </svg>
  );
};

const Projectile: React.FC<{ step: CommanderCinematicStep; phase: CommanderPlaybackPhase }> = ({ step, phase }) => {
  if (step.kind !== 'attack' || phase === 'settle') return null;
  const player = step.event.side === 'player';
  const deathBolt = step.event.code === 'death_bolt';
  return (
    <div aria-hidden key={`${step.id}-${phase}`} className={`pointer-events-none absolute top-[46%] z-30 ${player ? 'cc-shot-player' : 'cc-shot-enemy'} ${deathBolt ? 'cc-death-bolt-shot' : 'cc-normal-shot'}`}>
      <svg width={deathBolt ? 110 : 72} height={deathBolt ? 62 : 38} viewBox="0 0 110 62">
        <defs><radialGradient id="ccBoltCore"><stop offset="0" stopColor="#fff" /><stop offset=".3" stopColor={player ? '#67e8f9' : '#fda4af'} /><stop offset="1" stopColor={deathBolt ? '#a855f7' : player ? '#0ea5e9' : '#e11d48'} stopOpacity="0" /></radialGradient><filter id="ccBoltGlow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="4" /></filter></defs>
        <path d="M5 31C30 8 60 9 96 31 60 53 30 54 5 31Z" fill={deathBolt ? '#8b5cf6' : player ? '#38bdf8' : '#fb7185'} opacity=".34" filter="url(#ccBoltGlow)" />
        <path d="M4 31h79" stroke={deathBolt ? '#c4b5fd' : player ? '#67e8f9' : '#fda4af'} strokeWidth={deathBolt ? 7 : 3} strokeLinecap="round" />
        <circle cx="88" cy="31" r={deathBolt ? 20 : 11} fill="url(#ccBoltCore)" />
      </svg>
    </div>
  );
};

const ImpactBurst: React.FC<{ deathBolt: boolean; shieldOnly: boolean }> = ({ deathBolt, shieldOnly }) => {
  const color = deathBolt ? '#d8b4fe' : shieldOnly ? '#fbbf24' : '#fb7185';
  return (
    <svg aria-hidden viewBox="0 0 120 120" className="cc-impact-burst pointer-events-none absolute -inset-5 z-30 h-[calc(100%+2.5rem)] w-[calc(100%+2.5rem)]">
      <circle cx="60" cy="60" r="18" fill={color} opacity=".22" />
      <circle cx="60" cy="60" r="29" fill="none" stroke={color} strokeWidth="3" opacity=".85" />
      <g stroke={color} strokeWidth="4" strokeLinecap="round"><path d="M60 5v23M60 92v23M5 60h23M92 60h23M21 21l16 16M83 83l16 16M99 21 83 37M37 83 21 99" /></g>
    </svg>
  );
};

const CombatFloat: React.FC<{ tone: CombatFloatTone; children: React.ReactNode; compact?: boolean }> = ({ tone, children, compact = false }) => {
  const classes: Record<CombatFloatTone, string> = {
    damage: 'border-red-300/35 bg-red-950/90 text-red-300 shadow-[0_0_20px_rgba(239,68,68,.34)]',
    heal: 'border-emerald-300/35 bg-emerald-950/90 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,.34)]',
    shieldDamage: 'border-amber-300/35 bg-amber-950/90 text-amber-200 shadow-[0_0_18px_rgba(245,158,11,.26)]',
    shieldGain: 'border-cyan-300/35 bg-cyan-950/90 text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,.28)]',
    ko: 'border-red-300/45 bg-slate-950/95 text-red-200 shadow-[0_0_24px_rgba(239,68,68,.42)]',
  };
  return <span className={`cc-combat-float rounded-lg border px-2 py-1 font-heading font-black tracking-wide ${compact ? 'text-[10px]' : 'text-lg sm:text-xl'} ${classes[tone]}`}>{children}</span>;
};

const findCombatant = (combatants: CommanderPracticeCombatant[], name: string | undefined) =>
  combatants.find((combatant) => combatant.name === name) ?? null;

const actionLabel = (step: CommanderCinematicStep, copy: CommanderCopy) => {
  if (step.kind === 'focus_lock') return copy.locked;
  if (step.event.code === 'focus_target') return copy.focus;
  if (step.event.code === 'death_bolt') return copy.bolt;
  if (step.event.code === 'guard') return copy.guard;
  if (step.kind === 'defeat') return copy.knockedOut;
  return copy.impact;
};

const CombatEventBanner: React.FC<{
  step: CommanderCinematicStep | null;
  combatants: CommanderPracticeCombatant[];
  language: CommanderLanguage;
  copy: CommanderCopy;
  outcomeLabel: string | null;
  status: CommanderPracticeStatus;
}> = ({ step, combatants, language, copy, outcomeLabel, status }) => {
  if (!step) {
    return (
      <div className="flex min-h-14 items-center justify-center rounded-2xl border border-white/5 bg-slate-950/72 px-3 py-3 text-center text-xs font-semibold text-slate-300 backdrop-blur-md">
        {outcomeLabel ? <span className={`font-heading text-base font-black ${status === 'victory' ? 'text-emerald-300' : status === 'defeat' ? 'text-red-300' : 'text-amber-300'}`}>{outcomeLabel}</span> : <span>{copy.waiting}</span>}
      </div>
    );
  }

  const actor = findCombatant(combatants, step.event.actorName);
  const target = findCombatant(combatants, step.event.targetName);
  const showDamage = step.kind === 'attack' && (step.hpDamage > 0 || step.shieldDamage > 0);
  const showGuard = step.kind === 'guard' && (step.event.amount ?? 0) > 0;

  return (
    <div key={step.id} className="cc-event-banner rounded-2xl border border-violet-300/15 bg-slate-950/82 px-3 py-2.5 backdrop-blur-xl">
      <div className="flex items-center justify-center gap-2 sm:gap-3" dir="ltr">
        {actor && (
          <div className="flex min-w-0 items-center gap-2">
            <div className="h-10 w-10 shrink-0"><CommanderUnitPortrait combatant={actor} instance={`banner-actor-${step.id}`} defeated={actor.hp <= 0} /></div>
            <span className="hidden max-w-24 truncate text-[10px] font-bold text-slate-200 sm:block">{actor.name}</span>
          </div>
        )}

        <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-violet-300/20 bg-violet-400/10 px-2.5 py-1.5">
          <ActionGlyph step={step} className="h-5 w-5" />
          <span className="text-[9px] font-black uppercase tracking-wider text-violet-100">{actionLabel(step, copy)}</span>
        </div>

        {target && (
          <div className="flex min-w-0 items-center gap-2">
            <div className="h-10 w-10 shrink-0"><CommanderUnitPortrait combatant={target} instance={`banner-target-${step.id}`} defeated={target.hp <= 0} /></div>
            <span className="hidden max-w-24 truncate text-[10px] font-bold text-slate-200 sm:block">{target.name}</span>
          </div>
        )}

        {showDamage && (
          <div className="flex shrink-0 items-center gap-1">
            {step.shieldDamage > 0 && <span className="rounded-md bg-amber-400/10 px-1.5 py-1 text-[9px] font-black text-amber-200">-{step.shieldDamage} SH</span>}
            {step.hpDamage > 0 && <span className="rounded-md bg-red-500/10 px-1.5 py-1 text-[10px] font-black text-red-300">-{step.hpDamage} HP</span>}
          </div>
        )}
        {showGuard && <span className="shrink-0 rounded-md bg-cyan-400/10 px-1.5 py-1 text-[10px] font-black text-cyan-200">+{step.event.amount} SH</span>}
      </div>
      <p className="mt-1.5 text-center text-[10px] leading-4 text-slate-400 sm:text-xs">{commanderEventText(step.event, language)}</p>
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
    const shieldOnlyHit = Boolean(activeStep?.kind === 'attack' && activeStep.shieldDamage > 0 && activeStep.hpDamage === 0);

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
        className={`relative z-20 min-w-0 overflow-visible rounded-2xl border px-2 py-2.5 text-center transition-all duration-300 ${
          combatant.hp <= 0
            ? 'border-slate-700/50 bg-slate-950/72'
            : selected
              ? 'border-amber-300/90 bg-amber-300/[0.07] shadow-[0_0_38px_rgba(251,191,36,0.3)]'
              : combatant.side === 'player'
                ? 'border-cyan-400/25 bg-cyan-400/[0.055]'
                : 'border-fuchsia-400/25 bg-fuchsia-400/[0.055]'
        } ${actorMotion} ${impactTarget && animationsOn ? 'cc-impact-hit' : ''} ${defeat && animationsOn ? 'cc-unit-defeat' : ''} ${focusLock && animationsOn ? 'cc-focus-lock-hit' : ''} ${combatant.hp > 0 && !actor ? 'cc-unit-idle' : ''} ${canTarget ? 'cursor-pointer hover:-translate-y-1 hover:brightness-125' : 'cursor-default'}`}
        aria-label={`${combatant.name}${selected ? `, ${copy.selected}` : ''}`}
      >
        <UnitAura id={combatant.id} side={combatant.side} selected={selected} focused={focused || focusLock} shield={combatant.shield} />
        {selected && combatant.hp > 0 && <span className="absolute end-1.5 top-1.5 z-30 rounded-full border border-amber-200/60 bg-amber-300/15 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-amber-100">◎ {copy.selected}</span>}
        {combatant.role === 'commander' && <span className="absolute start-1.5 top-1.5 z-30 rounded-full border border-violet-300/30 bg-slate-950/75 px-1.5 py-0.5 text-[8px] font-black text-violet-100">CMD</span>}

        <div className="relative mx-auto mt-1 flex h-20 w-20 items-center justify-center sm:h-24 sm:w-24">
          <div aria-hidden className={`absolute inset-2 rounded-full blur-xl ${combatant.side === 'player' ? 'bg-cyan-400/18' : 'bg-fuchsia-500/18'}`} />
          <CommanderUnitPortrait combatant={combatant} instance={`field-${combatant.id}`} defeated={combatant.hp <= 0} className="relative z-10 drop-shadow-[0_0_16px_rgba(255,255,255,.08)]" />
          {guard && effectsOn && phase !== 'settle' && <span aria-hidden className="cc-shield-bloom absolute inset-0 z-20 rounded-full border-2 border-cyan-200/70 bg-cyan-300/10 shadow-[0_0_34px_rgba(34,211,238,.58)]" />}
          {impactTarget && effectsOn && activeStep?.kind === 'attack' && <ImpactBurst deathBolt={activeStep.event.code === 'death_bolt'} shieldOnly={shieldOnlyHit} />}
        </div>

        <div className="relative z-10 mt-1 flex min-h-8 items-center justify-center px-0.5 text-[10px] font-black leading-3.5 text-white sm:text-xs sm:leading-4">{combatant.name}</div>
        {combatant.hp <= 0 ? (
          <div className="relative z-10 mt-1 text-[9px] font-black uppercase tracking-[0.16em] text-red-300/80">{copy.knockedOut}</div>
        ) : (
          <>
            <div className="relative z-10 mt-1.5 flex items-center justify-between gap-1 text-[8px] font-bold sm:text-[10px]"><span className="text-emerald-100">{copy.hp} {combatant.hp}/{combatant.maxHp}</span><span className="text-sky-200">◇ {combatant.shield}</span></div>
            <div className="relative z-10 mt-1 h-1.5 overflow-hidden rounded-full bg-slate-900 ring-1 ring-white/5"><div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 transition-[width] duration-500 ease-out" style={{ width: `${hpPercent(combatant)}%` }} /></div>
            <div className="relative z-10 mt-1 h-1 overflow-hidden rounded-full bg-slate-900 ring-1 ring-white/5"><div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-200 transition-[width] duration-500 ease-out" style={{ width: `${Math.min(100, (combatant.shield / 30) * 100)}%` }} /></div>
          </>
        )}

        {impactTarget && activeStep?.kind === 'attack' && (
          <div key={`${activeStep.id}-damage`} className="pointer-events-none absolute inset-x-0 -top-10 z-50 flex flex-col items-center gap-1">
            {activeStep.shieldDamage > 0 && <CombatFloat tone="shieldDamage" compact>◇ -{activeStep.shieldDamage} {copy.shield}</CombatFloat>}
            {activeStep.hpDamage > 0 && <CombatFloat tone="damage">-{activeStep.hpDamage} HP</CombatFloat>}
          </div>
        )}
        {impactGuard && <div key={`${activeStep?.id}-guard`} className="pointer-events-none absolute inset-x-0 -top-7 z-50 flex justify-center"><CombatFloat tone="shieldGain" compact>◇ +{activeStep?.event.amount ?? 0} {copy.shield}</CombatFloat></div>}
        {defeat && phase === 'impact' && <div className="pointer-events-none absolute inset-x-0 -top-7 z-50 flex justify-center"><CombatFloat tone="ko">K.O.</CombatFloat></div>}
      </button>
    );
  };

  return (
    <section className={`relative overflow-hidden rounded-[2rem] border border-cyan-400/30 bg-[#020617] shadow-[0_0_65px_rgba(34,211,238,0.12)] ${isDeathBoltImpact && animationsOn ? 'cc-arena-impact' : ''}`}>
      <style>{`
        @keyframes ccAmbientDrift { 0%,100% { transform:translate3d(0,0,0); opacity:.18 } 50% { transform:translate3d(18px,-10px,0); opacity:.34 } }
        @keyframes ccRingPulse { 0%,100% { opacity:.35; transform:scale(.96) } 50% { opacity:.9; transform:scale(1.04) } }
        @keyframes ccFocusSpin { to { transform-origin:90px 70px; transform:rotate(360deg) } }
        @keyframes ccIdleFloat { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-2px) } }
        @keyframes ccLungePlayer { 0%,100% { transform:translateX(0) scale(1) } 40% { transform:translateX(18px) scale(1.055) } 58% { transform:translateX(13px) scale(1.03) } }
        @keyframes ccLungeEnemy { 0%,100% { transform:translateX(0) scale(1) } 40% { transform:translateX(-18px) scale(1.055) } 58% { transform:translateX(-13px) scale(1.03) } }
        @keyframes ccImpactHit { 0%,100% { transform:translateX(0); filter:brightness(1) } 18% { transform:translateX(-7px); filter:brightness(2) } 38% { transform:translateX(6px) } 58% { transform:translateX(-3px) } }
        @keyframes ccGuardCast { 0%,100% { transform:scale(1) } 48% { transform:scale(1.06); filter:brightness(1.3) } }
        @keyframes ccShieldBloom { 0% { transform:scale(.5); opacity:0 } 55% { transform:scale(1.12); opacity:1 } 100% { transform:scale(1.3); opacity:0 } }
        @keyframes ccShotPlayer { 0% { left:24%; opacity:0; transform:scale(.7) } 18% { opacity:1 } 88% { opacity:1 } 100% { left:67%; opacity:0; transform:scale(1.2) } }
        @keyframes ccShotEnemy { 0% { left:67%; opacity:0; transform:scale(.7) } 18% { opacity:1 } 88% { opacity:1 } 100% { left:24%; opacity:0; transform:scale(1.2) } }
        @keyframes ccCombatFloat { 0% { opacity:0; transform:translateY(12px) scale(.7) } 18% { opacity:1; transform:translateY(-2px) scale(1.18) } 55% { opacity:1; transform:translateY(-10px) scale(1) } 100% { opacity:0; transform:translateY(-31px) scale(.94) } }
        @keyframes ccImpactBurst { 0% { opacity:0; transform:scale(.3) rotate(-12deg) } 26% { opacity:1; transform:scale(1.08) rotate(5deg) } 100% { opacity:0; transform:scale(1.48) rotate(18deg) } }
        @keyframes ccUnitDefeat { 0% { opacity:1; transform:translateY(0) scale(1) } 45% { opacity:.78; transform:translateY(4px) rotate(2deg) scale(.97) } 100% { opacity:.6; transform:translateY(9px) scale(.92); filter:grayscale(.7) } }
        @keyframes ccFocusLockHit { 0% { filter:brightness(1) } 45% { filter:brightness(1.8) drop-shadow(0 0 16px rgba(251,191,36,.7)) } 100% { filter:brightness(1) } }
        @keyframes ccArenaImpact { 0%,100% { transform:translateX(0) } 22% { transform:translateX(-3px) } 46% { transform:translateX(3px) } 70% { transform:translateX(-1px) } }
        @keyframes ccEventBanner { 0% { opacity:0; transform:translateY(6px) scale(.985) } 100% { opacity:1; transform:translateY(0) scale(1) } }
        .cc-arena-ring { animation:ccRingPulse 3.2s ease-in-out infinite; transform-origin:center; }
        .cc-focus-reticle { animation:ccFocusSpin 5s linear infinite; }
        .cc-unit-idle { animation:ccIdleFloat 3.4s ease-in-out infinite; }
        .cc-lunge-player { animation:ccLungePlayer 700ms cubic-bezier(.2,.8,.2,1); }
        .cc-lunge-enemy { animation:ccLungeEnemy 700ms cubic-bezier(.2,.8,.2,1); }
        .cc-impact-hit { animation:ccImpactHit 520ms ease-out; }
        .cc-guard-cast { animation:ccGuardCast 720ms ease-in-out; }
        .cc-shield-bloom { animation:ccShieldBloom 760ms ease-out forwards; }
        .cc-shot-player { animation:ccShotPlayer 620ms cubic-bezier(.2,.75,.2,1) forwards; }
        .cc-shot-enemy { animation:ccShotEnemy 620ms cubic-bezier(.2,.75,.2,1) forwards; }
        .cc-death-bolt-shot { filter:drop-shadow(0 0 18px rgba(168,85,247,.92)); }
        .cc-normal-shot { filter:drop-shadow(0 0 10px rgba(56,189,248,.75)); }
        .cc-combat-float { animation:ccCombatFloat 1050ms cubic-bezier(.16,.9,.2,1) forwards; }
        .cc-impact-burst { animation:ccImpactBurst 580ms ease-out forwards; }
        .cc-unit-defeat { animation:ccUnitDefeat 820ms ease-out forwards; }
        .cc-focus-lock-hit { animation:ccFocusLockHit 700ms ease-out; }
        .cc-arena-impact { animation:ccArenaImpact 190ms linear; }
        .cc-event-banner { animation:ccEventBanner 230ms ease-out; }
        @media (prefers-reduced-motion:reduce) {
          .cc-arena-ring,.cc-focus-reticle,.cc-unit-idle,.cc-lunge-player,.cc-lunge-enemy,.cc-impact-hit,.cc-guard-cast,.cc-shield-bloom,.cc-shot-player,.cc-shot-enemy,.cc-combat-float,.cc-impact-burst,.cc-unit-defeat,.cc-focus-lock-hit,.cc-arena-impact,.cc-event-banner { animation:none !important; }
        }
      `}</style>

      <ArenaBackdrop />
      {effectsOn && <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden"><span className="absolute left-[12%] top-[32%] h-28 w-28 rounded-full bg-cyan-400/10 blur-3xl [animation:ccAmbientDrift_5s_ease-in-out_infinite]" /><span className="absolute right-[11%] top-[35%] h-28 w-28 rounded-full bg-fuchsia-500/10 blur-3xl [animation:ccAmbientDrift_6s_ease-in-out_infinite_reverse]" /><span className="absolute left-[47%] top-[24%] h-20 w-20 rounded-full bg-violet-500/10 blur-3xl [animation:ccAmbientDrift_4.5s_ease-in-out_infinite]" /></div>}

      <div className="relative z-10 border-b border-white/5 bg-slate-950/38 px-4 py-3 backdrop-blur-sm sm:flex sm:items-center sm:justify-between sm:gap-3">
        <div><div className="flex items-center gap-2"><ActionGlyph step={null} className="h-5 w-5" /><h2 className="font-heading text-sm font-black uppercase tracking-[0.14em] text-cyan-100">{copy.battlefield}</h2><span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-200">● LIVE</span></div><p className="mt-0.5 text-xs text-slate-400">{copy.battlefieldHint}</p></div>
        <div className="mt-3 flex flex-wrap gap-2 sm:mt-0" dir="ltr"><button type="button" onClick={onToggleAnimations} className={`rounded-full border px-2.5 py-1 text-[10px] font-bold transition ${animationsOn ? 'border-emerald-400/35 bg-emerald-400/10 text-emerald-200' : 'border-slate-700 bg-slate-950/50 text-slate-500'}`}>{animationsOn ? '●' : '○'} {copy.animations}</button><button type="button" onClick={onToggleEffects} className={`rounded-full border px-2.5 py-1 text-[10px] font-bold transition ${effectsOn ? 'border-cyan-400/35 bg-cyan-400/10 text-cyan-200' : 'border-slate-700 bg-slate-950/50 text-slate-500'}`}>✦ {copy.effects}</button><button type="button" onClick={onToggleSpeed} className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2.5 py-1 text-[10px] font-bold text-violet-200">{copy.speed} {speed}×</button></div>
      </div>

      <div className="relative z-10 min-h-[430px] px-3 pb-4 pt-3 sm:min-h-[470px] sm:px-5 sm:pb-5" dir="ltr">
        <div className="mb-3 grid grid-cols-2 text-[9px] font-black uppercase tracking-[0.18em] sm:text-[10px]"><span className="text-cyan-300">● {copy.you}</span><span className="text-right text-fuchsia-300">{targetable ? `◎ ${copy.selectTarget}` : `● ${copy.enemy}`}</span></div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_150px_minmax(0,1fr)] lg:items-center"><div className="order-3 grid grid-cols-3 gap-2 lg:order-1">{players.map(unit)}</div><div className="order-2 relative flex min-h-20 items-center justify-center lg:min-h-48" aria-live="polite"><div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-cyan-300/15 via-violet-300/90 to-fuchsia-300/15" /><div className={`relative z-20 flex h-14 w-14 items-center justify-center rounded-full border backdrop-blur-md transition-all ${activeStep ? 'border-violet-300/45 bg-violet-400/15 shadow-[0_0_28px_rgba(139,92,246,.22)]' : 'border-slate-700/70 bg-slate-950/70'}`}><ActionGlyph step={activeStep} className="h-8 w-8" /></div></div><div className="order-1 grid grid-cols-3 gap-2 lg:order-3">{enemies.map(unit)}</div></div>
        {effectsOn && animationsOn && activeStep && <Projectile step={activeStep} phase={phase} />}
        <div className="mt-4"><CombatEventBanner step={activeStep} combatants={combatants} language={language} copy={copy} outcomeLabel={outcomeLabel} status={status} /></div>
      </div>

      {isDeathBoltImpact && <div aria-hidden className="pointer-events-none absolute inset-0 z-40 bg-[radial-gradient(circle_at_50%_48%,rgba(216,180,254,.24),transparent_36%)] mix-blend-screen" />}
    </section>
  );
};

export default CommanderCinematicBattlefield;
