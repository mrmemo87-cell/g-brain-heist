import React, { useState } from 'react';
import { SupabaseLockdownTransport } from '../../lib/lockdownSupabaseTransport';
import { LockdownTeacherView } from './LockdownTeacherView';
import { LockdownStudentView } from './LockdownStudentView';
import { RoomId, PlayerId } from '../../lib/lockdownTransport';

export const LockdownManager: React.FC<{ onExit: () => void; isTeacher?: boolean; playerName?: string; clanId?: string | null; clanName?: string | null; clanAvatarUrl?: string | null }> = ({ onExit, isTeacher = false, playerName: initialPlayerName = '', clanId = null, clanName = null, clanAvatarUrl = null }) => {
  const [mode, setMode] = useState<'lobby' | 'host' | 'player' | 'configure'>('lobby');
  const [transport] = useState(() => new SupabaseLockdownTransport());
  const [roomId, setRoomId] = useState<RoomId | null>(null);
  const [playerId, setPlayerId] = useState<PlayerId | null>(null);
  const [playerName, setPlayerName] = useState(initialPlayerName);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Game configuration settings
  const [durationMinutes, setDurationMinutes] = useState(12);
  const [selectedMap, setSelectedMap] = useState('default');
  const [coinGoal, setCoinGoal] = useState(600);
  const [alarmMax, setAlarmMax] = useState(100);

  React.useEffect(() => {
    return () => {
      transport.cleanup();
    };
  }, [transport]);

  const handleHost = async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const id = await transport.createRoom({
        durationMs: durationMinutes * 60 * 1000,
        coinGoal,
        alarmMax,
        mapId: selectedMap,
      });
      setRoomId(id);
      setMode('host');
    } catch (e) {
      console.error("Failed to create room", e);
      setError("Failed to create room. Please try again.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleJoin = async () => {
    if (!roomCodeInput || !playerName) return;
    setIsConnecting(true);
    setError(null);
    try {
      const id = `room-${roomCodeInput}` as RoomId;
      const pid = await transport.joinRoom(id, playerName, {
        clanId: clanId ?? undefined,
        clanName: clanName ?? undefined,
        clanAvatarUrl: clanAvatarUrl ?? undefined,
      });
      setRoomId(id);
      setPlayerId(pid);
      setMode('player');
    } catch (e: any) {
      console.error("Failed to join room", e);
      setError(e.message || "Failed to join room. Check room code.");
    } finally {
      setIsConnecting(false);
    }
  };

  if (mode === 'configure') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-2xl space-y-8">
          <div className="space-y-3 text-center">
            <button
              onClick={() => setMode('lobby')}
              className="text-sm text-gray-400 hover:text-gray-300 transition"
            >
              ← Back
            </button>
            <span className="inline-flex items-center justify-center rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">
              Configure Session
            </span>
            <h1 className="font-heading text-4xl text-white tracking-tight">Game Settings</h1>
            <p className="text-sm text-gray-400">Customize the countdown timer, map, and objectives for your lockdown session.</p>
          </div>

          <div className="card-glass p-8 space-y-6">
            {/* Duration Setting */}
            <div className="space-y-3">
              <label className="block text-sm font-bold text-white">Game Duration</label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="3"
                  max="30"
                  step="1"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
                <div className="min-w-[80px] text-center rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 font-mono text-lg font-bold text-amber-300">
                  {durationMinutes}m
                </div>
              </div>
              <p className="text-xs text-gray-400">How long agents have to complete the heist (3-30 minutes)</p>
            </div>

            {/* Map Selection */}
            <div className="space-y-3">
              <label className="block text-sm font-bold text-white">Territory Map</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setSelectedMap('default')}
                  className={`p-4 rounded-xl border-2 transition ${
                    selectedMap === 'default'
                      ? 'border-cyan-400 bg-cyan-500/20'
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                  }`}
                >
                  <div className="text-left space-y-1">
                    <p className="font-bold text-white">🗺️ Default</p>
                    <p className="text-xs text-gray-400">Standard 8-region layout</p>
                  </div>
                </button>
                <button
                  onClick={() => setSelectedMap('downtown')}
                  className={`p-4 rounded-xl border-2 transition ${
                    selectedMap === 'downtown'
                      ? 'border-cyan-400 bg-cyan-500/20'
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                  }`}
                >
                  <div className="text-left space-y-1">
                    <p className="font-bold text-white">🏙️ Downtown</p>
                    <p className="text-xs text-gray-400">Urban grid with 12 sectors</p>
                  </div>
                </button>
                <button
                  onClick={() => setSelectedMap('compound')}
                  className={`p-4 rounded-xl border-2 transition ${
                    selectedMap === 'compound'
                      ? 'border-cyan-400 bg-cyan-500/20'
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                  }`}
                >
                  <div className="text-left space-y-1">
                    <p className="font-bold text-white">🏢 Compound</p>
                    <p className="text-xs text-gray-400">Facility with 6 zones</p>
                  </div>
                </button>
                <button
                  onClick={() => setSelectedMap('vault')}
                  className={`p-4 rounded-xl border-2 transition ${
                    selectedMap === 'vault'
                      ? 'border-cyan-400 bg-cyan-500/20'
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                  }`}
                >
                  <div className="text-left space-y-1">
                    <p className="font-bold text-white">🔐 Vault</p>
                    <p className="text-xs text-gray-400">High security, 4 chambers</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Coin Goal */}
            <div className="space-y-3">
              <label className="block text-sm font-bold text-white">Coin Goal</label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="300"
                  max="1500"
                  step="50"
                  value={coinGoal}
                  onChange={(e) => setCoinGoal(Number(e.target.value))}
                  className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
                <div className="min-w-[100px] text-center rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 font-mono text-lg font-bold text-amber-300">
                  {coinGoal}
                </div>
              </div>
              <p className="text-xs text-gray-400">Target loot for team victory (300-1500 coins)</p>
            </div>

            {/* Alarm Threshold */}
            <div className="space-y-3">
              <label className="block text-sm font-bold text-white">Maximum Alarm Level</label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="50"
                  max="150"
                  step="10"
                  value={alarmMax}
                  onChange={(e) => setAlarmMax(Number(e.target.value))}
                  className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-rose-500"
                />
                <div className="min-w-[100px] text-center rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 font-mono text-lg font-bold text-rose-300">
                  {alarmMax}%
                </div>
              </div>
              <p className="text-xs text-gray-400">Game ends if alarm reaches this level (50-150%)</p>
            </div>

            {error && (
              <div className="rounded-xl border border-red-400/60 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              onClick={handleHost}
              disabled={isConnecting}
              className="w-full font-heading font-bold rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400 py-4 text-lg text-white transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isConnecting ? "Creating Session..." : "Create Session"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'host' && roomId) {
    return <LockdownTeacherView transport={transport} roomId={roomId} onExit={onExit} />;
  }

  if (mode === 'player' && roomId && playerId) {
    return <LockdownStudentView transport={transport} roomId={roomId} playerId={playerId} onExit={onExit} />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg space-y-10">
        <div className="space-y-3 text-center">
          <span className="inline-flex items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
            Lockdown Protocol
          </span>
          <h1 className="font-heading text-4xl text-white tracking-tight">LOCKDOWN MODE</h1>
          <p className="text-sm text-gray-400">Secure the facility, outsmart the system, and keep the network under wraps.</p>
        </div>

        <div className="grid gap-5">
          <div className="card-glass p-6">
            <div className="space-y-5">
              <div className="space-y-1.5">
                <h2 className="font-heading text-xl text-white">Join Active Operation</h2>
                <p className="text-sm text-gray-400">Enter the room code shared by your handler and confirm your codename.</p>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400">Room Code</label>
                  <input
                    type="text"
                    value={roomCodeInput}
                    onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                    placeholder="1234"
                    maxLength={4}
                    className="w-full rounded-xl border border-gray-600 bg-black/30 px-4 py-3 text-lg font-semibold tracking-[0.4em] text-white placeholder:text-gray-500 focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400">Agent Name</label>
                  <input
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Codename"
                    disabled={!!initialPlayerName}
                    className="w-full rounded-xl border border-gray-600 bg-black/30 px-4 py-3 text-base text-white placeholder:text-gray-500 focus:border-cyan-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
                {error && (
                  <div className="rounded-xl border border-red-400/60 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    {error}
                  </div>
                )}
                <button
                  onClick={handleJoin}
                  disabled={!roomCodeInput || !playerName || isConnecting}
                  className="w-full font-heading font-bold rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400 py-3 text-base text-white transition disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isConnecting ? "Connecting..." : "Join Operation"}
                </button>
              </div>
            </div>
          </div>

          <div className="relative flex items-center justify-center">
            <span className="relative z-10 rounded-full border border-gray-700 bg-ink-900 px-4 py-1 text-xs font-semibold tracking-wide text-gray-400">
              OR
            </span>
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="h-px w-full bg-gray-700/70"></div>
            </div>
          </div>

          {isTeacher ? (
            <button
              onClick={() => setMode('configure')}
              disabled={isConnecting}
              className="w-full font-heading font-bold rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400 py-3 text-base text-white transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              Host New Session
            </button>
          ) : (
            <div className="card-glass px-4 py-3 text-center text-xs text-gray-400">
              Only verified teachers can host lockdown sessions.
            </div>
          )}
        </div>

        <button onClick={onExit} className="w-full text-sm font-semibold text-gray-500 transition hover:text-gray-300">
          ← Return to Dashboard
        </button>
      </div>
    </div>
  );
};
