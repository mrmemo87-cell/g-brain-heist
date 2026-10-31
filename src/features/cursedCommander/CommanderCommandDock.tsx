import React from 'react';
import type {
  CommanderPracticeCombatant,
  CommanderPracticeMove,
  CommanderPracticeSchool,
} from '../../../services/commanderPracticeService';
import type { CommanderCopy } from './commanderPracticeCopy';

type Props = {
  copy: CommanderCopy;
  busy: boolean;
  combatants: CommanderPracticeCombatant[];
  selectedTargetId: string | null;
  deathBoltCooldown: number;
  onMove: (move: CommanderPracticeMove) => void;
};

type PowerCommand = {
  move: CommanderPracticeMove;
  school: Exclude<CommanderPracticeSchool, 'neutral'>;
  icon: React.ReactNode;
  label: string;
  hint: string;
  unlocked: boolean;
  ready: boolean;
  tone: string;
  badge: string;
};

const FocusIcon = () => (
  <svg aria-hidden viewBox="0 0 48 48" className="h-6 w-6 sm:h-7 sm:w-7">
    <g fill="none" stroke="currentColor" strokeWidth="3"><circle cx="24" cy="24" r="9" /><circle cx="24" cy="24" r="2.5" fill="currentColor" /><path d="M24 5v8M24 35v8M5 24h8M35 24h8" strokeLinecap="round" /></g>
  </svg>
);

const GuardIcon = () => (
  <svg aria-hidden viewBox="0 0 48 48" className="h-6 w-6 sm:h-7 sm:w-7">
    <path d="M24 5 39 11v12c0 10-6 16-15 20C15 39 9 33 9 23V11Z" fill="currentColor" opacity=".15" /><path d="M24 5 39 11v12c0 10-6 16-15 20C15 39 9 33 9 23V11Z" fill="none" stroke="currentColor" strokeWidth="3" />
  </svg>
);

const VoidIcon = () => (
  <svg aria-hidden viewBox="0 0 48 48" className="h-8 w-8">
    <path d="M27 4 10 27h12l-3 17 19-26H26Z" fill="currentColor" />
    <circle cx="30" cy="13" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".45" />
  </svg>
);

const StormIcon = () => (
  <svg aria-hidden viewBox="0 0 48 48" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="m8 29 11-18-1 13h12L20 42l1-13Z" fill="currentColor" opacity=".28" />
    <path d="m8 29 11-18-1 13h12L20 42l1-13Z" />
    <path d="M31 9c5 2 8 6 9 11M33 29c3 1 5 3 7 6" opacity=".65" />
  </svg>
);

const RotIcon = () => (
  <svg aria-hidden viewBox="0 0 48 48" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
    <circle cx="24" cy="24" r="9" fill="currentColor" opacity=".16" />
    <circle cx="24" cy="24" r="5" />
    <path d="M24 4v10M24 34v10M4 24h10M34 24h10M9.8 9.8l7.1 7.1M31.1 31.1l7.1 7.1M38.2 9.8l-7.1 7.1M16.9 31.1l-7.1 7.1" />
    <circle cx="24" cy="24" r="17" strokeDasharray="2 6" opacity=".7" />
  </svg>
);

const GraveIcon = () => (
  <svg aria-hidden viewBox="0 0 48 48" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 42V21c0-8 4-14 9-14s9 6 9 14v21" />
    <path d="M10 42h28M19 20h10M24 15v11" />
    <path d="M7 34c4-4 7-5 10-5M41 34c-4-4-7-5-10-5" opacity=".6" />
  </svg>
);

const schoolLabel = (school: Exclude<CommanderPracticeSchool, 'neutral'>) => school.charAt(0).toUpperCase() + school.slice(1);

const CommanderCommandDock: React.FC<Props> = ({
  copy,
  busy,
  combatants,
  selectedTargetId,
  deathBoltCooldown,
  onMove,
}) => {
  const playerUnits = combatants.filter((unit) => unit.side === 'player' && unit.role === 'unit');
  const schools = new Set(playerUnits.map((unit) => unit.school).filter(Boolean));
  const graveReady = playerUnits.some((unit) => unit.hp <= 0 || unit.hp < unit.maxHp);

  const powers: PowerCommand[] = [
    {
      move: 'death_bolt', school: 'void', icon: <VoidIcon />, label: copy.bolt, hint: copy.boltHint,
      unlocked: true, ready: Boolean(selectedTargetId), badge: 'SIGNATURE',
      tone: 'border-violet-400/35 bg-[radial-gradient(circle_at_28%_15%,rgba(217,70,239,.22),transparent_38%),linear-gradient(145deg,rgba(76,29,149,.34),rgba(15,23,42,.92))] text-fuchsia-100 shadow-[0_14px_50px_rgba(147,51,234,.16)] hover:border-fuchsia-300/70 hover:shadow-[0_18px_58px_rgba(217,70,239,.25)]',
    },
    {
      move: 'chain_surge', school: 'storm', icon: <StormIcon />, label: copy.stormPower, hint: copy.stormPowerHint,
      unlocked: schools.has('storm'), ready: Boolean(selectedTargetId), badge: 'ARC',
      tone: 'border-cyan-300/35 bg-[radial-gradient(circle_at_28%_15%,rgba(34,211,238,.24),transparent_38%),linear-gradient(145deg,rgba(3,105,161,.34),rgba(15,23,42,.92))] text-cyan-100 shadow-[0_14px_50px_rgba(14,165,233,.14)] hover:border-cyan-200/75 hover:shadow-[0_18px_58px_rgba(34,211,238,.23)]',
    },
    {
      move: 'rot_miasma', school: 'rot', icon: <RotIcon />, label: copy.rotPower, hint: copy.rotPowerHint,
      unlocked: schools.has('rot'), ready: Boolean(selectedTargetId), badge: 'AOE',
      tone: 'border-lime-300/30 bg-[radial-gradient(circle_at_25%_15%,rgba(163,230,53,.22),transparent_36%),radial-gradient(circle_at_88%_18%,rgba(217,70,239,.16),transparent_30%),linear-gradient(145deg,rgba(54,83,20,.28),rgba(20,14,34,.94))] text-lime-100 shadow-[0_14px_50px_rgba(132,204,22,.12)] hover:border-lime-200/70 hover:shadow-[0_18px_58px_rgba(163,230,53,.2)]',
    },
    {
      move: 'raise_dead', school: 'grave', icon: <GraveIcon />, label: copy.gravePower, hint: copy.gravePowerHint,
      unlocked: schools.has('grave'), ready: graveReady, badge: 'RESTORE',
      tone: 'border-emerald-300/30 bg-[radial-gradient(circle_at_28%_16%,rgba(190,242,100,.2),transparent_38%),radial-gradient(circle_at_86%_12%,rgba(250,204,21,.13),transparent_28%),linear-gradient(145deg,rgba(6,78,59,.3),rgba(15,23,42,.94))] text-lime-100 shadow-[0_14px_50px_rgba(16,185,129,.12)] hover:border-lime-200/70 hover:shadow-[0_18px_58px_rgba(132,204,22,.2)]',
    },
  ];

  const unlockedPowers = powers.filter((power) => power.unlocked);
  const lockedPowers = powers.filter((power) => !power.unlocked);
  const needsTarget = !busy && !selectedTargetId;

  return (
    // Sticky on phones so the moves stay on screen while the student looks at the battlefield.
    <div className="sticky bottom-0 z-50 mx-auto w-full max-w-5xl px-2 pb-2 sm:px-4" data-commander-dock="true">
      <div className="relative overflow-hidden rounded-[1.4rem] border border-white/10 bg-slate-950/95 p-2.5 shadow-[0_-14px_60px_rgba(2,6,23,.85)] backdrop-blur-2xl sm:p-3.5">
        <div aria-hidden className="pointer-events-none absolute inset-x-[12%] top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent" />

        <div className="relative mb-2 flex items-center justify-between gap-2 px-1">
          <span className="font-heading text-sm font-black text-white">✦ {copy.powerMatrix}</span>
          {busy ? (
            <span className="animate-pulse rounded-full border border-cyan-300/20 bg-cyan-400/[0.08] px-2.5 py-1 text-xs font-bold text-cyan-100">{copy.resolving}</span>
          ) : deathBoltCooldown > 0 ? (
            <span className="rounded-full border border-amber-300/25 bg-amber-400/[0.08] px-2.5 py-1 text-xs font-bold text-amber-100">◷ {copy.coreCooling}: {copy.cooldown} {deathBoltCooldown} {copy.rounds}</span>
          ) : (
            <span className="rounded-full border border-emerald-300/25 bg-emerald-400/[0.08] px-2 py-0.5 text-[11px] font-bold text-emerald-100">● {copy.powerCore}</span>
          )}
        </div>

        {needsTarget && (
          <p role="status" className="relative mb-2 rounded-xl border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-center text-sm font-bold text-amber-100">
            👆 {copy.waiting}
          </p>
        )}

        <div className="relative grid gap-2 lg:grid-cols-[0.8fr_2.2fr] lg:gap-3">
          <section aria-label={copy.tactical} className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            {[
              { move: 'focus_target' as const, icon: <FocusIcon />, label: copy.focus, hint: copy.focusHint, target: true, cls: 'border-cyan-300/30 text-cyan-100 hover:border-cyan-200/60 hover:bg-cyan-300/[0.07]' },
              { move: 'guard' as const, icon: <GuardIcon />, label: copy.guard, hint: copy.guardHint, target: false, cls: 'border-amber-300/30 text-amber-100 hover:border-amber-200/60 hover:bg-amber-300/[0.06]' },
            ].map((command) => {
              const disabled = busy || (command.target && !selectedTargetId);
              return (
                <button
                  key={command.move}
                  type="button"
                  disabled={disabled}
                  onClick={() => onMove(command.move)}
                  className={`group flex min-h-[56px] items-center gap-2 rounded-xl border bg-slate-900/60 px-2 py-1.5 text-left transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${command.cls}`}
                >
                  <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-current/15 bg-current/[0.05] sm:flex">{command.icon}</span>
                  <span className="min-w-0">
                    <strong className="block text-sm font-black">{command.label}</strong>
                    <span className="mt-0.5 block text-xs leading-4 text-slate-300">{command.hint}</span>
                  </span>
                </button>
              );
            })}
          </section>

          <section aria-label={copy.actions} className="grid grid-cols-2 gap-2">
            {unlockedPowers.map((power) => {
              const targetRequired = power.move !== 'raise_dead';
              const cooldown = deathBoltCooldown;
              const disabled = busy || !power.ready || (targetRequired && !selectedTargetId) || cooldown > 0;
              const status = !power.ready && power.move === 'raise_dead'
                ? copy.noSoulToRaise
                : cooldown > 0
                  ? `${copy.cooldown} ${cooldown} ${copy.rounds}`
                  : null;

              return (
                <button
                  key={power.move}
                  type="button"
                  disabled={disabled}
                  onClick={() => onMove(power.move)}
                  className={`group relative flex min-h-[56px] items-center gap-2 overflow-hidden rounded-xl border px-2 py-1.5 text-left transition-all duration-200 disabled:cursor-not-allowed ${power.tone} ${disabled ? 'opacity-50' : ''}`}
                >
                  <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-current/20 bg-slate-950/45 sm:flex">{power.icon}</span>
                  <span className="min-w-0">
                    <strong className="block text-sm font-black text-white">{power.label}</strong>
                    <span className="mt-0.5 block text-xs leading-4 text-slate-200/90">{power.hint}</span>
                    {status && <span className="mt-1 block text-xs font-bold text-amber-200">◷ {status}</span>}
                  </span>
                </button>
              );
            })}
          </section>
        </div>

        {lockedPowers.length > 0 && (
          <p className="relative mt-2 px-1 text-xs leading-5 text-slate-400">
            🔒 {lockedPowers.map((power) => `${power.label} (${schoolLabel(power.school)})`).join(' · ')} — {copy.equipToUnlock}.
          </p>
        )}
      </div>
    </div>
  );
};

export default CommanderCommandDock;