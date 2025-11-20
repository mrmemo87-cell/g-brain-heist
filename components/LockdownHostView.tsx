import React from 'react';
import {
  AlarmLevel,
  GamePhase,
  GameState,
  HeistConditionOption,
  PlayerState,
  TeacherCommand,
  AwardResult,
  GameResults,
} from './lockdownTypes';

type HostViewProps = {
  gameState: GameState;
  onTeacherCommand: (cmd: TeacherCommand) => void;
};

const alarmColors: Record<AlarmLevel, string> = {
  NORMAL: 'bg-emerald-600',
  YELLOW: 'bg-yellow-500',
  ORANGE: 'bg-orange-500',
  RED: 'bg-red-600',
};

const phaseAccent: Record<GamePhase, string> = {
  LOBBY: 'bg-slate-800',
  RULES: 'bg-indigo-800',
  ROUND: 'bg-amber-800',
  RESULTS: 'bg-emerald-800',
};

export const HostView: React.FC<HostViewProps> = ({ gameState, onTeacherCommand }) => {
  const { phase, alarm, round, results } = gameState;
  return (
    <div className={`min-h-screen text-white p-6 space-y-4 ${phaseAccent[phase]}`}>
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-wide">Lockdown Countdown – Host View</h1>
          <p className="text-sm text-slate-200 uppercase">Phase: {phase}</p>
        </div>
        <div className="flex gap-2">
          <button
            className="px-3 py-2 rounded bg-slate-700 hover:bg-slate-600 text-sm"
            onClick={() => onTeacherCommand({ type: 'START_GAME' })}
          >
            Start / Resume
          </button>
          <button
            className="px-3 py-2 rounded bg-red-700 hover:bg-red-600 text-sm"
            onClick={() => onTeacherCommand({ type: 'TRIGGER_PANIC' })}
          >
            Trigger Panic
          </button>
          <button
            className="px-3 py-2 rounded bg-amber-700 hover:bg-amber-600 text-sm"
            onClick={() => onTeacherCommand({ type: 'DROP_EVENT' })}
          >
            Drop Event
          </button>
          <button
            className="px-3 py-2 rounded bg-indigo-700 hover:bg-indigo-600 text-sm"
            onClick={() => onTeacherCommand({ type: 'ADVANCE_PHASE' })}
          >
            Next Phase
          </button>
        </div>
      </header>

      <LockdownStatusBanner
        phase={phase}
        alarmLevel={alarm.level}
        panicMode={alarm.panicMode || round?.panicMode}
      />
      <GlobalAlarmBar value={alarm.value} level={alarm.level} />

      {phase === 'LOBBY' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <LobbyOverview
            players={gameState.players}
            entryRouteDistribution={gameState.entryRouteDistribution}
          />
          <RulesVoteDisplay
            conditions={gameState.heistConditions}
            selectedIds={gameState.selectedConditionIds}
          />
        </div>
      )}

      {phase === 'RULES' && (
        <RulesVoteDisplay
          conditions={gameState.heistConditions}
          selectedIds={gameState.selectedConditionIds}
        />
      )}

      {phase === 'ROUND' && (
        <div className="space-y-4">
          <RulesVoteDisplay
            conditions={gameState.heistConditions}
            selectedIds={gameState.selectedConditionIds}
          />
          <PlayersGrid players={gameState.players} />
          {round?.topAgents?.length ? (
            <div className="bg-black/30 p-4 rounded-lg border border-white/10">
              <h3 className="text-xl font-semibold mb-2">Top Agents</h3>
              <ul className="space-y-1 text-sm">
                {round.topAgents.map((agent, idx) => (
                  <li key={agent.id} className="flex items-center gap-2">
                    <span className="text-slate-200">#{idx + 1}</span>
                    <span className="font-semibold">{agent.codename}</span>
                    <span className="text-slate-300">•</span>
                    <span className="text-amber-200">{agent.coins} coins</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}

      {phase === 'RESULTS' && results && <ResultsScreen results={results} />}
    </div>
  );
};

export const LobbyOverview: React.FC<{
  players: PlayerState[];
  entryRouteDistribution: Record<string, number>;
}> = ({ players, entryRouteDistribution }) => {
  const totalPlayers = players.length;
  return (
    <div className="bg-black/30 p-4 rounded-lg border border-white/10 flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Lobby</h2>
        <span className="text-sm text-slate-300">Waiting for agents…</span>
      </div>
      <div className="text-5xl font-black">{totalPlayers}</div>
      <p className="text-sm text-slate-300">Connected agents</p>
      <div className="grid grid-cols-2 gap-2 mt-2">
        {Object.entries(entryRouteDistribution).map(([route, count]) => (
          <div key={route} className="bg-slate-800/70 rounded px-3 py-2 text-sm flex justify-between">
            <span className="uppercase tracking-wide text-slate-200">{route}</span>
            <span className="font-semibold">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const RulesVoteDisplay: React.FC<{
  conditions: HeistConditionOption[];
  selectedIds: string[];
}> = ({ conditions, selectedIds }) => {
  const highlighted = new Set(selectedIds.slice(0, 2));
  return (
    <div className="bg-black/30 p-4 rounded-lg border border-white/10">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-semibold">Rule Vote</h2>
        <span className="text-xs text-slate-300">Top two become active</span>
      </div>
      <div className="space-y-3">
        {conditions.map((option) => {
          const isSelected = highlighted.has(option.id);
          return (
            <div
              key={option.id}
              className={`p-3 rounded-md border ${isSelected ? 'border-amber-400 bg-amber-400/10' : 'border-white/10 bg-white/5'}`}
            >
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-semibold">{option.title}</p>
                  {option.description ? (
                    <p className="text-xs text-slate-300">{option.description}</p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black">{Math.round(option.percentage)}%</p>
                  <p className="text-xs text-slate-300">{option.votes} votes</p>
                </div>
              </div>
              <div className="mt-2 h-2 bg-white/10 rounded">
                <div
                  className={`h-2 rounded ${isSelected ? 'bg-amber-400' : 'bg-indigo-400'}`}
                  style={{ width: `${Math.min(100, Math.max(0, option.percentage))}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const GlobalAlarmBar: React.FC<{ value: number; level: AlarmLevel }> = ({ value, level }) => {
  const width = Math.min(100, Math.max(0, value));
  return (
    <div className="bg-black/30 border border-white/10 rounded-lg p-3">
      <div className="flex justify-between items-center mb-1">
        <h2 className="font-semibold">Global Alarm</h2>
        <span className="text-sm uppercase tracking-wide">{level} LEVEL</span>
      </div>
      <div className="h-4 bg-white/10 rounded overflow-hidden">
        <div className={`h-full ${alarmColors[level]} transition-all`} style={{ width: `${width}%` }} />
      </div>
      <p className="text-xs text-slate-300 mt-1">{width}% escalation</p>
    </div>
  );
};

export const PlayersGrid: React.FC<{ players: PlayerState[] }> = ({ players }) => {
  return (
    <div className="bg-black/30 border border-white/10 rounded-lg p-4">
      <h2 className="text-xl font-semibold mb-3">Agents</h2>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {players.map((player) => (
          <div key={player.id} className="bg-slate-800/70 rounded-lg p-3 border border-white/10 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">{player.codename}</span>
              {player.mostWanted ? (
                <span className="px-2 py-1 text-[10px] bg-red-600 rounded-full uppercase tracking-wide">Most Wanted</span>
              ) : null}
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-amber-300 font-semibold">{player.coins} coins</span>
              <span className="text-pink-300">Heat {player.heat}</span>
            </div>
            {player.entryRoute ? (
              <div className="text-[11px] text-slate-300 uppercase tracking-wide">{player.entryRoute}</div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
};

export const LockdownStatusBanner: React.FC<{
  alarmLevel: AlarmLevel;
  panicMode?: boolean;
  phase: GamePhase;
}> = ({ alarmLevel, panicMode, phase }) => {
  let label = `${alarmLevel} LOCKDOWN`;
  if (panicMode) {
    label = 'PANIC MODE';
  }
  if (phase === 'RESULTS') {
    label = 'HEIST RESULTS';
  }
  if (phase === 'LOBBY') {
    label = 'PREPARE FOR INFILTRATION';
  }
  return (
    <div className={`p-4 rounded-lg text-center text-2xl font-black tracking-wide ${panicMode ? 'bg-red-700' : alarmColors[alarmLevel]}`}>
      {label}
    </div>
  );
};

export const ResultsScreen: React.FC<{ results: GameResults }> = ({ results }) => {
  const richest = results.richest.slice(0, 3);
  const awards: AwardResult[] = results.awards || [];
  return (
    <div className="bg-black/30 border border-white/10 rounded-lg p-4 space-y-4">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Top Agents</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {richest.map((agent, idx) => (
            <div key={agent.id} className="bg-slate-800/70 rounded-lg p-3 border border-white/10 text-center">
              <div className="text-sm text-slate-300">#{idx + 1}</div>
              <div className="text-xl font-bold">{agent.codename}</div>
              <div className="text-amber-300 font-semibold">{agent.coins} coins</div>
            </div>
          ))}
        </div>
      </div>
      {awards.length ? (
        <div>
          <h3 className="text-xl font-semibold mb-2">Awards</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {awards.map((award) => (
              <div key={`${award.title}-${award.recipient}`} className="bg-slate-800/70 rounded-lg p-3 border border-white/10">
                <div className="text-xs uppercase tracking-wide text-slate-300">{award.title}</div>
                <div className="text-lg font-bold">{award.recipient}</div>
                {award.description ? (
                  <div className="text-sm text-slate-200">{award.description}</div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default HostView;
