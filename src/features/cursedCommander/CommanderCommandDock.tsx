import React from 'react';
import type { CommanderPracticeMove } from '../../../services/commanderPracticeService';
import type { CommanderCopy } from './commanderPracticeCopy';

type Props = {
  copy: CommanderCopy;
  busy: boolean;
  selectedTargetId: string | null;
  deathBoltCooldown: number;
  onMove: (move: CommanderPracticeMove) => void;
};

type Command = {
  move: CommanderPracticeMove;
  icon: React.ReactNode;
  label: string;
  hint: string;
  tone: 'cyan' | 'violet' | 'amber';
};

const FocusIcon = () => (
  <svg aria-hidden viewBox="0 0 48 48" className="h-7 w-7">
    <g fill="none" stroke="currentColor" strokeWidth="3"><circle cx="24" cy="24" r="9" /><circle cx="24" cy="24" r="2.5" fill="currentColor" /><path d="M24 5v8M24 35v8M5 24h8M35 24h8" strokeLinecap="round" /></g>
  </svg>
);

const BoltIcon = () => (
  <svg aria-hidden viewBox="0 0 48 48" className="h-7 w-7">
    <path d="M27 4 10 27h12l-3 17 19-26H26Z" fill="currentColor" />
  </svg>
);

const GuardIcon = () => (
  <svg aria-hidden viewBox="0 0 48 48" className="h-7 w-7">
    <path d="M24 5 39 11v12c0 10-6 16-15 20C15 39 9 33 9 23V11Z" fill="currentColor" opacity=".2" /><path d="M24 5 39 11v12c0 10-6 16-15 20C15 39 9 33 9 23V11Z" fill="none" stroke="currentColor" strokeWidth="3" />
  </svg>
);

const CommanderCommandDock: React.FC<Props> = ({ copy, busy, selectedTargetId, deathBoltCooldown, onMove }) => {
  const commands: Command[] = [
    { move: 'focus_target', icon: <FocusIcon />, label: copy.focus, hint: copy.focusHint, tone: 'cyan' },
    { move: 'death_bolt', icon: <BoltIcon />, label: copy.bolt, hint: copy.boltHint, tone: 'violet' },
    { move: 'guard', icon: <GuardIcon />, label: copy.guard, hint: copy.guardHint, tone: 'amber' },
  ];

  const toneClass = {
    cyan: 'text-cyan-200 border-cyan-300/35 hover:border-cyan-200/75 hover:bg-cyan-300/10',
    violet: 'text-violet-200 border-violet-300/40 hover:border-violet-200/80 hover:bg-violet-300/10 shadow-[0_0_28px_rgba(139,92,246,.09)]',
    amber: 'text-amber-200 border-amber-300/35 hover:border-amber-200/75 hover:bg-amber-300/10',
  } as const;

  return (
    <div className="relative z-50 mx-auto w-full max-w-3xl px-2 pb-2 sm:px-4">
      <div className="rounded-[1.4rem] border border-white/10 bg-slate-950/86 p-2 shadow-[0_-10px_45px_rgba(2,6,23,.7)] backdrop-blur-xl sm:p-3">
        <div className="mb-2 flex items-center justify-between px-2">
          <span className="font-heading text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">⚡ {copy.actions}</span>
          {busy && <span className="animate-pulse text-[10px] font-bold text-cyan-200">{copy.resolving}</span>}
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {commands.map((command) => {
            const targetRequired = command.move !== 'guard';
            const cooldown = command.move === 'death_bolt' ? deathBoltCooldown : 0;
            const disabled = busy || (targetRequired && !selectedTargetId) || cooldown > 0;
            return (
              <button
                key={command.move}
                type="button"
                disabled={disabled}
                onClick={() => onMove(command.move)}
                className={`group relative min-h-20 overflow-hidden border bg-slate-900/75 px-2 py-2 text-center transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-35 sm:min-h-24 sm:px-3 ${toneClass[command.tone]}`}
                style={{ clipPath: 'polygon(9% 0,91% 0,100% 20%,100% 80%,91% 100%,9% 100%,0 80%,0 20%)' }}
                title={command.hint}
              >
                <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-current/20 bg-current/[0.06] transition-transform group-hover:scale-110">{command.icon}</span>
                <strong className="mt-1.5 block truncate text-[10px] font-black sm:text-xs">{command.label}</strong>
                <span className="mt-1 hidden text-[9px] leading-3 text-slate-400 sm:block">{command.hint}</span>
                {cooldown > 0 && (
                  <span className="absolute end-1.5 top-1.5 rounded-full border border-slate-500/40 bg-slate-950/90 px-1.5 py-0.5 text-[8px] font-black text-slate-200">{cooldown}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CommanderCommandDock;
