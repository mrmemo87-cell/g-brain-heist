import { useCommanderIntro } from './useCommanderIntro';
import React, { useEffect, useRef } from 'react';
import type {
  CommanderPracticeCombatant,
  CommanderPracticeMove,
  CommanderPracticeStatus,
} from '../../../services/commanderPracticeService';
import type { CommanderCinematicStep } from './commanderCinematicPlayback';
import {
  commanderEventText,
  type CommanderCopy,
  type CommanderLanguage,
} from './commanderPracticeCopy';
import CommanderBattleSprite from './CommanderBattleSprite';
import CommanderCommandDock from './CommanderCommandDock';
import CommanderUnitPortrait from './CommanderUnitPortrait';
import {
  getCommanderFormationPoint,
  getCommanderFormationPointByName,
} from './commanderFormationLayout';
import {
  stopCommanderAudio,
  playCommanderSfx,
  unlockCommanderAudio,
  type CommanderSfxCue,
} from './commanderBattleSound';
import {
  getCommanderProjectileAngle,
  getCommanderProjectileUrl,
  isCommanderRangedSprite,
  type CommanderSpritePose,
} from './commanderSpriteAssets';

export type CommanderPlaybackPhase = 'windup' | 'impact' | 'settle' | null;

type Props = {
  onIntroReady: () => void;
  soundOn: boolean;
  onToggleSound: () => void;
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
  turn: number;
  maxTurns: number;
  expiresAt: string;
  deathBoltCooldown: number;
  busy: boolean;
  onSelectTarget: (id: string) => void;
  onToggleAnimations: () => void;
  onToggleEffects: () => void;
  onToggleSpeed: () => void;
  onMove: (move: CommanderPracticeMove) => void;
  onRestart: () => void;
};

type CombatFloatTone = 'damage' | 'shieldDamage' | 'shieldGain' | 'ko';

const hpPercent = (combatant: CommanderPracticeCombatant) =>
  Math.max(0, Math.min(100, Math.round((combatant.hp / combatant.maxHp) * 100)));

const shieldPercent = (combatant: CommanderPracticeCombatant) =>
  Math.max(0, Math.min(100, Math.round((combatant.shield / 30) * 100)));

const resolveSpritePose = (
  combatant: CommanderPracticeCombatant,
  step: CommanderCinematicStep | null,
  phase: CommanderPlaybackPhase,
): CommanderSpritePose => {
  if (combatant.hp <= 0) return 'defeated';
  if (!step) return 'standing';

  const actor = step.event.actorName === combatant.name;
  const target = step.event.targetName === combatant.name;

  if (step.kind === 'defeat' && step.event.actorName === combatant.name && phase === 'impact') return 'defeated';
  if (target && step.kind === 'attack' && phase === 'impact') return 'attacked';

  if (actor && step.kind === 'attack') {
    if (isCommanderRangedSprite(combatant.id) && (phase === 'impact' || phase === 'settle')) return 'justShot';
    if (phase === 'windup' || phase === 'impact') return 'attacking';
  }

  if (actor && (step.kind === 'guard' || step.kind === 'focus_lock' || step.event.code === 'focus_target')) {
    return phase === 'settle' ? 'standing' : 'attacking';
  }

  return 'standing';
};

const ActionGlyph: React.FC<{ step: CommanderCinematicStep | null; className?: string }> = ({ step, className = '' }) => {
  const code = step?.event.code;
  const stroke = code === 'death_bolt' ? '#d8b4fe' : code === 'guard' ? '#67e8f9' : code === 'focus_target' ? '#fbbf24' : '#f8fafc';
  return (
    <svg aria-hidden viewBox="0 0 48 48" className={className}>
      {code === 'focus_target' ? (
        <g fill="none" stroke={stroke} strokeWidth="3">
          <circle cx="24" cy="24" r="10" />
          <circle cx="24" cy="24" r="3" fill={stroke} />
          <path d="M24 5v8M24 35v8M5 24h8M35 24h8" strokeLinecap="round" />
        </g>
      ) : code === 'death_bolt' ? (
        <path d="M27 4 10 27h12l-3 17 19-26H26Z" fill={stroke} />
      ) : code === 'guard' ? (
        <path d="M24 5 39 11v12c0 10-6 16-15 20C15 39 9 33 9 23V11Z" fill="#164e63" stroke={stroke} strokeWidth="2.5" />
      ) : (
        <path d="m9 31 9-18 6 11 6-16 9 23-15 10Z" fill="#38bdf8" opacity=".92" />
      )}
    </svg>
  );
};

const SoundGlyph: React.FC<{ enabled: boolean }> = ({ enabled }) => (
  <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 10v4h4l5 4V6L8 10H4Z" />
    {enabled ? <><path d="M16 9a4 4 0 0 1 0 6" /><path d="M18.5 6.5a7.5 7.5 0 0 1 0 11" /></> : <path d="m17 10 4 4m0-4-4 4" />}
  </svg>
);

const TacticalBackdrop = () => (
  <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1200 680" preserveAspectRatio="none">
    <defs>
      <linearGradient id="ccStageSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#07152a" /><stop offset=".52" stopColor="#0a1630" /><stop offset="1" stopColor="#020617" /></linearGradient>
      <linearGradient id="ccStageHorizon" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#22d3ee" stopOpacity=".9" /><stop offset=".5" stopColor="#8b5cf6" stopOpacity="1" /><stop offset="1" stopColor="#fb7185" stopOpacity=".9" /></linearGradient>
      <radialGradient id="ccStageMoon"><stop offset="0" stopColor="#ddd6fe" stopOpacity=".75" /><stop offset=".45" stopColor="#8b5cf6" stopOpacity=".18" /><stop offset="1" stopColor="#8b5cf6" stopOpacity="0" /></radialGradient>
      <linearGradient id="ccGround" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0d1730" stopOpacity=".4" /><stop offset="1" stopColor="#020617" stopOpacity=".98" /></linearGradient>
      <filter id="ccStageGlow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="8" /></filter>
    </defs>
    <rect width="1200" height="680" fill="url(#ccStageSky)" />
    <circle cx="600" cy="120" r="180" fill="url(#ccStageMoon)" />
    <path d="M0 350 120 210l88 105 118-154 110 158 132-96 111 94 122-134 121 132 128-91 150 119v60H0Z" fill="#091225" opacity=".96" />
    <path d="M0 386 132 320l108 42 130-70 136 82 132-58 135 66 126-76 137 58 164-46v86H0Z" fill="#050c19" opacity=".95" />
    <g opacity=".72"><rect x="66" y="274" width="31" height="126" fill="#0f2640" /><rect x="108" y="315" width="18" height="85" fill="#0f2640" /><rect x="172" y="292" width="36" height="108" fill="#11263d" /><rect x="995" y="285" width="36" height="115" fill="#321026" /><rect x="1044" y="323" width="20" height="77" fill="#321026" /><rect x="1103" y="298" width="32" height="102" fill="#321026" /></g>
    <line x1="0" y1="400" x2="1200" y2="400" stroke="url(#ccStageHorizon)" strokeWidth="2" />
    <rect y="401" width="1200" height="279" fill="url(#ccGround)" />
    <g stroke="#38bdf8" strokeOpacity=".12" strokeWidth="1"><path d="M600 401 80 680M600 401 270 680M600 401 460 680M600 401 740 680M600 401 930 680M600 401 1120 680" /><path d="M70 450h1060M28 510h1144M0 590h1200" /></g>
    <ellipse cx="292" cy="520" rx="190" ry="66" fill="#22d3ee" opacity=".035" filter="url(#ccStageGlow)" />
    <ellipse cx="908" cy="520" rx="190" ry="66" fill="#fb7185" opacity=".035" filter="url(#ccStageGlow)" />
  </svg>
);

const TacticalTargetReticle: React.FC<{ selected: boolean; focused: boolean; focusLock: boolean }> = ({ selected, focused, focusLock }) => {
  if (!selected && !focused && !focusLock) return null;
  return (
    <span aria-hidden className="pointer-events-none absolute left-1/2 top-[42%] z-50 h-[76%] w-[76%] -translate-x-1/2 -translate-y-1/2">
      <svg viewBox="0 0 160 160" className="h-full w-full overflow-visible">
        <defs><filter id="ccTargetGlow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="2.4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
        {selected && (
          <g className="cc-target-reticle-spin" fill="none" stroke="#fbbf24" filter="url(#ccTargetGlow)">
            <circle cx="80" cy="80" r="55" strokeWidth="2" strokeDasharray="22 17" opacity=".82" />
            <path d="M80 12v18M80 130v18M12 80h18M130 80h18" strokeWidth="3" strokeLinecap="round" />
            <path d="M38 49V38h11M111 38h11v11M122 111v11h-11M49 122H38v-11" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )}
        {(focused || focusLock) && (
          <g className="cc-focus-reticle-spin" fill="none" stroke="#e879f9" filter="url(#ccTargetGlow)">
            <circle cx="80" cy="80" r="43" strokeWidth="2.5" strokeDasharray="8 9" />
            <circle cx="80" cy="80" r="8" strokeWidth="2" opacity=".9" />
            <path d="M80 31v18M80 111v18M31 80h18M111 80h18" strokeWidth="2.5" strokeLinecap="round" />
          </g>
        )}
        {selected && <path className="cc-target-chevron" d="m80 4 10 14H70Z" fill="#fbbf24" filter="url(#ccTargetGlow)" />}
      </svg>
    </span>
  );
};

const CombatFloat: React.FC<{ tone: CombatFloatTone; children: React.ReactNode; compact?: boolean; delayMs?: number }> = ({ tone, children, compact = false, delayMs = 0 }) => {
  const classes: Record<CombatFloatTone, string> = {
    damage: 'text-red-300 [text-shadow:0_0_18px_rgba(239,68,68,.95)]',
    shieldDamage: 'text-amber-200 [text-shadow:0_0_16px_rgba(245,158,11,.9)]',
    shieldGain: 'text-cyan-200 [text-shadow:0_0_18px_rgba(34,211,238,.9)]',
    ko: 'text-red-100 [text-shadow:0_0_22px_rgba(239,68,68,1)]',
  };
  return <span style={{ animationDelay: `${delayMs}ms` }} className={`cc-combat-float block font-heading font-black tracking-wide ${compact ? 'text-[10px] sm:text-xs' : 'text-xl sm:text-3xl'} ${classes[tone]}`}>{children}</span>;
};

const ImpactBurst: React.FC<{ deathBolt: boolean; shieldOnly: boolean }> = ({ deathBolt, shieldOnly }) => {
  const color = deathBolt ? '#d8b4fe' : shieldOnly ? '#fbbf24' : '#fb7185';
  return (
    <svg aria-hidden viewBox="0 0 120 120" className="cc-impact-burst pointer-events-none absolute left-1/2 top-[44%] z-50 h-28 w-28 -translate-x-1/2 -translate-y-1/2">
      <circle cx="60" cy="60" r="18" fill={color} opacity=".22" />
      <circle cx="60" cy="60" r="30" fill="none" stroke={color} strokeWidth="3" opacity=".9" />
      <g stroke={color} strokeWidth="4" strokeLinecap="round"><path d="M60 5v23M60 92v23M5 60h23M92 60h23M21 21l16 16M83 83l16 16M99 21 83 37M37 83 21 99" /></g>
    </svg>
  );
};

const DeathBoltCharge: React.FC = () => (
  <span aria-hidden className="cc-deathbolt-charge pointer-events-none absolute left-1/2 top-[38%] z-50 h-24 w-24 -translate-x-1/2 -translate-y-1/2">
    <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible">
      <defs><radialGradient id="ccBoltCharge"><stop offset="0" stopColor="#fff" /><stop offset=".28" stopColor="#d8b4fe" stopOpacity=".95" /><stop offset="1" stopColor="#7c3aed" stopOpacity="0" /></radialGradient></defs>
      <circle cx="50" cy="50" r="45" fill="url(#ccBoltCharge)" />
      <g fill="none" stroke="#e9d5ff" strokeWidth="2" strokeLinecap="round"><path d="M50 4v17M50 79v17M4 50h17M79 50h17" /><path d="M18 18l12 12M70 70l12 12M82 18 70 30M30 70 18 82" /></g>
    </svg>
  </span>
);

const ProjectilePath: React.FC<{
  step: CommanderCinematicStep | null;
  phase: CommanderPlaybackPhase;
  combatants: CommanderPracticeCombatant[];
  speed: 1 | 2;
}> = ({ step, phase, combatants, speed }) => {
  if (!step || step.kind !== 'attack' || phase === 'settle') return null;
  const actorCombatant = combatants.find((candidate) => candidate.name === step.event.actorName);
  const actor = getCommanderFormationPointByName(combatants, step.event.actorName);
  const target = getCommanderFormationPointByName(combatants, step.event.targetName);
  if (!actorCombatant || !actor || !target) return null;

  const authoredProjectile = getCommanderProjectileUrl(actorCombatant.id);
  const ranged = authoredProjectile || step.event.code === 'death_bolt' || step.event.code === 'focus_target';
  if (!ranged) return null;

  const mx = (actor.x + target.x) / 2;
  const my = Math.min(actor.y, target.y) - (step.event.code === 'death_bolt' ? 18 : 9);
  const path = `M ${actor.x} ${actor.y - 12} Q ${mx} ${my} ${target.x} ${target.y - 11}`;
  const duration = speed === 2 ? (step.event.code === 'death_bolt' ? 360 : 300) : (step.event.code === 'death_bolt' ? 650 : 520);
  const suffix = step.id.replace(/[^a-zA-Z0-9_-]/g, '');
  const color = step.event.code === 'death_bolt' ? '#c084fc' : step.event.code === 'focus_target' ? '#fbbf24' : step.event.side === 'player' ? '#67e8f9' : '#fda4af';

  return (
    <svg key={step.id} aria-hidden className="pointer-events-none absolute inset-0 z-40 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
      <defs><filter id={`ccProjectileGlow-${suffix}`} x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="1.2" result="p" /><feMerge><feMergeNode in="p" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
      <path d={path} fill="none" stroke={color} strokeWidth={step.event.code === 'death_bolt' ? 1.5 : .45} strokeLinecap="round" opacity={authoredProjectile ? '.16' : '.36'} className="cc-projectile-trail" />
      {authoredProjectile ? (
        <g>
          <animateMotion dur={`${duration}ms`} begin="0s" fill="freeze" path={path} rotate="0" />
          {/* Authored arrows have different diagonal axes. Calibrate inside a square
              canvas, independently of motion and the responsive SVG viewport. */}
          <svg x="-3" y="-3" width="6" height="6" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" overflow="visible">
            <image href={authoredProjectile} x="10" y="10" width="80" height="80" preserveAspectRatio="xMidYMid meet" className="cc-authored-projectile" transform={`rotate(${(target.y >= actor.y ? 90 : -90) - getCommanderProjectileAngle(actorCombatant.id)} 50 50)`} />
          </svg>
        </g>
      ) : (
        <>
          <circle r={step.event.code === 'death_bolt' ? 1.8 : 1} fill="#fff" filter={`url(#ccProjectileGlow-${suffix})`} className="cc-projectile-orb">
            <animateMotion dur={`${duration}ms`} begin="0s" fill="freeze" path={path} />
          </circle>
          {step.event.code === 'death_bolt' && <circle r=".8" fill="#d8b4fe" opacity=".9"><animateMotion dur={`${duration}ms`} begin="70ms" fill="freeze" path={path} /></circle>}
        </>
      )}
    </svg>
  );
};

const EventBanner: React.FC<{
  step: CommanderCinematicStep | null;
  combatants: CommanderPracticeCombatant[];
  language: CommanderLanguage;
  copy: CommanderCopy;
}> = ({ step, combatants, language, copy }) => {
  if (!step) return null;
  const actor = combatants.find((candidate) => candidate.name === step.event.actorName);
  const target = combatants.find((candidate) => candidate.name === step.event.targetName);
  const label = step.kind === 'focus_lock' ? copy.locked : step.event.code === 'death_bolt' ? copy.bolt : step.event.code === 'guard' ? copy.guard : step.event.code === 'focus_target' ? copy.focus : copy.impact;
  return (
    <div className="cc-event-banner pointer-events-none absolute left-1/2 top-4 z-[70] w-[min(92%,520px)] -translate-x-1/2 rounded-full border border-white/10 bg-slate-950/78 px-3 py-2 shadow-[0_8px_36px_rgba(2,6,23,.58)] backdrop-blur-lg">
      <div className="flex items-center justify-center gap-2" dir="ltr">
        {actor && <div className="h-8 w-8 shrink-0"><CommanderUnitPortrait combatant={actor} instance={`stage-actor-${step.id}`} defeated={actor.hp <= 0} /></div>}
        <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-violet-100"><ActionGlyph step={step} className="h-5 w-5" />{label}</span>
        {target && <div className="h-8 w-8 shrink-0"><CommanderUnitPortrait combatant={target} instance={`stage-target-${step.id}`} defeated={target.hp <= 0} /></div>}
        {step.kind === 'attack' && step.hpDamage > 0 && <span className="text-[10px] font-black text-red-300">-{step.hpDamage} HP</span>}
        {step.kind === 'guard' && (step.event.amount ?? 0) > 0 && <span className="text-[10px] font-black text-cyan-200">+{step.event.amount} SH</span>}
      </div>
      <span className="sr-only">{commanderEventText(step.event, language)}</span>
    </div>
  );
};

const CommanderCinematicBattlefield: React.FC<Props> = ({
  combatants,
  onIntroReady,
  soundOn,
  onToggleSound,
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
  turn,
  maxTurns,
  expiresAt,
  deathBoltCooldown,
  busy,
  onSelectTarget,
  onToggleAnimations,
  onToggleEffects,
  onToggleSpeed,
  onMove,
  onRestart,
}) => {
  const intro = useCommanderIntro(combatants, onIntroReady, soundOn, animationsOn);
  const boardScroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (intro.done) return;
    const board = boardScroll.current;
    if (!board) return;
    const reduced = !animationsOn || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    board.scrollTo({ left: intro.team === 'enemy' ? board.scrollWidth - board.clientWidth : intro.team === 'player' ? 0 : (board.scrollWidth - board.clientWidth) / 2, behavior: reduced ? 'instant' : 'smooth' });
  }, [intro.team, intro.done, animationsOn]);
  const lastSoundKeyRef = useRef('');
  const isDeathBoltImpact = effectsOn && activeStep?.event.code === 'death_bolt' && phase === 'impact';
  const outcomeLabel = status === 'victory' ? copy.victory : status === 'defeat' ? copy.defeat : status === 'draw' ? copy.draw : null;
  const expiry = new Date(expiresAt).toLocaleTimeString(language === 'ar' ? 'ar' : language === 'ru' ? 'ru-RU' : 'en-US', { hour: '2-digit', minute: '2-digit' });

  useEffect(() => {
    if (!activeStep) {
      lastSoundKeyRef.current = '';
      return;
    }
    if (!soundOn || !phase) return;

    const key = `${activeStep.id}:${phase}`;
    if (lastSoundKeyRef.current === key) return;
    lastSoundKeyRef.current = key;

    const actor = combatants.find((candidate) => candidate.name === activeStep.event.actorName);
    let cue: CommanderSfxCue | null = null;
    if (phase === 'windup') {
      if (activeStep.kind === 'focus_lock' || activeStep.event.code === 'focus_target') cue = 'focus';
      else if (activeStep.event.code === 'death_bolt') cue = 'deathBoltCharge';
      else if (activeStep.kind === 'attack') cue = actor && isCommanderRangedSprite(actor.id) ? 'rangedFire' : 'meleeWindup';
    }
    if (phase === 'impact') {
      if (activeStep.kind === 'guard') cue = 'guard';
      else if (activeStep.kind === 'defeat') cue = 'ko';
      else if (activeStep.kind === 'outcome') cue = activeStep.event.code === 'battle_victory' ? 'victory' : activeStep.event.code === 'battle_defeat' ? 'defeat' : 'draw';
      else if (activeStep.event.code === 'death_bolt') cue = 'deathBoltImpact';
      else if (activeStep.kind === 'attack') cue = activeStep.shieldDamage > 0 ? 'shieldHit' : 'hit';
    }
    if (cue) void playCommanderSfx(cue);
  }, [activeStep, phase, soundOn, combatants]);

  const handleSelectTarget = (id: string) => {
    if (!intro.done || busy) return;
    if (soundOn) {
      void unlockCommanderAudio();
      void playCommanderSfx('select');
    }
    onSelectTarget(id);
  };

  const handleMove = (move: CommanderPracticeMove) => {
    if (!intro.done || busy) return;
    if (soundOn) {
      void unlockCommanderAudio();
      void playCommanderSfx('ui');
    }
    onMove(move);
  };

  const toggleSound = () => {
    const next = !soundOn;
    onToggleSound();
    if (next) void unlockCommanderAudio();
    else stopCommanderAudio();
  };

  const unit = (combatant: CommanderPracticeCombatant) => {
    const point = getCommanderFormationPoint(combatant);
    const selected = intro.done && combatant.side === 'enemy' && selectedTargetId === combatant.id;
    const focused = combatant.side === 'enemy' ? playerFocusTarget === combatant.id : enemyFocusTarget === combatant.id;
    const actor = activeStep?.event.actorName === combatant.name;
    const target = activeStep?.event.targetName === combatant.name;
    const defeat = activeStep?.kind === 'defeat' && activeStep.event.actorName === combatant.name;
    const guard = activeStep?.kind === 'guard' && activeStep.event.actorName === combatant.name;
    const focusLock = activeStep?.kind === 'focus_lock' && activeStep.event.targetName === combatant.name;
    const canTarget = intro.done && combatant.side === 'enemy' && targetable && combatant.hp > 0;
    const impactTarget = Boolean(target && phase === 'impact');
    const impactGuard = Boolean(guard && phase === 'impact');
    const shieldOnlyHit = Boolean(activeStep?.kind === 'attack' && activeStep.shieldDamage > 0 && activeStep.hpDamage === 0);
    const pose = resolveSpritePose(combatant, activeStep, phase);

    let actionClass = '';
    if (actor && animationsOn) {
      if (guard) actionClass = 'cc-actor-guard';
      else if (activeStep?.event.code === 'death_bolt') actionClass = 'cc-actor-deathbolt';
      else if (activeStep?.event.code === 'focus_target' || activeStep?.kind === 'focus_lock') actionClass = 'cc-actor-focus';
      else if (activeStep?.kind === 'attack' && isCommanderRangedSprite(combatant.id)) actionClass = 'cc-actor-ranged';
      else if (activeStep?.kind === 'attack') actionClass = combatant.side === 'player' ? 'cc-actor-melee-right' : 'cc-actor-melee-left';
    }

    const hitClass = impactTarget && animationsOn
      ? activeStep?.event.code === 'death_bolt' ? 'cc-target-hit-heavy' : shieldOnlyHit ? 'cc-target-hit-shield' : 'cc-target-hit'
      : '';

    return (
      <button
        type="button"
        key={combatant.id}
        disabled={!canTarget}
        onClick={() => canTarget && handleSelectTarget(combatant.id)}
        className={`cc-stage-unit absolute bg-transparent p-0 text-center outline-none ${canTarget ? 'cursor-pointer' : 'cursor-default'} ${combatant.hp <= 0 ? 'opacity-75' : ''}`}
        style={{
          left: `${point.x}%`,
          top: `${point.y}%`,
          width: 'min(11cqw, 150px, 22cqh)',
          zIndex: point.z,
          transform: 'translate(-50%, -82%)',
        }}
        aria-label={`${combatant.name}${selected ? `, ${copy.selected}` : ''}`}
      >
        <div className="cc-deployment-shell" style={{ opacity: intro.done || intro.revealed.includes(combatant.id) ? 1 : 0, transform: intro.done || intro.revealed.includes(combatant.id) ? 'translateY(0) scale(1)' : 'translateY(10px) scale(.85)', transition: animationsOn ? 'opacity 260ms ease-out, transform 320ms ease-out' : 'none' }}>
        <div className="cc-stage-scale-shell relative" style={{ transform: `scale(${point.scale})`, transformOrigin: '50% 86%' }}>
          <span aria-hidden className={`absolute left-1/2 top-[87%] h-5 w-[76%] -translate-x-1/2 rounded-[50%] border transition-[box-shadow,border-color,background-color,opacity] duration-200 ${selected ? 'border-amber-300/90 bg-amber-300/12 shadow-[0_0_26px_rgba(251,191,36,.5)]' : combatant.side === 'player' ? 'border-cyan-300/35 bg-cyan-300/[0.04]' : 'border-rose-300/35 bg-rose-300/[0.04]'} ${focused || focusLock ? 'cc-stage-focus-ground' : ''}`} />
          <TacticalTargetReticle selected={selected} focused={focused} focusLock={focusLock} />

          <div className={`cc-stage-action-shell relative mx-auto aspect-[1/1.55] w-full origin-bottom ${actionClass} ${hitClass} ${defeat && animationsOn ? 'cc-stage-defeat' : ''}`}>
            <CommanderBattleSprite combatant={combatant} pose={pose} active={Boolean(actor)} defeated={pose === 'defeated'} />
            {actor && activeStep?.event.code === 'death_bolt' && phase === 'windup' && effectsOn && <DeathBoltCharge />}
            {guard && effectsOn && phase !== 'settle' && <span aria-hidden className="cc-stage-shield-bloom absolute inset-x-[8%] bottom-[6%] top-[8%] rounded-[48%] border-2 border-cyan-200/75 bg-cyan-300/[0.08] shadow-[0_0_38px_rgba(34,211,238,.62)]" />}
            {impactTarget && effectsOn && activeStep?.kind === 'attack' && <ImpactBurst deathBolt={activeStep.event.code === 'death_bolt'} shieldOnly={shieldOnlyHit} />}
          </div>

          <div className="relative z-30 -mt-4 px-1">
            <div className="mx-auto max-w-[160px] break-words text-[9px] font-black leading-3 text-white [text-shadow:0_2px_6px_rgba(2,6,23,1)] sm:text-[11px]">{combatant.name}</div>
            {combatant.role === 'commander' && <span className="mt-0.5 inline-block text-[7px] font-black uppercase tracking-[0.18em] text-violet-200">CMD</span>}
            {combatant.hp > 0 ? (
              <div className="mx-auto mt-1 w-[88%] max-w-[136px]">
                <div className="flex items-center justify-between text-[7px] font-bold text-slate-100 sm:text-[9px]"><span>{combatant.hp}/{combatant.maxHp}</span><span className="text-cyan-200">◇{combatant.shield}</span></div>
                <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-950/90 ring-1 ring-black/40"><div className="h-full bg-gradient-to-r from-emerald-400 to-lime-300 transition-[width] duration-500" style={{ width: `${hpPercent(combatant)}%` }} /></div>
                <div className="mt-0.5 h-0.5 overflow-hidden rounded-full bg-slate-950/90"><div className="h-full bg-gradient-to-r from-sky-500 to-cyan-200 transition-[width] duration-500" style={{ width: `${shieldPercent(combatant)}%` }} /></div>
              </div>
            ) : <div className="mt-1 text-[8px] font-black uppercase tracking-[0.18em] text-red-300">{copy.knockedOut}</div>}
          </div>

          {impactTarget && activeStep?.kind === 'attack' && (
            <span key={`${activeStep.id}-damage`} className="pointer-events-none absolute left-1/2 top-[2%] z-[80] flex -translate-x-1/2 flex-col items-center whitespace-nowrap">
              {activeStep.shieldDamage > 0 && <CombatFloat tone="shieldDamage" compact>◇ -{activeStep.shieldDamage} {copy.shield}</CombatFloat>}
              {activeStep.hpDamage > 0 && <CombatFloat tone="damage" delayMs={activeStep.shieldDamage > 0 ? 120 : 0}>-{activeStep.hpDamage}</CombatFloat>}
            </span>
          )}
          {impactGuard && <span key={`${activeStep?.id}-guard`} className="pointer-events-none absolute left-1/2 top-[5%] z-[80] -translate-x-1/2 whitespace-nowrap"><CombatFloat tone="shieldGain">+{activeStep?.event.amount ?? 0} {copy.shield}</CombatFloat></span>}
          {defeat && phase === 'impact' && <span className="pointer-events-none absolute left-1/2 top-[5%] z-[80] -translate-x-1/2"><CombatFloat tone="ko">K.O.</CombatFloat></span>}
        </div>
        </div>
      </button>
    );
  };

  return (
    <section className={`relative overflow-hidden rounded-[2rem] border border-cyan-400/24 bg-[#020617] shadow-[0_0_70px_rgba(34,211,238,.1)] ${isDeathBoltImpact && animationsOn ? 'cc-stage-arena-hit' : ''}`}>
      <style>{`
        @keyframes ccOpeningFade{from{opacity:1}to{opacity:0}}
        .cc-opening-black{animation:ccOpeningFade 450ms ease-out forwards}
        @keyframes ccActorMeleeRight{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}58%{transform:translateX(24px)}76%{transform:translateX(16px)}}
        @keyframes ccActorMeleeLeft{0%,100%{transform:translateX(0)}25%{transform:translateX(5px)}58%{transform:translateX(-24px)}76%{transform:translateX(-16px)}}
        @keyframes ccActorRanged{0%,100%{transform:translateY(0) rotate(0)}28%{transform:translateY(3px) rotate(-1deg)}52%{transform:translateY(-4px) rotate(1deg)}68%{transform:translateY(-2px)}}
        @keyframes ccActorFocus{0%,100%{transform:translateY(0) scale(1)}42%{transform:translateY(-5px) scale(1.025)}62%{filter:brightness(1.35)}}
        @keyframes ccActorDeathBolt{0%,100%{transform:translateY(0) scale(1)}32%{transform:translateY(4px) scale(.985)}63%{transform:translateY(-8px) scale(1.04);filter:brightness(1.5)}}
        @keyframes ccActorGuard{0%,100%{transform:translateY(0) scale(1)}38%{transform:translateY(4px) scale(1.025,.97)}65%{filter:brightness(1.28)}}
        @keyframes ccTargetHit{0%,100%{transform:translateX(0)}18%{transform:translateX(-7px);filter:brightness(1.8)}38%{transform:translateX(6px)}58%{transform:translateX(-3px)}}
        @keyframes ccTargetHitShield{0%,100%{transform:translateX(0)}22%{transform:translateX(-4px);filter:brightness(1.55)}48%{transform:translateX(3px)}}
        @keyframes ccTargetHitHeavy{0%,100%{transform:translateX(0) scale(1)}12%{transform:translateX(-9px) scale(1.025);filter:brightness(2.2)}29%{transform:translateX(8px)}48%{transform:translateX(-5px)}68%{transform:translateX(3px)}}
        @keyframes ccStageDefeat{0%{opacity:1;filter:brightness(1)}55%{opacity:.82;filter:brightness(.82)}100%{opacity:.62;filter:brightness(.7)}}
        @keyframes ccTargetSpin{to{transform:rotate(360deg)}}
        @keyframes ccFocusSpin{to{transform:rotate(-360deg)}}
        @keyframes ccTargetChevron{0%,100%{transform:translateY(0);opacity:.8}50%{transform:translateY(7px);opacity:1}}
        @keyframes ccStageFocusGround{0%,100%{box-shadow:0 0 10px rgba(232,121,249,.25)}50%{box-shadow:0 0 30px rgba(232,121,249,.75)}}
        @keyframes ccStageShield{0%{transform:scale(.6);opacity:0}45%{transform:scale(1.06);opacity:1}100%{transform:scale(1.25);opacity:0}}
        @keyframes ccStageFloat{0%{opacity:0;transform:translate3d(0,14px,0) scale(.76)}14%{opacity:1;transform:translate3d(0,-2px,0) scale(1.16)}70%{opacity:1;transform:translate3d(0,-58px,0) scale(1)}100%{opacity:0;transform:translate3d(0,-90px,0) scale(.94)}}
        @keyframes ccStageBurst{0%{opacity:0;transform:translate(-50%,-50%) scale(.3)}25%{opacity:1;transform:translate(-50%,-50%) scale(1.06)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.55)}}
        @keyframes ccStageArenaHit{0%,100%{transform:translateX(0)}20%{transform:translateX(-3px)}40%{transform:translateX(3px)}60%{transform:translateX(-2px)}80%{transform:translateX(1px)}}
        @keyframes ccStageEvent{from{opacity:0;transform:translate(-50%,-8px) scale(.98)}to{opacity:1;transform:translate(-50%,0) scale(1)}}
        @keyframes ccStageTrail{from{stroke-dashoffset:18}to{stroke-dashoffset:0}}
        @keyframes ccDeathCharge{0%{opacity:0;transform:translate(-50%,-50%) scale(.35) rotate(0)}45%{opacity:1;transform:translate(-50%,-50%) scale(1) rotate(120deg)}100%{opacity:.82;transform:translate(-50%,-50%) scale(.82) rotate(220deg)}}
        @keyframes ccSpriteSwap{0%{opacity:.45;filter:brightness(.82)}100%{opacity:1;filter:brightness(1)}}
        .cc-stage-unit:hover,.cc-stage-unit:focus-visible{transform:translate(-50%,-82%)!important}
        .cc-stage-unit:hover .cc-stage-action-shell,.cc-stage-unit:focus-visible .cc-stage-action-shell{filter:brightness(1.06) drop-shadow(0 0 9px rgba(251,191,36,.12))}
        .cc-authored-sprite{animation:ccSpriteSwap 150ms ease-out}
        .cc-actor-melee-right{animation:ccActorMeleeRight 900ms cubic-bezier(.16,.84,.24,1)}
        .cc-actor-melee-left{animation:ccActorMeleeLeft 900ms cubic-bezier(.16,.84,.24,1)}
        .cc-actor-ranged{animation:ccActorRanged 900ms cubic-bezier(.2,.8,.2,1)}
        .cc-actor-focus{animation:ccActorFocus 900ms ease-in-out}
        .cc-actor-deathbolt{animation:ccActorDeathBolt 1100ms cubic-bezier(.16,.84,.25,1)}
        .cc-actor-guard{animation:ccActorGuard 900ms ease-out}
        .cc-target-hit{animation:ccTargetHit 720ms ease-out}
        .cc-target-hit-shield{animation:ccTargetHitShield 620ms ease-out}
        .cc-target-hit-heavy{animation:ccTargetHitHeavy 820ms ease-out}
        .cc-stage-defeat{animation:ccStageDefeat 1100ms ease-out forwards}
        .cc-target-reticle-spin{transform-origin:80px 80px;animation:ccTargetSpin 5.5s linear infinite}
        .cc-focus-reticle-spin{transform-origin:80px 80px;animation:ccFocusSpin 3.6s linear infinite}
        .cc-target-chevron{animation:ccTargetChevron 1.1s ease-in-out infinite}
        .cc-stage-focus-ground{animation:ccStageFocusGround 1.6s ease-in-out infinite}
        .cc-stage-shield-bloom{animation:ccStageShield 1000ms ease-out forwards}
        .cc-combat-float{animation:ccStageFloat 1450ms cubic-bezier(.16,.82,.2,1) forwards;will-change:transform,opacity}
        .cc-impact-burst{animation:ccStageBurst 720ms ease-out forwards}
        .cc-stage-arena-hit{animation:ccStageArenaHit 240ms linear}
        .cc-event-banner{animation:ccStageEvent 260ms ease-out}
        .cc-projectile-trail{stroke-dasharray:3 3;animation:ccStageTrail 320ms linear infinite}
        .cc-projectile-orb,.cc-authored-projectile{filter:drop-shadow(0 0 10px rgba(255,255,255,.95))}
        .cc-deathbolt-charge{animation:ccDeathCharge 900ms ease-out forwards}
        @media(prefers-reduced-motion:reduce){.cc-deployment-shell{transition:none!important}.cc-opening-black{animation:none;opacity:0}.cc-authored-sprite,.cc-actor-melee-right,.cc-actor-melee-left,.cc-actor-ranged,.cc-actor-focus,.cc-actor-deathbolt,.cc-actor-guard,.cc-target-hit,.cc-target-hit-shield,.cc-target-hit-heavy,.cc-stage-defeat,.cc-target-reticle-spin,.cc-focus-reticle-spin,.cc-target-chevron,.cc-stage-focus-ground,.cc-stage-shield-bloom,.cc-combat-float,.cc-impact-burst,.cc-stage-arena-hit,.cc-event-banner,.cc-projectile-trail,.cc-deathbolt-charge{animation:none!important}}
      `}</style>

      <div className="relative z-[90] flex flex-wrap items-center justify-between gap-2 border-b border-white/5 bg-slate-950/54 px-3 py-2.5 backdrop-blur-md sm:px-4">
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold">
          <span className="font-heading text-cyan-100">⚔ {copy.turn} {turn} {copy.of} {maxTurns}</span>
          <span className="text-slate-400">⏱ {copy.expires}: {expiry}</span>
          <span className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.16em] ${targetable ? 'bg-cyan-400/10 text-cyan-200' : 'bg-violet-400/10 text-violet-200'}`}>{busy ? copy.resolving : targetable ? copy.waiting : outcomeLabel ?? copy.waiting}</span>
        </div>
        <div className="flex items-center gap-1.5" dir="ltr">
          <button type="button" onClick={onToggleAnimations} className={`rounded-full border px-2 py-1 text-[9px] font-bold ${animationsOn ? 'border-emerald-400/30 text-emerald-200' : 'border-slate-700 text-slate-500'}`}>{animationsOn ? '●' : '○'} {copy.animations}</button>
          <button type="button" onClick={onToggleEffects} className={`rounded-full border px-2 py-1 text-[9px] font-bold ${effectsOn ? 'border-cyan-400/30 text-cyan-200' : 'border-slate-700 text-slate-500'}`}>✦ {copy.effects}</button>
          <button type="button" onClick={toggleSound} aria-pressed={soundOn} aria-label={copy.sound} title={copy.sound} className={`flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-bold ${soundOn ? 'border-sky-400/30 text-sky-200' : 'border-slate-700 text-slate-500'}`}><SoundGlyph enabled={soundOn} /><span className="hidden sm:inline">{copy.sound}</span></button>
          <button type="button" onClick={onToggleSpeed} className="rounded-full border border-violet-400/30 px-2 py-1 text-[9px] font-bold text-violet-200">{speed}×</button>
          <button type="button" onClick={onRestart} disabled={busy || !intro.done} className="rounded-full border border-slate-700 px-2 py-1 text-[9px] font-bold text-slate-300 disabled:opacity-40">↻</button>
        </div>
      </div>

      <div className="relative">
      <p className="px-4 py-1 text-center text-[10px] text-slate-400 sm:hidden">Swipe across the battlefield to inspect both formations.</p>
      <div ref={boardScroll} className="overflow-x-auto" tabIndex={0} aria-label="Battlefield" dir="ltr">
      <div className="cc-battle-board relative min-w-[640px] overflow-hidden" style={{ height: 'clamp(440px, 68svh, 650px)', containerType: 'size' }} dir="ltr">
        <TacticalBackdrop />
        {!intro.done && <div aria-hidden className="cc-opening-black pointer-events-none absolute inset-0 z-[80] bg-black" />}
        {!intro.done && <div aria-hidden className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,.7))]" />}
        {!intro.done && intro.team && <div aria-hidden className={`pointer-events-none absolute inset-y-0 w-1/2 ${intro.team === 'player' ? 'left-0 bg-cyan-400/5' : 'right-0 bg-fuchsia-400/5'}`} />}
        {effectsOn && <><span aria-hidden className="pointer-events-none absolute left-[7%] top-[28%] h-40 w-40 rounded-full bg-cyan-400/[0.06] blur-3xl" /><span aria-hidden className="pointer-events-none absolute right-[7%] top-[28%] h-40 w-40 rounded-full bg-fuchsia-500/[0.06] blur-3xl" /></>}
        <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-between px-4 text-[8px] font-black uppercase tracking-[0.2em] sm:px-6 sm:text-[10px]"><span className="text-cyan-300">● {copy.you}</span><span className="text-fuchsia-300">{targetable ? `◎ ${copy.selectTarget}` : `● ${copy.enemy}`}</span></div>
        <EventBanner step={activeStep} combatants={combatants} language={language} copy={copy} />
        {combatants.map(unit)}
        {effectsOn && animationsOn && <ProjectilePath step={activeStep} phase={phase} combatants={combatants} speed={speed} />}

        {outcomeLabel && !activeStep && (
          <div className="pointer-events-none absolute inset-0 z-[100] flex items-center justify-center bg-slate-950/30 backdrop-blur-[1px]">
            <div className="text-center"><div className="text-5xl" aria-hidden>{status === 'victory' ? '🏆' : status === 'defeat' ? '☠️' : '⚖️'}</div><div className={`mt-2 font-heading text-2xl font-black sm:text-4xl ${status === 'victory' ? 'text-emerald-300' : status === 'defeat' ? 'text-red-300' : 'text-amber-300'}`}>{outcomeLabel}</div><p className="mt-1 text-xs text-slate-300">{copy.finishedNote}</p></div>
          </div>
        )}
      </div>

      </div>
      {!intro.done && <div className="absolute inset-0 z-[100] flex flex-col items-center justify-start pt-12 pointer-events-none">
        <div role="status" aria-live="polite" className="rounded-2xl border border-white/10 bg-slate-950/85 px-5 py-3 text-center shadow-2xl">
          <p className="text-[9px] uppercase tracking-[.3em] text-slate-400">Cursed Commander</p>
          <p className={`mt-1 font-heading text-lg font-black tracking-widest sm:text-2xl ${intro.team === 'enemy' ? 'text-fuchsia-200' : 'text-cyan-100'}`}>{intro.team ? (intro.team === 'player' ? copy.you : intro.team === 'enemy' ? copy.enemy : intro.team) : intro.label}</p>
        </div>
        <button type="button" onClick={intro.skip} className="pointer-events-auto mt-3 rounded-full border border-white/20 bg-slate-950/90 px-4 py-2 text-[10px] font-bold tracking-widest text-slate-200">SKIP INTRO</button>
      </div>}
      </div>
      {status === 'active' && <CommanderCommandDock copy={copy} busy={busy || !intro.done} selectedTargetId={selectedTargetId} deathBoltCooldown={deathBoltCooldown} onMove={handleMove} />}
      {isDeathBoltImpact && <div aria-hidden className="pointer-events-none absolute inset-0 z-40 bg-[radial-gradient(circle_at_50%_46%,rgba(216,180,254,.24),transparent_34%)] mix-blend-screen" />}
    </section>
  );
};

export default CommanderCinematicBattlefield;
