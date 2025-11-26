import React, { useState } from 'react';
import { SupabaseLockdownTransport } from '../../lib/lockdownSupabaseTransport';
import { LockdownTeacherView } from './LockdownTeacherView';
import { LockdownStudentView } from './LockdownStudentView';
import { RoomId, PlayerId } from '../../lib/lockdownTransport';

export const LockdownManager: React.FC<{ onExit: () => void; isTeacher?: boolean; playerName?: string; clanId?: string | null; clanName?: string | null; clanAvatarUrl?: string | null }> = ({ onExit, isTeacher = false, playerName: initialPlayerName = '', clanId = null, clanName = null, clanAvatarUrl = null }) => {
  const [mode, setMode] = useState<'lobby' | 'host' | 'player'>('lobby');
  const [transport] = useState(() => new SupabaseLockdownTransport());
  const [roomId, setRoomId] = useState<RoomId | null>(null);
  const [playerId, setPlayerId] = useState<PlayerId | null>(null);
  const [playerName, setPlayerName] = useState(initialPlayerName);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    return () => {
      transport.cleanup();
    };
  }, [transport]);

  const handleHost = async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const id = await transport.createRoom();
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
              onClick={handleHost}
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
