import React, { useEffect, useRef, useState } from 'react';

export interface LobbyRoom {
  id: string;
  teacherName?: string;
  classCodes?: string[];
  arenaMode?: 'open' | 'official';
  /** The student may enter (independents allowed, or they have a clan). */
  canEnter: boolean;
  remainingSeconds: number | null;
}

interface ArenaLobbyProps {
  rooms: LobbyRoom[];
  /** Rooms exist at school, just none for this student's class. */
  otherClassesLive: boolean;
  studentBatch?: string | null;
  missingClan: boolean;
  onJoin: (roomId: string) => Promise<void>;
  onGoToClan?: () => void;
  formatTimer: (seconds: number) => string;
}

const reducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/** Radar sweep with a little agent in the middle: "you are in the right place, just wait". */
const WaitingRadar: React.FC = () => (
  <svg className="arena-radar" viewBox="0 0 200 200" width="200" height="200" aria-hidden="true">
    <defs>
      <radialGradient id="arenaRadarBg" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#0e7490" stopOpacity="0.35" />
        <stop offset="100%" stopColor="#020617" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="arenaRadarSweep" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#22d3ee" stopOpacity="0" />
        <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.55" />
      </linearGradient>
    </defs>
    <circle cx="100" cy="100" r="96" fill="url(#arenaRadarBg)" />
    {[32, 58, 84].map((r) => (
      <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="#22d3ee" strokeOpacity="0.22" strokeWidth="1.5" />
    ))}
    <path d="M100 16v168M16 100h168" stroke="#22d3ee" strokeOpacity="0.12" strokeWidth="1" />
    <g className="arena-radar__sweep">
      <path d="M100 100 L100 16 A84 84 0 0 1 172.7 58 Z" fill="url(#arenaRadarSweep)" />
      <line x1="100" y1="100" x2="100" y2="16" stroke="#67e8f9" strokeWidth="2" strokeLinecap="round" />
    </g>
    <circle className="arena-radar__ping" cx="100" cy="100" r="20" fill="none" stroke="#67e8f9" strokeWidth="2" />
    <circle className="arena-radar__blip arena-radar__blip--a" cx="146" cy="62" r="4" fill="#fbbf24" />
    <circle className="arena-radar__blip arena-radar__blip--b" cx="58" cy="138" r="3.5" fill="#f472b6" />
    <circle className="arena-radar__blip arena-radar__blip--c" cx="150" cy="140" r="3" fill="#34d399" />
    {/* the student, waiting calmly in the centre */}
    <g className="arena-radar__agent">
      <circle cx="100" cy="100" r="17" fill="#0f172a" stroke="#22d3ee" strokeWidth="2" />
      <circle cx="100" cy="95" r="6" fill="#e2e8f0" />
      <path d="M89 111c2.5-6 6.5-9 11-9s8.5 3 11 9" fill="#e2e8f0" />
      <rect x="93" y="92.5" width="14" height="4" rx="2" fill="#0f172a" />
    </g>
  </svg>
);

/** Bouncing hand pointing at the join button. */
const TapHand: React.FC = () => (
  <svg className="arena-tap-hand" viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
    <circle className="arena-tap-hand__ripple" cx="20" cy="9" r="7" fill="none" stroke="#fde68a" strokeWidth="2.5" />
    <path
      d="M17 8.5a3 3 0 0 1 6 0V22l1.2-.9a3 3 0 0 1 4.3.7l.2.3 1-.5a3 3 0 0 1 4.2 1.4l.3.6.6-.2a3 3 0 0 1 3.8 2.1l1.8 7.4c.9 3.8-.4 7.8-3.4 10.3l-.6.5c-1.4 1.2-3.2 1.8-5 1.8H24.6c-2.4 0-4.6-1.1-6.1-3L10.4 32a3 3 0 0 1 4.5-4l2.1 2.3z"
      fill="#fff7ed"
      stroke="#0f172a"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);

const ArenaLobby: React.FC<ArenaLobbyProps> = ({ rooms, otherClassesLive, studentBatch, missingClan, onJoin, onGoToClan, formatTimer }) => {
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState('');
  const firstCard = useRef<HTMLDivElement | null>(null);
  const hadRooms = useRef(rooms.length > 0);

  // A battle just appeared: buzz (Android), and bring the card into view.
  useEffect(() => {
    const hasRooms = rooms.length > 0;
    if (hasRooms && !hadRooms.current) {
      try { navigator.vibrate?.([70, 50, 70]); } catch { /* iOS has no vibration */ }
      firstCard.current?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
    }
    hadRooms.current = hasRooms;
  }, [rooms.length]);

  const join = async (id: string) => {
    if (joiningId) return;
    setJoiningId(id);
    try { await onJoin(id); } finally { setJoiningId(null); }
  };

  const onCodeChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    setCode(digits);
    if (digits.length === 4) void join(digits);
  };

  const live = rooms.length > 0;

  return (
    <div className="arena-lobby" data-state={live ? 'live' : 'waiting'} data-testid="arena-lobby">
      <div className="arena-lobby__top">
        <span className={`arena-lobby__status ${live ? 'is-live' : ''}`}>
          <span className="arena-lobby__dot" aria-hidden="true" />
          {live ? 'LIVE' : 'Lobby'}
        </span>
        {missingClan && <span className="arena-lobby__chip" title="You are not in a clan yet">🛡️ No clan · open battles only</span>}
      </div>

      {!live ? (
        <div className="arena-wait" role="status" aria-live="polite">
          <WaitingRadar />
          <p className="arena-wait__title">Stay here <span className="arena-wait__dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></p>
          <p className="arena-wait__hint">
            {otherClassesLive && studentBatch
              ? <>No battle for <b>{studentBatch}</b> yet. It pops up here.</>
              : <>Your battle pops up here when your teacher starts it.</>}
          </p>
          <div className="arena-wait__steps" aria-hidden="true">
            <span className="is-done">⏳</span><i />
            <span>⚔️</span><i />
            <span>👆</span>
          </div>
        </div>
      ) : (
        <div className="arena-live" role="status" aria-live="assertive">
          <p className="arena-live__title">⚔️ Battle is live!</p>
          <div className="arena-live__list">
            {rooms.map((room, index) => {
              const locked = !room.canEnter;
              const busy = joiningId === room.id;
              const meta = [room.teacherName, room.classCodes?.join(', ')].filter(Boolean).join(' · ');
              return (
                <div
                  key={room.id}
                  ref={index === 0 ? firstCard : undefined}
                  className={`arena-card ${locked ? 'is-locked' : ''} ${index === 0 && !locked ? 'is-primary' : ''}`}
                  data-testid="arena-card"
                >
                  <div className="arena-card__head">
                    <span className="arena-card__code" aria-label={`Room ${room.id}`}>#{room.id}</span>
                    {room.remainingSeconds !== null && (
                      <span className="arena-card__timer">⏱ {formatTimer(room.remainingSeconds)}</span>
                    )}
                    <span className="arena-card__mode" title={room.arenaMode === 'open' ? 'Open arena' : 'Official arena'}>
                      {room.arenaMode === 'open' ? '🌐' : '✅'}
                    </span>
                  </div>
                  {meta && <p className="arena-card__meta">{meta}</p>}
                  {locked ? (
                    <button
                      type="button"
                      className="arena-card__join is-locked"
                      onClick={onGoToClan}
                      disabled={!onGoToClan}
                    >
                      🔒 Join a clan first
                    </button>
                  ) : (
                    <div className="arena-card__cta">
                      <button
                        type="button"
                        data-testid="arena-join"
                        className="arena-card__join"
                        onClick={() => void join(room.id)}
                        disabled={Boolean(joiningId)}
                        aria-busy={busy}
                      >
                        {busy ? <><span className="arena-card__spinner" aria-hidden="true" /> Joining…</> : <>TAP TO JOIN <span aria-hidden="true">▶</span></>}
                      </button>
                      {index === 0 && !joiningId && <TapHand />}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="arena-code">
        {!codeOpen ? (
          <button type="button" className="arena-code__toggle" onClick={() => setCodeOpen(true)}>
            🔑 Have a code?
          </button>
        ) : (
          <div className="arena-code__row">
            <input
              autoFocus
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              placeholder="• • • •"
              aria-label="4-digit room code"
              className="arena-code__input"
              disabled={Boolean(joiningId)}
            />
            <button
              type="button"
              className="arena-code__go"
              onClick={() => void join(code)}
              disabled={code.length !== 4 || Boolean(joiningId)}
              aria-label="Join with code"
            >
              {joiningId === code && code ? <span className="arena-card__spinner" aria-hidden="true" /> : '▶'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ArenaLobby;
