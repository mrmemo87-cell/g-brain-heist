import React, { useEffect, useMemo, useState } from 'react';
import type { XpStatus } from '../../types';
import { CoinIcon, XPIcon } from '../icons';

type CompletionAction = 'next_mission' | 'dashboard' | 'streak';

export interface MissionCompleteOverlayProps {
  open: boolean;
  title?: string;
  missionLabel: string;
  xpGained: number;
  coinsGained: number;
  gemsGained?: number;
  accuracyPercent?: number | null;
  streakPeak?: number | null;
  currentLevel: number;
  previousLevel?: number | null;
  xpStatus?: XpStatus | null;
  onSkip: () => void;
  onAction: (action: CompletionAction) => void;
  onEvent?: (event: 'reward_revealed' | 'level_progress_seen' | 'continue_after_completion', metadata?: Record<string, unknown>) => void;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const normalizeProgress = (value: number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return clamp01(value > 1 ? value / 100 : value);
};

const useCountUp = (target: number, delayMs: number, durationMs: number, enabled: boolean): number => {
  const [value, setValue] = useState(enabled ? 0 : target);

  useEffect(() => {
    if (!enabled) {
      setValue(target);
      return;
    }

    setValue(0);
    let frame = 0;
    let start: number | null = null;
    const timeout = window.setTimeout(() => {
      const tick = (timestamp: number) => {
        if (start === null) start = timestamp;
        const elapsed = timestamp - start;
        const progress = clamp01(elapsed / durationMs);
        const eased = 1 - Math.pow(1 - progress, 3);
        setValue(Math.round(target * eased));
        if (progress < 1) {
          frame = window.requestAnimationFrame(tick);
        }
      };
      frame = window.requestAnimationFrame(tick);
    }, delayMs);

    return () => {
      window.clearTimeout(timeout);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [delayMs, durationMs, enabled, target]);

  return value;
};

const MissionCompleteOverlay: React.FC<MissionCompleteOverlayProps> = ({
  open,
  title = 'Mission cleared',
  missionLabel,
  xpGained,
  coinsGained,
  gemsGained = 0,
  accuracyPercent,
  streakPeak,
  currentLevel,
  previousLevel,
  xpStatus,
  onSkip,
  onAction,
  onEvent,
}) => {
  const [visible, setVisible] = useState(open);
  const [barArmed, setBarArmed] = useState(false);
  const [actionsVisible, setActionsVisible] = useState(false);
  const countedXp = useCountUp(Math.max(0, xpGained), 450, 900, open);
  const countedCoins = useCountUp(Math.max(0, coinsGained), 900, 850, open);
  const countedGems = useCountUp(Math.max(0, gemsGained), 1100, 750, open);
  const levelUp = typeof previousLevel === 'number' && currentLevel > previousLevel;

  const progress = useMemo(() => {
    const end = normalizeProgress(xpStatus?.progress);
    const levelStart = xpStatus?.level_xp_start ?? 0;
    const levelNext = xpStatus?.level_xp_next ?? 0;
    const span = Math.max(1, levelNext - levelStart);
    const start = levelUp ? 0 : clamp01(end - Math.max(0, xpGained) / span);
    return { start, end };
  }, [levelUp, xpGained, xpStatus?.level_xp_next, xpStatus?.level_xp_start, xpStatus?.progress]);

  useEffect(() => {
    if (!open) {
      setBarArmed(false);
      setActionsVisible(false);
      const hide = window.setTimeout(() => setVisible(false), 180);
      return () => window.clearTimeout(hide);
    }

    setVisible(true);
    setBarArmed(false);
    setActionsVisible(false);
    const progressTimer = window.setTimeout(() => {
      setBarArmed(true);
      onEvent?.('level_progress_seen', { level: currentLevel, level_up: levelUp });
    }, 650);
    const rewardTimer = window.setTimeout(() => {
      onEvent?.('reward_revealed', { xp: xpGained, coins: coinsGained, gems: gemsGained });
    }, 1000);
    const actionTimer = window.setTimeout(() => setActionsVisible(true), 2300);

    return () => {
      window.clearTimeout(progressTimer);
      window.clearTimeout(rewardTimer);
      window.clearTimeout(actionTimer);
    };
  }, [coinsGained, currentLevel, gemsGained, levelUp, onEvent, open, xpGained]);

  if (!visible) return null;

  const action = (nextAction: CompletionAction) => {
    onEvent?.('continue_after_completion', { action: nextAction });
    onAction(nextAction);
  };

  return (
    <div
      className={`fixed inset-0 z-[260] flex items-end justify-center bg-slate-950/72 p-3 backdrop-blur-md transition-opacity duration-200 sm:items-center sm:p-6 ${open ? 'opacity-100' : 'opacity-0'}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="mission-complete-title"
    >
      <div className="relative w-full max-w-2xl overflow-hidden rounded-[1.75rem] border border-cyan-300/30 bg-slate-950/95 p-5 text-left shadow-[0_0_60px_rgba(34,211,238,0.20)] sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-16 h-52 w-52 rounded-full bg-fuchsia-500/14 blur-3xl" />
        <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/80 to-transparent" />

        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-cyan-200/80">Mission Control</p>
            <h2 id="mission-complete-title" className="mt-2 font-heading text-3xl text-white sm:text-4xl">
              {title}
            </h2>
            <p className="mt-2 text-sm text-slate-300">{missionLabel} logged. Rewards verified. Next route is ready.</p>
          </div>
          <button
            type="button"
            onClick={onSkip}
            className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-cyan-300/50 hover:text-white"
          >
            Skip
          </button>
        </div>

        <div className="relative mt-6 grid gap-3 sm:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/5 p-4 shadow-[inset_0_0_32px_rgba(34,211,238,0.05)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Rank signal</p>
                <p className="mt-1 font-heading text-xl text-cyan-100">Level {currentLevel}</p>
              </div>
              {levelUp && (
                <span className="rounded-full border border-amber-300/50 bg-amber-400/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-200 shadow-[0_0_18px_rgba(251,191,36,0.18)]">
                  Level up
                </span>
              )}
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-800 ring-1 ring-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-blue-400 to-fuchsia-400 shadow-[0_0_18px_rgba(56,189,248,0.5)] transition-[width] duration-[1400ms] ease-out"
                style={{ width: `${(barArmed ? progress.end : progress.start) * 100}%` }}
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
              <span>{Math.round((barArmed ? progress.end : progress.start) * 100)}% synced</span>
              <span>{xpStatus?.xp_to_next ?? '—'} XP to next level</span>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-300/20 bg-amber-300/5 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Reward reveal</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-cyan-300/20 bg-black/20 p-3">
                <XPIcon className="mb-2 h-5 w-5 text-cyan-300" />
                <p className="font-heading text-2xl text-white">+{countedXp}</p>
                <p className="text-xs text-slate-400">XP gained</p>
              </div>
              <div className="rounded-xl border border-amber-300/20 bg-black/20 p-3">
                <CoinIcon className="mb-2 h-5 w-5 text-amber-300" />
                <p className="font-heading text-2xl text-white">+{countedCoins}</p>
                <p className="text-xs text-slate-400">Coins</p>
              </div>
            </div>
            {gemsGained > 0 && <p className="mt-3 text-sm text-fuchsia-200">Gemstones secured: +{countedGems}</p>}
          </div>
        </div>

        <div className="relative mt-4 grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Accuracy</p>
            <p className="mt-1 font-heading text-lg text-white">{typeof accuracyPercent === 'number' ? `${accuracyPercent}%` : 'Logged'}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Streak</p>
            <p className="mt-1 font-heading text-lg text-white">{typeof streakPeak === 'number' ? streakPeak : 'Active'}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Tomorrow</p>
            <p className="mt-1 font-heading text-lg text-cyan-100">Keep streak live</p>
          </div>
        </div>

        <div className={`relative mt-6 transition-all duration-500 ${actionsVisible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`}>
          <p className="mb-3 text-sm font-semibold text-slate-200">Recommended: bank the win, then clear one more short route.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <button type="button" onClick={() => action('next_mission')} className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-3 text-sm font-bold text-white shadow-[0_0_22px_rgba(34,211,238,0.25)] transition hover:scale-[1.02] active:scale-95">
              Next mission
            </button>
            <button type="button" onClick={() => action('streak')} className="rounded-xl border border-fuchsia-300/30 bg-fuchsia-400/10 px-4 py-3 text-sm font-bold text-fuchsia-100 transition hover:bg-fuchsia-400/15">
              Continue streak
            </button>
            <button type="button" onClick={() => action('dashboard')} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-slate-200 transition hover:border-cyan-300/40 hover:text-white">
              Return dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MissionCompleteOverlay;
