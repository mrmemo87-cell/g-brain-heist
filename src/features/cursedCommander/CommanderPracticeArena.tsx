import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  startCommanderPractice,
  submitCommanderPracticeTurn,
  type CommanderPracticeBattle,
  type CommanderPracticeCombatant,
  type CommanderPracticeMove,
  type CommanderPracticeSession,
} from '../../../services/commanderPracticeService';
import CommanderCinematicBattlefield, {
  type CommanderPlaybackPhase,
} from './CommanderCinematicBattlefield';
import {
  applyCommanderCinematicStep,
  buildCommanderCinematicSteps,
  cloneCommanderCombatants,
  type CommanderCinematicStep,
} from './commanderCinematicPlayback';
import {
  COMMANDER_COPY,
  commanderEventText,
  formatCommanderError,
  visibleCommanderEvents,
} from './commanderPracticeCopy';

type CommanderPracticeArenaProps = {
  onClose: () => void;
};

const hpPercent = (combatant: CommanderPracticeCombatant) =>
  Math.max(0, Math.min(100, Math.round((combatant.hp / combatant.maxHp) * 100)));

const CombatantCard: React.FC<{
  combatant: CommanderPracticeCombatant;
  focused: boolean;
  hpLabel: string;
  shieldLabel: string;
}> = ({ combatant, focused, hpLabel, shieldLabel }) => (
  <div className={`relative w-full rounded-2xl border p-3 text-start transition ${
    combatant.hp <= 0
      ? 'border-slate-800 bg-slate-950/50 opacity-45'
      : 'border-cyan-400/20 bg-slate-900/80'
  }`}>
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="truncate text-sm text-white">{combatant.name}</strong>
          {combatant.role === 'commander' && (
            <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-200">CMD</span>
          )}
        </div>
        {focused && combatant.hp > 0 && <span className="mt-1 block text-[11px] font-semibold text-fuchsia-300">🎯 FOCUS</span>}
      </div>
      <span aria-hidden className="text-xl">{combatant.role === 'commander' ? '🤖' : combatant.name.toLowerCase().includes('guard') ? '🛡️' : '🏹'}</span>
    </div>

    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
      <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-300 transition-[width] duration-500" style={{ width: `${hpPercent(combatant)}%` }} />
    </div>
    <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-300">
      <span>{hpLabel} {combatant.hp}/{combatant.maxHp}</span>
      <span>{shieldLabel} {combatant.shield}</span>
    </div>
  </div>
);

const sleep = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

const CommanderPracticeArena: React.FC<CommanderPracticeArenaProps> = ({ onClose }) => {
  const { language, direction } = useLanguage();
  const copy = COMMANDER_COPY[language];
  const [session, setSession] = useState<CommanderPracticeSession | null>(null);
  const [visualCombatants, setVisualCombatants] = useState<CommanderPracticeCombatant[]>([]);
  const [visualPlayerFocusTarget, setVisualPlayerFocusTarget] = useState<string | null>(null);
  const [visualEnemyFocusTarget, setVisualEnemyFocusTarget] = useState<string | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<CommanderCinematicStep | null>(null);
  const [playbackPhase, setPlaybackPhase] = useState<CommanderPlaybackPhase>(null);
  const [animationsOn, setAnimationsOn] = useState(true);
  const [effectsOn, setEffectsOn] = useState(true);
  const [speed, setSpeed] = useState<1 | 2>(1);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const pendingRequest = useRef<AbortController | null>(null);
  const playbackRun = useRef(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      playbackRun.current += 1;
      pendingRequest.current?.abort();
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  const battle = session?.battle ?? null;
  const finished = Boolean(battle && battle.status !== 'active');
  const renderedCombatants = visualCombatants.length
    ? visualCombatants
    : battle?.combatants ?? [];
  const playerCombatants = useMemo(
    () => renderedCombatants.filter((combatant) => combatant.side === 'player'),
    [renderedCombatants],
  );

  const reconcileVisualBattle = (nextBattle: CommanderPracticeBattle) => {
    setVisualCombatants(cloneCommanderCombatants(nextBattle.combatants));
    setVisualPlayerFocusTarget(nextBattle.playerFocusTarget);
    setVisualEnemyFocusTarget(nextBattle.enemyFocusTarget);
  };

  const focusIdForName = (combatants: CommanderPracticeCombatant[], name: string | undefined) =>
    combatants.find((combatant) => combatant.name === name)?.id ?? null;

  const updateVisualFocusForStep = (
    step: CommanderCinematicStep,
    finalBattle: CommanderPracticeBattle,
  ) => {
    const targetId = focusIdForName(finalBattle.combatants, step.event.targetName);
    if (step.kind === 'focus_lock' && targetId) {
      if (step.event.side === 'player') setVisualPlayerFocusTarget(targetId);
      if (step.event.side === 'enemy') setVisualEnemyFocusTarget(targetId);
      return;
    }

    if (step.kind === 'attack' && step.event.code === 'death_bolt' && targetId) {
      if (step.event.side === 'player') {
        setVisualPlayerFocusTarget((current) => current === targetId ? null : current);
      } else if (step.event.side === 'enemy') {
        setVisualEnemyFocusTarget((current) => current === targetId ? null : current);
      }
    }
  };

  const playConfirmedSteps = async (
    steps: CommanderCinematicStep[],
    finalBattle: CommanderPracticeBattle,
  ) => {
    const run = ++playbackRun.current;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const multiplier = speed === 2 ? 0.52 : 1;

    if (!animationsOn || reducedMotion || steps.length === 0) {
      reconcileVisualBattle(finalBattle);
      setActiveStep(null);
      setPlaybackPhase(null);
      return;
    }

    for (const step of steps) {
      if (run !== playbackRun.current) return;
      setActiveStep(step);
      setPlaybackPhase('windup');

      if (step.kind === 'focus_lock') {
        await sleep(330 * multiplier);
        if (run !== playbackRun.current) return;
        setPlaybackPhase('impact');
        updateVisualFocusForStep(step, finalBattle);
        await sleep(410 * multiplier);
        continue;
      }

      if (step.kind === 'attack') {
        await sleep((step.event.code === 'death_bolt' ? 500 : 330) * multiplier);
        if (run !== playbackRun.current) return;
        setPlaybackPhase('impact');
        setVisualCombatants((current) => applyCommanderCinematicStep(current, step));
        updateVisualFocusForStep(step, finalBattle);
        await sleep((step.event.code === 'death_bolt' ? 560 : 410) * multiplier);
        if (run !== playbackRun.current) return;
        setPlaybackPhase('settle');
        await sleep(120 * multiplier);
        continue;
      }

      if (step.kind === 'guard') {
        await sleep(240 * multiplier);
        if (run !== playbackRun.current) return;
        setPlaybackPhase('impact');
        setVisualCombatants((current) => applyCommanderCinematicStep(current, step));
        await sleep(600 * multiplier);
        continue;
      }

      if (step.kind === 'defeat') {
        setPlaybackPhase('impact');
        setVisualCombatants((current) => applyCommanderCinematicStep(current, step));
        await sleep(680 * multiplier);
        continue;
      }

      if (step.kind === 'outcome') {
        setPlaybackPhase('impact');
        await sleep(780 * multiplier);
        continue;
      }

      setPlaybackPhase('impact');
      setVisualCombatants((current) => applyCommanderCinematicStep(current, step));
      await sleep(360 * multiplier);
    }

    if (run === playbackRun.current) {
      reconcileVisualBattle(finalBattle);
      setActiveStep(null);
      setPlaybackPhase(null);
    }
  };

  const chooseDefaultTarget = (nextSession: CommanderPracticeSession) => {
    if (nextSession.battle.status !== 'active') {
      setSelectedTargetId(null);
      return;
    }
    const enemies = nextSession.battle.combatants.filter((combatant) => combatant.side === 'enemy' && combatant.hp > 0);
    const currentStillAlive = enemies.some((combatant) => combatant.id === selectedTargetId);
    if (!currentStillAlive) {
      const enemyCommander = enemies.find((combatant) => combatant.role === 'commander');
      setSelectedTargetId(enemyCommander?.id ?? enemies[0]?.id ?? null);
    }
  };

  const begin = async () => {
    if (pendingRequest.current) return;
    playbackRun.current += 1;
    setActiveStep(null);
    setPlaybackPhase(null);
    const controller = new AbortController();
    pendingRequest.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    setBusy(true);
    setError(null);
    try {
      const next = await startCommanderPractice(controller.signal);
      if (controller.signal.aborted) return;
      setSession(next);
      reconcileVisualBattle(next.battle);
      const firstTarget = next.battle.combatants.find(
        (combatant) => combatant.side === 'enemy' && combatant.role === 'commander' && combatant.hp > 0,
      ) ?? next.battle.combatants.find((combatant) => combatant.side === 'enemy' && combatant.hp > 0);
      setSelectedTargetId(firstTarget?.id ?? null);
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : String(cause);
      setError(formatCommanderError(code, copy));
    } finally {
      window.clearTimeout(timeout);
      pendingRequest.current = null;
      setBusy(false);
    }
  };

  const playMove = async (move: CommanderPracticeMove) => {
    if (!session || session.battle.status !== 'active' || pendingRequest.current || busy) return;
    if (move !== 'guard' && !selectedTargetId) {
      setError(copy.invalidTarget);
      return;
    }

    const previousEventIds = new Set(session.battle.events.map((event) => event.id));
    const controller = new AbortController();
    pendingRequest.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    setBusy(true);
    setError(null);

    try {
      const next = await submitCommanderPracticeTurn(
        session.transcript,
        move,
        move === 'guard' ? null : selectedTargetId,
        controller.signal,
      );
      if (controller.signal.aborted) return;

      const confirmedEvents = next.battle.events.filter((event) => !previousEventIds.has(event.id));
      const steps = buildCommanderCinematicSteps(confirmedEvents);
      await playConfirmedSteps(steps, next.battle);
      if (controller.signal.aborted) return;

      setSession(next);
      reconcileVisualBattle(next.battle);
      chooseDefaultTarget(next);
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : String(cause);
      setError(formatCommanderError(code, copy));
    } finally {
      window.clearTimeout(timeout);
      pendingRequest.current = null;
      setActiveStep(null);
      setPlaybackPhase(null);
      setBusy(false);
    }
  };

  const outcomeLabel = battle?.status === 'victory'
    ? copy.victory
    : battle?.status === 'defeat'
      ? copy.defeat
      : copy.draw;

  return createPortal(
    <dialog
      ref={dialogRef}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      data-no-interface-translation="true"
      aria-modal="true"
      aria-labelledby="commander-preview-title"
      className="fixed inset-0 z-[220] m-0 h-[100dvh] max-h-none w-screen max-w-none overflow-y-auto border-0 bg-slate-950/95 px-3 py-4 backdrop-blur-xl sm:px-6 sm:py-6"
      lang={language}
      dir={direction}
    >
      <div className="mx-auto w-full max-w-6xl overflow-hidden rounded-[2rem] border border-cyan-400/20 bg-slate-950 shadow-[0_0_80px_rgba(34,211,238,0.12)]">
        <header className="relative overflow-hidden border-b border-slate-800 px-4 py-5 sm:px-6">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(34,211,238,0.18),transparent_34%),radial-gradient(circle_at_82%_20%,rgba(168,85,247,0.16),transparent_32%)]" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-amber-300/40 bg-amber-400/10 px-2.5 py-1 text-[11px] font-black tracking-[0.16em] text-amber-200">{copy.practiceOnly}</span>
                <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-100">COMMANDER · PRACTICE PREVIEW</span>
              </div>
              <h1 id="commander-preview-title" className="font-heading text-2xl font-black text-white sm:text-3xl">{copy.title}</h1>
              <p className="mt-1 text-sm text-slate-300">{copy.subtitle}</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">
              ✕ {copy.close}
            </button>
          </div>
        </header>

        <main className="space-y-5 p-4 sm:p-6">
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-3 text-sm text-emerald-100"><strong className="block text-emerald-200">✓ {copy.safety}</strong></div>
            <div className="rounded-2xl border border-violet-400/20 bg-violet-400/[0.06] p-3 text-sm text-violet-100"><strong className="block text-violet-200">🎓 {copy.testers}</strong></div>
          </section>

          {!session && (
            <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 sm:p-7">
              <div className="grid items-center gap-6 md:grid-cols-[1.4fr_1fr]">
                <div>
                  <span aria-hidden className="text-5xl">🧠⚔️</span>
                  <h2 className="mt-4 font-heading text-xl font-bold text-white sm:text-2xl">{copy.startTitle}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{copy.startBody}</p>
                  <button type="button" onClick={() => void begin()} disabled={busy} className="mt-5 rounded-2xl bg-gradient-to-r from-cyan-300 via-sky-400 to-violet-400 px-5 py-3 font-heading text-sm font-black text-slate-950 shadow-lg shadow-cyan-500/10 transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60">
                    {busy ? copy.resolving : copy.start}
                  </button>
                </div>
                <div className="rounded-2xl border border-slate-700/80 bg-slate-950/70 p-4">
                  <span className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-300">{copy.loadout}</span>
                  <p className="mt-2 text-sm font-semibold text-white">{copy.loadoutValue}</p>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs text-slate-300">
                    <span className="rounded-xl border border-slate-800 bg-slate-900 px-2 py-3">🎯 {copy.focus}</span>
                    <span className="rounded-xl border border-slate-800 bg-slate-900 px-2 py-3">☄️ {copy.bolt}</span>
                    <span className="rounded-xl border border-slate-800 bg-slate-900 px-2 py-3">🛡️ {copy.guard}</span>
                  </div>
                </div>
              </div>
            </section>
          )}

          {error && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              <span>{error}</span>
              {!session && <button type="button" onClick={() => void begin()} disabled={busy} className="rounded-lg border border-rose-300/30 px-3 py-1.5 font-semibold hover:bg-rose-300/10 disabled:opacity-50">{copy.retry}</button>}
            </div>
          )}

          {session && battle && (
            <>
              <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-200">
                  <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 font-bold text-cyan-200">⚔️ {copy.turn} {battle.turn} {copy.of} {battle.maxTurns}</span>
                  <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">⏱️ {copy.expires}: {new Date(session.expiresAt).toLocaleTimeString(language === 'ar' ? 'ar' : language === 'ru' ? 'ru-RU' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <button type="button" onClick={() => void begin()} disabled={busy} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200 hover:border-cyan-400/40 hover:text-cyan-100 disabled:opacity-50">↻ {copy.restart}</button>
              </section>

              {finished && (
                <section className={`rounded-3xl border p-5 text-center ${battle.status === 'victory' ? 'border-emerald-400/30 bg-emerald-500/10' : battle.status === 'defeat' ? 'border-rose-400/30 bg-rose-500/10' : 'border-amber-400/30 bg-amber-500/10'}`}>
                  <div className="text-4xl" aria-hidden>{battle.status === 'victory' ? '🏆' : battle.status === 'defeat' ? '☠️' : '⚖️'}</div>
                  <h2 className="mt-2 font-heading text-2xl font-black text-white">{outcomeLabel}</h2>
                  <p className="mt-1 text-sm text-slate-300">{copy.finishedNote}</p>
                </section>
              )}

              <section className="rounded-3xl border border-cyan-400/20 bg-cyan-400/[0.04] p-4">
                <h2 className="mb-3 font-heading text-sm font-black uppercase tracking-[0.12em] text-cyan-200">{copy.you}</h2>
                <div className="grid gap-2 sm:grid-cols-3">
                  {playerCombatants.map((combatant) => (
                    <CombatantCard key={combatant.id} combatant={combatant} focused={!finished && visualEnemyFocusTarget === combatant.id} hpLabel={copy.hp} shieldLabel={copy.shield} />
                  ))}
                </div>
              </section>

              <CommanderCinematicBattlefield
                combatants={renderedCombatants}
                selectedTargetId={finished ? null : selectedTargetId}
                playerFocusTarget={finished ? null : visualPlayerFocusTarget}
                enemyFocusTarget={finished ? null : visualEnemyFocusTarget}
                activeStep={activeStep}
                phase={playbackPhase}
                status={battle.status}
                targetable={!finished && !busy}
                animationsOn={animationsOn}
                effectsOn={effectsOn}
                speed={speed}
                language={language}
                copy={copy}
                onSelectTarget={setSelectedTargetId}
                onToggleAnimations={() => setAnimationsOn((value) => !value)}
                onToggleEffects={() => setEffectsOn((value) => !value)}
                onToggleSpeed={() => setSpeed((value) => value === 1 ? 2 : 1)}
              />

              {!finished && (
                <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
                  <h2 className="font-heading text-sm font-black uppercase tracking-[0.12em] text-white">⚡ {copy.actions}</h2>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <button type="button" onClick={() => void playMove('focus_target')} disabled={busy || !selectedTargetId} className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 p-4 text-start transition hover:border-cyan-300/70 hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-45">
                      <span className="text-xl" aria-hidden>🎯</span><strong className="mt-2 block text-sm text-cyan-100">{copy.focus}</strong><span className="mt-1 block text-xs leading-5 text-slate-300">{copy.focusHint}</span>
                    </button>
                    <button type="button" onClick={() => void playMove('death_bolt')} disabled={busy || !selectedTargetId || battle.playerDeathBoltCooldown > 0} className="rounded-2xl border border-amber-300/50 bg-amber-400/10 p-4 text-start shadow-[0_0_28px_rgba(251,191,36,0.08)] transition hover:border-amber-200 hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-45">
                      <div className="flex items-start justify-between gap-2"><span className="text-xl" aria-hidden>☄️</span>{battle.playerDeathBoltCooldown > 0 && <span className="rounded-full border border-slate-600 px-2 py-0.5 text-[10px] font-bold text-slate-300">{copy.cooldown} {battle.playerDeathBoltCooldown} {copy.rounds}</span>}</div>
                      <strong className="mt-2 block text-sm text-amber-100">{copy.bolt}</strong><span className="mt-1 block text-xs leading-5 text-slate-300">{copy.boltHint}</span>
                    </button>
                    <button type="button" onClick={() => void playMove('guard')} disabled={busy} className="rounded-2xl border border-violet-400/30 bg-violet-400/10 p-4 text-start transition hover:border-violet-300/70 hover:bg-violet-400/15 disabled:cursor-not-allowed disabled:opacity-45">
                      <span className="text-xl" aria-hidden>🛡️</span><strong className="mt-2 block text-sm text-violet-100">{copy.guard}</strong><span className="mt-1 block text-xs leading-5 text-slate-300">{copy.guardHint}</span>
                    </button>
                  </div>
                  {busy && <p className="mt-3 animate-pulse text-center text-xs font-semibold text-cyan-200">{copy.resolving}</p>}
                </section>
              )}

              <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4">
                <h2 className="font-heading text-sm font-black uppercase tracking-[0.12em] text-slate-200">📜 {copy.battleLog}</h2>
                <ol className="mt-3 max-h-64 space-y-2 overflow-y-auto pe-1" aria-live="polite">
                  {visibleCommanderEvents(battle.events).reverse().map((event) => (
                    <li key={event.id} className="rounded-xl border border-slate-800/80 bg-slate-900/70 px-3 py-2 text-xs leading-5 text-slate-300">
                      <span className="me-2 font-mono text-[10px] font-bold text-slate-500">T{event.turn}</span>
                      {commanderEventText(event, language)}
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}
        </main>
      </div>
    </dialog>,
    document.body,
  );
};

export default CommanderPracticeArena;
