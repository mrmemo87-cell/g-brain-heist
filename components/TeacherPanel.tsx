import React, { useEffect, useMemo, useState } from 'react';

export type RoomSettings = {
  coinGoal: number;
  timeLimitSeconds: number;
  maxPlayers: number;
  chaosProbability?: number;
};

export type GamePhase =
  | 'LOBBY'
  | 'RULES_VOTE'
  | 'ACTIVE_ROUNDS'
  | 'PANIC_MODE'
  | 'PAUSED'
  | 'FINISHED';

export interface GameState {
  phase: GamePhase;
  settings: RoomSettings;
  remainingSeconds?: number;
  chaosActive?: boolean;
}

export type TeacherCommand =
  | { type: 'SET_SETTINGS'; payload: { settings: RoomSettings } }
  | { type: 'START_GAME' }
  | { type: 'ADVANCE_PHASE'; payload?: { targetPhase?: GamePhase } }
  | { type: 'START_ROUNDS' }
  | { type: 'PAUSE_GAME' }
  | { type: 'RESUME_GAME' }
  | { type: 'TRIGGER_CHAOS' }
  | { type: 'FORCE_PANIC_MODE' }
  | { type: 'END_GAME'; payload: { outcome: 'success' | 'fail' } };

interface TeacherPanelProps {
  gameState: GameState;
  onTeacherCommand: (cmd: TeacherCommand) => void;
}

const numberField = (
  value: number,
  onChange: (value: number) => void,
  min = 0,
) => ({
  value: Number.isFinite(value) ? value : 0,
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value) || 0),
  min,
});

const TeacherPanel: React.FC<TeacherPanelProps> = ({ gameState, onTeacherCommand }) => {
  const [settings, setSettings] = useState<RoomSettings>(gameState.settings);

  useEffect(() => {
    setSettings(gameState.settings);
  }, [gameState.settings]);

  const handleSettingsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onTeacherCommand({ type: 'SET_SETTINGS', payload: { settings } });
  };

  const updateSetting = <K extends keyof RoomSettings>(key: K, value: RoomSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const phaseLabel = useMemo(() => {
    switch (gameState.phase) {
      case 'LOBBY':
        return 'Lobby (pre-game)';
      case 'RULES_VOTE':
        return 'Rules Vote';
      case 'ACTIVE_ROUNDS':
        return 'Active Rounds';
      case 'PANIC_MODE':
        return 'Panic Mode';
      case 'PAUSED':
        return 'Paused';
      case 'FINISHED':
        return 'Finished';
      default:
        return gameState.phase;
    }
  }, [gameState.phase]);

  const canStartGame = gameState.phase === 'LOBBY';
  const canAdvanceToRules = gameState.phase === 'LOBBY';
  const canStartRounds = gameState.phase === 'RULES_VOTE';
  const canPause = gameState.phase === 'ACTIVE_ROUNDS';
  const canResume = gameState.phase === 'PAUSED';
  const canTriggerChaos = gameState.phase === 'ACTIVE_ROUNDS' || gameState.phase === 'PANIC_MODE';
  const canForcePanic = gameState.phase === 'ACTIVE_ROUNDS';
  const canEndGame = gameState.phase !== 'FINISHED';

  return (
    <div className="space-y-6 bg-slate-900 text-gray-100 p-6 rounded-xl shadow-lg border border-slate-800">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Lockdown Countdown — Teacher Panel</h2>
          <p className="text-sm text-gray-400">Phase: {phaseLabel}</p>
          {typeof gameState.remainingSeconds === 'number' && (
            <p className="text-xs text-gray-500">
              Remaining Time: {gameState.remainingSeconds}s
            </p>
          )}
          {gameState.chaosActive && (
            <p className="text-xs text-orange-300 font-semibold">Chaos in effect</p>
          )}
        </div>
        <div className="flex gap-3">
          <button
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-900 disabled:text-gray-500 transition"
            disabled={!canStartGame}
            onClick={() => onTeacherCommand({ type: 'START_GAME' })}
          >
            Start Game
          </button>
          <button
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:bg-amber-900 disabled:text-gray-500 transition"
            disabled={!canPause}
            onClick={() => onTeacherCommand({ type: 'PAUSE_GAME' })}
          >
            Pause
          </button>
          <button
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 disabled:text-gray-500 transition"
            disabled={!canResume}
            onClick={() => onTeacherCommand({ type: 'RESUME_GAME' })}
          >
            Resume
          </button>
        </div>
      </header>

      <section className="grid md:grid-cols-2 gap-6">
        <form
          onSubmit={handleSettingsSubmit}
          className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Room Settings</h3>
            <button
              type="submit"
              className="px-3 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-sm font-medium disabled:bg-indigo-900 disabled:text-gray-400 transition"
            >
              Save Settings
            </button>
          </div>

          <div className="space-y-3">
            <label className="block text-sm">
              <span className="text-gray-300">Coin Goal</span>
              <input
                type="number"
                className="mt-1 w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                {...numberField(settings.coinGoal, (value) => updateSetting('coinGoal', value), 0)}
              />
            </label>

            <label className="block text-sm">
              <span className="text-gray-300">Time Limit (seconds)</span>
              <input
                type="number"
                className="mt-1 w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                {...numberField(settings.timeLimitSeconds, (value) => updateSetting('timeLimitSeconds', value), 30)}
              />
            </label>

            <label className="block text-sm">
              <span className="text-gray-300">Max Players</span>
              <input
                type="number"
                className="mt-1 w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                {...numberField(settings.maxPlayers, (value) => updateSetting('maxPlayers', value), 1)}
              />
            </label>

            <label className="block text-sm">
              <span className="text-gray-300">Chaos Probability (0 - 1)</span>
              <input
                type="number"
                step="0.05"
                className="mt-1 w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={settings.chaosProbability ?? 0}
                min={0}
                max={1}
                onChange={(e) => updateSetting('chaosProbability', Math.min(1, Math.max(0, Number(e.target.value) || 0)))}
              />
            </label>
          </div>
        </form>

        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 space-y-4">
          <h3 className="text-lg font-semibold">Phase Controls</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <button
              className="w-full px-4 py-3 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 disabled:text-gray-500 transition"
              disabled={!canAdvanceToRules}
              onClick={() => onTeacherCommand({ type: 'ADVANCE_PHASE', payload: { targetPhase: 'RULES_VOTE' } })}
            >
              Advance to Rules Vote
            </button>
            <button
              className="w-full px-4 py-3 rounded-md bg-green-600 hover:bg-green-500 disabled:bg-green-900 disabled:text-gray-500 transition"
              disabled={!canStartRounds}
              onClick={() => onTeacherCommand({ type: 'START_ROUNDS' })}
            >
              Start Rounds
            </button>
            <button
              className="w-full px-4 py-3 rounded-md bg-orange-600 hover:bg-orange-500 disabled:bg-orange-900 disabled:text-gray-500 transition"
              disabled={!canTriggerChaos}
              onClick={() => onTeacherCommand({ type: 'TRIGGER_CHAOS' })}
            >
              Trigger Chaos Button
            </button>
            <button
              className="w-full px-4 py-3 rounded-md bg-red-600 hover:bg-red-500 disabled:bg-red-900 disabled:text-gray-500 transition"
              disabled={!canForcePanic}
              onClick={() => onTeacherCommand({ type: 'FORCE_PANIC_MODE' })}
            >
              Force Panic Mode
            </button>
          </div>
        </div>
      </section>

      <section className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 space-y-3">
        <h3 className="text-lg font-semibold">End Game Override</h3>
        <p className="text-sm text-gray-400">Immediately end the session with a forced outcome.</p>
        <div className="flex flex-wrap gap-3">
          <button
            className="px-4 py-2 rounded-md bg-rose-600 hover:bg-rose-500 disabled:bg-rose-900 disabled:text-gray-500 transition"
            disabled={!canEndGame}
            onClick={() => onTeacherCommand({ type: 'END_GAME', payload: { outcome: 'fail' } })}
          >
            End Game — Fail
          </button>
          <button
            className="px-4 py-2 rounded-md bg-teal-600 hover:bg-teal-500 disabled:bg-teal-900 disabled:text-gray-500 transition"
            disabled={!canEndGame}
            onClick={() => onTeacherCommand({ type: 'END_GAME', payload: { outcome: 'success' } })}
          >
            End Game — Success
          </button>
        </div>
      </section>
    </div>
  );
};

export default TeacherPanel;
