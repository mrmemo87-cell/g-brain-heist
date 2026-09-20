import React, { useEffect, useMemo, useRef, useState } from 'react';
import { preloadCommanderSpriteAssets } from './commanderSpriteAssets';
import { preloadCommanderAudio, stopCommanderAudio, unlockCommanderAudio } from './commanderBattleSound';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  commanderPvpError,
  resumeCommanderPvp,
  startCommanderPvp,
  submitCommanderPvpTurn,
  type CommanderPvpSession,
} from '../../../services/commanderPvpService';
import type {
  CommanderPracticeBattle,
  CommanderPracticeCombatant,
  CommanderPracticeMove,
} from '../../../services/commanderPracticeService';
import CommanderCinematicBattlefield, { type CommanderPlaybackPhase } from './CommanderCinematicBattlefield';
import CommanderPvpElixirStatus from './CommanderPvpElixirStatus';
import {
  applyCommanderCinematicStep,
  buildCommanderCinematicSteps,
  cloneCommanderCombatants,
  type CommanderCinematicStep,
} from './commanderCinematicPlayback';
import {
  COMMANDER_COPY,
  commanderEventText,
  type CommanderCopy,
} from './commanderPracticeCopy';
import type { CommanderPvpLaunch } from './CommanderPvpLobby';

const sleep = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

const TIMING = {
  focusWindup: 550,
  focusImpact: 900,
  attackWindup: 650,
  deathBoltWindup: 900,
  attackImpact: 1450,
  deathBoltImpact: 1650,
  attackSettle: 320,
  deathBoltSettle: 360,
  guardWindup: 450,
  guardImpact: 1400,
  defeatImpact: 1300,
  outcomeImpact: 1700,
  fallbackImpact: 900,
} as const;

const READABILITY_STYLES = `
  [data-commander-pvp-root="true"] .cc-stage-unit{translate:-50% -82%!important;scale:var(--cc-unit-scale)!important;transform:none!important}
  [data-commander-pvp-root="true"] .cc-stage-unit:hover,
  [data-commander-pvp-root="true"] .cc-stage-unit:focus-visible{translate:-50% -82%!important;scale:var(--cc-unit-scale)!important;transform:none!important}
  @keyframes ccPvpCombatFloat{0%{opacity:0;transform:translate3d(0,14px,0) scale(.78)}14%{opacity:1;transform:translate3d(0,-2px,0) scale(1.18)}68%{opacity:1;transform:translate3d(0,-54px,0) scale(1)}100%{opacity:0;transform:translate3d(0,-82px,0) scale(.94)}}
  [data-commander-pvp-root="true"] .cc-combat-float{animation:ccPvpCombatFloat 1200ms cubic-bezier(.18,.82,.22,1) forwards!important;will-change:transform,opacity}
  [data-commander-pvp-root="true"][data-commander-speed="2"] .cc-combat-float{animation-duration:700ms!important}
  @media (prefers-reduced-motion:reduce){[data-commander-pvp-root="true"] .cc-combat-float{animation:none!important}}
`;

type Props = {
  launch: CommanderPvpLaunch;
  onClose: () => void;
};

const CommanderPvpArena: React.FC<Props> = ({ launch, onClose }) => {
  const { language, direction } = useLanguage();
  const baseCopy = COMMANDER_COPY[language];
  const copy = useMemo(() => ({
    ...baseCopy,
    practiceOnly: 'RECORDED PLAYER BATTLE',
    safety: 'Server-authoritative battle. The result is saved.',
    testers: 'No Coins or account XP are transferred in Commander PvP.',
    title: 'Commander Player Battle',
    subtitle: `Attacking ${launch.username}`,
    startTitle: `Battle ${launch.username}`,
    startBody: 'Your equipped army is fighting the opponent’s saved Commander formation.',
    start: 'Enter battle',
    restart: 'Back to battle network',
    loadout: 'Battle loadout',
    expires: 'Battle expires',
    victory: 'Commander victory',
    defeat: 'Commander defeat',
    draw: 'Commander draw',
    finishedNote: 'Battle complete. The result is recorded; no Coins or account XP were transferred.',
    expired: 'This Commander battle expired. Return to the battle network.',
    unavailable: 'Commander player battles are unavailable right now.',
    genericError: 'The Commander battle turn could not be resolved.',
  })) as unknown as CommanderCopy;

  const [session, setSession] = useState<CommanderPvpSession | null>(null);
  const [assetsReady, setAssetsReady] = useState(false);
  const [introReady, setIntroReady] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [visualCombatants, setVisualCombatants] = useState<CommanderPracticeCombatant[]>([]);
  const [visualPlayerFocusTarget, setVisualPlayerFocusTarget] = useState<string | null>(null);
  const [visualEnemyFocusTarget, setVisualEnemyFocusTarget] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<CommanderCinematicStep | null>(null);
  const [playbackPhase, setPlaybackPhase] = useState<CommanderPlaybackPhase>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [animationsOn, setAnimationsOn] = useState(true);
  const [effectsOn, setEffectsOn] = useState(true);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const [battlePresentationKey, setBattlePresentationKey] = useState(0);

  const pendingRequest = useRef<AbortController | null>(null);
  const playbackRun = useRef(0);

  const reconcile = (battle: CommanderPracticeBattle) => {
    setVisualCombatants(cloneCommanderCombatants(battle.combatants));
    setVisualPlayerFocusTarget(battle.playerFocusTarget);
    setVisualEnemyFocusTarget(battle.enemyFocusTarget);
  };

  const chooseTarget = (next: CommanderPvpSession) => {
    if (next.battle.status !== 'active') {
      setSelectedTargetId(null);
      return;
    }
    const enemies = next.battle.combatants.filter((combatant) => combatant.side === 'enemy' && combatant.hp > 0);
    const stillAlive = enemies.some((combatant) => combatant.id === selectedTargetId);
    if (!stillAlive) {
      setSelectedTargetId(enemies.find((combatant) => combatant.role === 'commander')?.id ?? enemies[0]?.id ?? null);
    }
  };

  const focusIdForName = (combatants: CommanderPracticeCombatant[], name: string | undefined) =>
    combatants.find((combatant) => combatant.name === name)?.id ?? null;

  const updateVisualFocus = (step: CommanderCinematicStep, finalBattle: CommanderPracticeBattle) => {
    const targetId = focusIdForName(finalBattle.combatants, step.event.targetName);
    if (step.kind === 'focus_lock' && targetId) {
      if (step.event.side === 'player') setVisualPlayerFocusTarget(targetId);
      if (step.event.side === 'enemy') setVisualEnemyFocusTarget(targetId);
      return;
    }
    if (step.kind === 'attack' && step.event.code === 'death_bolt' && targetId) {
      if (step.event.side === 'player') setVisualPlayerFocusTarget((current) => current === targetId ? null : current);
      else if (step.event.side === 'enemy') setVisualEnemyFocusTarget((current) => current === targetId ? null : current);
    }
  };

  const playConfirmedSteps = async (steps: CommanderCinematicStep[], finalBattle: CommanderPracticeBattle) => {
    const run = ++playbackRun.current;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const multiplier = speed === 2 ? 0.6 : 1;
    if (!animationsOn || reducedMotion || !steps.length) {
      reconcile(finalBattle);
      setActiveStep(null);
      setPlaybackPhase(null);
      return;
    }

    for (const step of steps) {
      if (run !== playbackRun.current) return;
      setActiveStep(step);
      setPlaybackPhase('windup');

      if (step.kind === 'focus_lock') {
        await sleep(TIMING.focusWindup * multiplier);
        if (run !== playbackRun.current) return;
        setPlaybackPhase('impact');
        updateVisualFocus(step, finalBattle);
        await sleep(TIMING.focusImpact * multiplier);
        continue;
      }
      if (step.kind === 'attack') {
        const bolt = step.event.code === 'death_bolt';
        await sleep((bolt ? TIMING.deathBoltWindup : TIMING.attackWindup) * multiplier);
        if (run !== playbackRun.current) return;
        setPlaybackPhase('impact');
        setVisualCombatants((current) => applyCommanderCinematicStep(current, step));
        updateVisualFocus(step, finalBattle);
        await sleep((bolt ? TIMING.deathBoltImpact : TIMING.attackImpact) * multiplier);
        if (run !== playbackRun.current) return;
        setPlaybackPhase('settle');
        await sleep((bolt ? TIMING.deathBoltSettle : TIMING.attackSettle) * multiplier);
        continue;
      }
      if (step.kind === 'guard') {
        await sleep(TIMING.guardWindup * multiplier);
        if (run !== playbackRun.current) return;
        setPlaybackPhase('impact');
        setVisualCombatants((current) => applyCommanderCinematicStep(current, step));
        await sleep(TIMING.guardImpact * multiplier);
        continue;
      }
      if (step.kind === 'defeat') {
        setPlaybackPhase('impact');
        setVisualCombatants((current) => applyCommanderCinematicStep(current, step));
        await sleep(TIMING.defeatImpact * multiplier);
        continue;
      }
      if (step.kind === 'outcome') {
        setPlaybackPhase('impact');
        await sleep(TIMING.outcomeImpact * multiplier);
        continue;
      }
      setPlaybackPhase('impact');
      setVisualCombatants((current) => applyCommanderCinematicStep(current, step));
      await sleep(TIMING.fallbackImpact * multiplier);
    }

    if (run === playbackRun.current) {
      reconcile(finalBattle);
      setActiveStep(null);
      setPlaybackPhase(null);
    }
  };

  const initialize = async () => {
    if (pendingRequest.current) return;
    const controller = new AbortController();
    pendingRequest.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    setBusy(true);
    setError('');
    setAssetsReady(false);
    setIntroReady(false);
    try {
      if (soundOn) void unlockCommanderAudio();
      stopCommanderAudio();
      const next = await (launch.battleId
        ? resumeCommanderPvp(launch.battleId, controller.signal)
        : startCommanderPvp(launch.userId, controller.signal));
      // Asset warming is best-effort. Never hold battle entry behind mobile image decode/network latency.
      void preloadCommanderSpriteAssets();
      void preloadCommanderAudio();
      if (controller.signal.aborted) return;
      setSession(next);
      reconcile(next.battle);
      const firstTarget = next.battle.combatants.find((combatant) => combatant.side === 'enemy' && combatant.role === 'commander' && combatant.hp > 0)
        ?? next.battle.combatants.find((combatant) => combatant.side === 'enemy' && combatant.hp > 0);
      setSelectedTargetId(firstTarget?.id ?? null);
      setAssetsReady(true);
      setBattlePresentationKey((value) => value + 1);
    } catch (cause) {
      setError(commanderPvpError(cause));
    } finally {
      window.clearTimeout(timeout);
      if (pendingRequest.current === controller) pendingRequest.current = null;
      setBusy(false);
    }
  };

  useEffect(() => {
    void initialize();
    return () => {
      stopCommanderAudio();
      playbackRun.current += 1;
      pendingRequest.current?.abort();
    };
    // launch identifies a single battle entry; do not restart on presentation toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launch.userId, launch.battleId]);

  const playMove = async (move: CommanderPracticeMove) => {
    if (!introReady || !session || session.battle.status !== 'active' || pendingRequest.current || busy) return;
    if (move !== 'guard' && move !== 'raise_dead' && !selectedTargetId) {
      setError(baseCopy.invalidTarget);
      return;
    }

    const previousEventIds = new Set(session.battle.events.map((event) => event.id));
    const controller = new AbortController();
    pendingRequest.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    setBusy(true);
    setError('');
    try {
      const next = await submitCommanderPvpTurn(
        session.battleId,
        move,
        move === 'guard' || move === 'raise_dead' ? null : selectedTargetId,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      const confirmedEvents = next.battle.events.filter((event) => !previousEventIds.has(event.id));
      await playConfirmedSteps(buildCommanderCinematicSteps(confirmedEvents), next.battle);
      if (controller.signal.aborted) return;
      setSession(next);
      reconcile(next.battle);
      chooseTarget(next);
    } catch (cause) {
      setError(commanderPvpError(cause));
    } finally {
      window.clearTimeout(timeout);
      if (pendingRequest.current === controller) pendingRequest.current = null;
      setActiveStep(null);
      setPlaybackPhase(null);
      setBusy(false);
    }
  };

  const battle = session?.battle ?? null;
  const renderedCombatants = visualCombatants.length ? visualCombatants : battle?.combatants ?? [];

  return (
    <section data-no-interface-translation="true" data-commander-pvp-root="true" data-commander-speed={speed} className="w-full min-w-0 bg-slate-950 py-3 sm:py-5" lang={language} dir={direction}>
      <style>{READABILITY_STYLES}</style>
      <div className="mx-auto w-full max-w-7xl overflow-hidden rounded-[2rem] border border-cyan-400/20 bg-slate-950 shadow-[0_0_80px_rgba(34,211,238,0.12)]">
        <header className="relative overflow-hidden border-b border-slate-800 px-4 py-4 sm:px-6">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(34,211,238,0.18),transparent_34%),radial-gradient(circle_at_82%_20%,rgba(168,85,247,0.16),transparent_32%)]" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-rose-300/40 bg-rose-400/10 px-2.5 py-1 text-[11px] font-black tracking-[0.16em] text-rose-200">RECORDED PLAYER BATTLE</span>
                <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-100">VS {launch.username.toUpperCase()}</span>
              </div>
              <h1 className="font-heading text-2xl font-black text-white sm:text-3xl">Commander Duel</h1>
              <p className="mt-1 text-sm text-slate-300">Your equipped army vs. {launch.username}'s saved formation.</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">← Battle Network</button>
          </div>
        </header>

        <main className="space-y-4 p-3 sm:p-5">
          <section className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2 text-xs text-emerald-100"><strong className="block text-emerald-200">✓ Server-authoritative state and settlement</strong></div>
            <div className="rounded-xl border border-violet-400/20 bg-violet-400/[0.06] px-3 py-2 text-xs text-violet-100"><strong className="block text-violet-200">◇ No Coin or account XP transfer</strong></div>
          </section>

          {busy && !session && <div role="status" className="rounded-3xl border border-cyan-300/20 bg-slate-950 p-8 text-center font-heading text-sm tracking-widest text-cyan-200">LOCKING PLAYER LOADOUTS<span className="mt-2 block text-xs tracking-normal text-slate-400">Creating a persistent battle snapshot…</span></div>}

          {error && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              <span>{error}</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => void initialize()} disabled={busy} className="rounded-lg border border-rose-300/30 px-3 py-1.5 font-semibold hover:bg-rose-300/10 disabled:opacity-50">Retry</button>
                <button type="button" onClick={onClose} className="rounded-lg border border-slate-600 px-3 py-1.5 font-semibold text-slate-200">Back</button>
              </div>
            </div>
          )}

          {session && <p className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-3 py-2 text-xs text-cyan-100">Battle ID {session.battleId.slice(0, 8)} · Defender snapshot locked when this battle started · Equipment changes apply to your next battle.</p>}
          {session && <CommanderPvpElixirStatus battleId={session.battleId} />}

          {assetsReady && session && battle && (
            <>
              <CommanderCinematicBattlefield
                key={battlePresentationKey}
                onIntroReady={() => setIntroReady(true)}
                soundOn={soundOn}
                onToggleSound={() => setSoundOn((value) => !value)}
                combatants={renderedCombatants}
                selectedTargetId={battle.status === 'active' ? selectedTargetId : null}
                playerFocusTarget={battle.status === 'active' ? visualPlayerFocusTarget : null}
                enemyFocusTarget={battle.status === 'active' ? visualEnemyFocusTarget : null}
                activeStep={activeStep}
                phase={playbackPhase}
                status={battle.status}
                targetable={introReady && battle.status === 'active' && !busy}
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
                onRestart={onClose}
              />

              <details className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                <summary className="cursor-pointer font-heading text-xs font-black uppercase tracking-[0.12em] text-slate-300">📜 Battle log</summary>
                <ol className="mt-3 max-h-64 space-y-2 overflow-y-auto pe-1" aria-live="polite">
                  {battle.events.slice().reverse().map((event) => (
                    <li key={event.id} className="rounded-lg bg-slate-900/70 px-3 py-2 text-xs leading-5 text-slate-300">
                      <span className="me-2 font-mono text-[10px] font-bold text-slate-500">T{event.turn}</span>
                      {event.code === 'battle_started' ? 'Player battle started.' : commanderEventText(event, language)}
                    </li>
                  ))}
                </ol>
              </details>
            </>
          )}
        </main>
      </div>
    </section>
  );
};

export default CommanderPvpArena;
