import React, { useEffect, useRef, useState } from 'react';
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
  const renderedCombatants = visualCombatants.length
    ? visualCombatants
    : battle?.combatants ?? [];

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

  return createPortal(
    <dialog
      ref={dialogRef}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      data-no-interface-translation="true"
      aria-modal="true"
      aria-labelledby="commander-preview-title"
      className="fixed inset-0 z-[220] m-0 h-[100dvh] max-h-none w-screen max-w-none overflow-y-auto border-0 bg-slate-950/95 px-2 py-3 backdrop-blur-xl sm:px-5 sm:py-5"
      lang={language}
      dir={direction}
    >
      <div className="mx-auto w-full max-w-7xl overflow-hidden rounded-[2rem] border border-cyan-400/20 bg-slate-950 shadow-[0_0_80px_rgba(34,211,238,0.12)]">
        <header className="relative overflow-hidden border-b border-slate-800 px-4 py-4 sm:px-6">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(34,211,238,0.18),transparent_34%),radial-gradient(circle_at_82%_20%,rgba(168,85,247,0.16),transparent_32%)]" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-amber-300/40 bg-amber-400/10 px-2.5 py-1 text-[11px] font-black tracking-[0.16em] text-amber-200">{copy.practiceOnly}</span>
                <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-100">COMMANDER · TACTICAL PREVIEW</span>
              </div>
              <h1 id="commander-preview-title" className="font-heading text-2xl font-black text-white sm:text-3xl">{copy.title}</h1>
              <p className="mt-1 text-sm text-slate-300">{copy.subtitle}</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">✕ {copy.close}</button>
          </div>
        </header>

        <main className="space-y-4 p-3 sm:p-5">
          <section className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2 text-xs text-emerald-100"><strong className="block text-emerald-200">✓ {copy.safety}</strong></div>
            <div className="rounded-xl border border-violet-400/20 bg-violet-400/[0.06] px-3 py-2 text-xs text-violet-100"><strong className="block text-violet-200">🎓 {copy.testers}</strong></div>
          </section>

          {!session && (
            <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 sm:p-7">
              <div className="grid items-center gap-6 md:grid-cols-[1.4fr_1fr]">
                <div>
                  <span aria-hidden className="text-5xl">🧠⚔️</span>
                  <h2 className="mt-4 font-heading text-xl font-bold text-white sm:text-2xl">{copy.startTitle}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{copy.startBody}</p>
                  <button type="button" onClick={() => void begin()} disabled={busy} className="mt-5 rounded-2xl bg-gradient-to-r from-cyan-300 via-sky-400 to-violet-400 px-5 py-3 font-heading text-sm font-black text-slate-950 shadow-lg shadow-cyan-500/10 transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60">{busy ? copy.resolving : copy.start}</button>
                </div>
                <div className="rounded-2xl border border-slate-700/80 bg-slate-950/70 p-4">
                  <span className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-300">{copy.loadout}</span>
                  <p className="mt-2 text-sm font-semibold text-white">{copy.loadoutValue}</p>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs text-slate-300"><span className="rounded-xl bg-slate-900 px-2 py-3">🎯 {copy.focus}</span><span className="rounded-xl bg-slate-900 px-2 py-3">☄️ {copy.bolt}</span><span className="rounded-xl bg-slate-900 px-2 py-3">🛡️ {copy.guard}</span></div>
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
              <CommanderCinematicBattlefield
                combatants={renderedCombatants}
                selectedTargetId={battle.status === 'active' ? selectedTargetId : null}
                playerFocusTarget={battle.status === 'active' ? visualPlayerFocusTarget : null}
                enemyFocusTarget={battle.status === 'active' ? visualEnemyFocusTarget : null}
                activeStep={activeStep}
                phase={playbackPhase}
                status={battle.status}
                targetable={battle.status === 'active' && !busy}
                animationsOn={animationsOn}
                effectsOn={effectsOn}
                speed={speed}
                language={language}
                copy={copy}
                turn={battle.turn}
                maxTurns={battle.maxTurns}
                expiresAt={session.expiresAt}
                deathBoltCooldown={battle.playerDeathBoltCooldown}
                busy={busy}
                onSelectTarget={setSelectedTargetId}
                onToggleAnimations={() => setAnimationsOn((value) => !value)}
                onToggleEffects={() => setEffectsOn((value) => !value)}
                onToggleSpeed={() => setSpeed((value) => value === 1 ? 2 : 1)}
                onMove={(move) => void playMove(move)}
                onRestart={() => void begin()}
              />

              <details className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                <summary className="cursor-pointer font-heading text-xs font-black uppercase tracking-[0.12em] text-slate-300">📜 {copy.battleLog}</summary>
                <ol className="mt-3 max-h-64 space-y-2 overflow-y-auto pe-1" aria-live="polite">
                  {visibleCommanderEvents(battle.events).reverse().map((event) => (
                    <li key={event.id} className="rounded-lg bg-slate-900/70 px-3 py-2 text-xs leading-5 text-slate-300">
                      <span className="me-2 font-mono text-[10px] font-bold text-slate-500">T{event.turn}</span>
                      {commanderEventText(event, language)}
                    </li>
                  ))}
                </ol>
              </details>
            </>
          )}
        </main>
      </div>
    </dialog>,
    document.body,
  );
};

export default CommanderPracticeArena;
