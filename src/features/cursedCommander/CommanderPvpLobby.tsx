import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  cancelCommanderPvp,
  commanderPvpError,
  getCommanderPvpLobby,
  type CommanderPvpLobby,
  type CommanderPvpTarget,
} from '../../../services/commanderPvpService';

export type CommanderPvpLaunch = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  level: number;
  battleId?: string;
};

type Props = {
  onClose: () => void;
  onBattle: (launch: CommanderPvpLaunch) => void;
};

const schoolLabel = (school: string) => school ? school.toUpperCase() : 'NEUTRAL';

const resultLabel = (result: string) => {
  if (result === 'victory') return 'VICTORY';
  if (result === 'defeat') return 'DEFEAT';
  if (result === 'draw') return 'DRAW';
  if (result === 'expired') return 'EXPIRED';
  return 'CANCELLED';
};

const resultClass = (result: string) => {
  if (result === 'victory') return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200';
  if (result === 'defeat') return 'border-rose-400/30 bg-rose-400/10 text-rose-200';
  if (result === 'draw') return 'border-amber-400/30 bg-amber-400/10 text-amber-200';
  return 'border-slate-600 bg-slate-800/70 text-slate-300';
};

const formatRemaining = (remainingMs: number) => {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const CommanderPvpLobby: React.FC<Props> = ({ onClose, onBattle }) => {
  const [lobby, setLobby] = useState<CommanderPvpLobby | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [abandoning, setAbandoning] = useState(false);
  const [confirmAbandon, setConfirmAbandon] = useState(false);

  const load = useCallback(async (query = '') => {
    setLoading(true);
    setError('');
    try {
      setLobby(await getCommanderPvpLobby(query, 48));
    } catch (cause) {
      setError(commanderPvpError(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(search), 300);
    return () => window.clearTimeout(timer);
  }, [load, search]);

  useEffect(() => {
    if (!lobby?.activeBattle) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [lobby?.activeBattle]);

  useEffect(() => {
    const expiresAt = lobby?.activeBattle?.expires_at;
    if (!expiresAt) return undefined;
    const delay = Math.max(0, new Date(expiresAt).getTime() - Date.now()) + 350;
    const timer = window.setTimeout(() => void load(search), delay);
    return () => window.clearTimeout(timer);
  }, [lobby?.activeBattle?.expires_at, load, search]);

  useEffect(() => {
    setConfirmAbandon(false);
  }, [lobby?.activeBattle?.battle_id]);

  const cooldownMs = (lobby?.rules.cooldownSeconds ?? 300) * 1000;
  const targetCooldown = (target: CommanderPvpTarget) => {
    if (!target.last_attacked_at) return 0;
    return Math.max(0, cooldownMs - (Date.now() - new Date(target.last_attacked_at).getTime()));
  };

  const targets = useMemo(() => lobby?.targets ?? [], [lobby]);
  const activeRemainingMs = lobby?.activeBattle
    ? Math.max(0, new Date(lobby.activeBattle.expires_at).getTime() - now)
    : 0;

  const abandonActiveBattle = async () => {
    const battleId = lobby?.activeBattle?.battle_id;
    if (!battleId || abandoning) return;
    setAbandoning(true);
    setError('');
    try {
      await cancelCommanderPvp(battleId);
      setConfirmAbandon(false);
      await load(search);
    } catch (cause) {
      setError(commanderPvpError(cause));
    } finally {
      setAbandoning(false);
    }
  };

  return (
    <section className="w-full min-w-0 bg-slate-950 py-3 sm:py-5" data-no-interface-translation="true" lang="en" dir="ltr">
      <div className="mx-auto w-full max-w-7xl overflow-hidden rounded-[2rem] border border-cyan-400/20 bg-[#050b15] shadow-[0_0_90px_rgba(34,211,238,0.12)]">
        <header className="relative overflow-hidden border-b border-cyan-400/10 px-5 py-5 sm:px-7">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_0%,rgba(34,211,238,0.20),transparent_34%),radial-gradient(circle_at_88%_10%,rgba(168,85,247,0.15),transparent_30%)]" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-cyan-300/35 bg-cyan-300/10 px-2.5 py-1 text-[10px] font-black tracking-[0.18em] text-cyan-200">COMMANDER NETWORK</span>
                <span className="rounded-full border border-violet-300/25 bg-violet-300/10 px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] text-violet-200">SERVER-AUTHORITATIVE</span>
              </div>
              <h1 className="font-heading text-3xl font-black text-white sm:text-4xl">Player Battles</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                Attack another enrolled Commander anywhere in Brains Heist. Their current saved army becomes the defending formation and the result is recorded.
              </p>
            </div>
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2 text-sm font-bold text-slate-200 transition hover:border-cyan-400/40 hover:text-white">← Headquarters</button>
          </div>
        </header>

        <main className="space-y-5 p-4 sm:p-6">
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.05] p-4">
              <span className="text-[10px] font-black tracking-[0.15em] text-cyan-300">GLOBAL MATCHING</span>
              <strong className="mt-1 block text-sm text-white">All enrolled student Commanders</strong>
            </div>
            <div className="rounded-2xl border border-violet-400/15 bg-violet-400/[0.05] p-4">
              <span className="text-[10px] font-black tracking-[0.15em] text-violet-300">DEFENDER SNAPSHOT</span>
              <strong className="mt-1 block text-sm text-white">Real equipped units, stats and school powers</strong>
            </div>
            <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.05] p-4">
              <span className="text-[10px] font-black tracking-[0.15em] text-amber-300">FAIR PLAY</span>
              <strong className="mt-1 block text-sm text-white">No Coins or account XP are transferred</strong>
            </div>
          </section>

          {lobby?.activeBattle && (
            <section className="rounded-3xl border border-amber-300/30 bg-gradient-to-r from-amber-400/[0.08] via-slate-900/70 to-violet-400/[0.06] p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <span className="text-[10px] font-black tracking-[0.18em] text-amber-300">BATTLE IN PROGRESS</span>
                  <h2 className="mt-1 font-heading text-xl font-black text-white">Vs {lobby.activeBattle.opponent_username}</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-300">
                    Your battle is safely saved on the server. Resume from the exact saved turn, or abandon it to return to the network.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1.5 font-bold text-slate-300">Commander Level {lobby.activeBattle.opponent_level}</span>
                    {lobby.activeBattle.opponent_elixir && (
                      <span className="rounded-full border border-fuchsia-300/30 bg-fuchsia-300/10 px-3 py-1.5 font-black text-fuchsia-100">
                        ⚗ Frozen boost · {lobby.activeBattle.opponent_elixir.name} · +{lobby.activeBattle.opponent_elixir.boostRanks} {lobby.activeBattle.opponent_elixir.statKey === 'omni' ? 'ALL SKILLS' : lobby.activeBattle.opponent_elixir.statKey.toUpperCase()}
                      </span>
                    )}
                    <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1.5 font-black text-amber-200">Time remaining · {formatRemaining(activeRemainingMs)}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onBattle({
                      userId: lobby.activeBattle!.opponent_user_id,
                      username: lobby.activeBattle!.opponent_username,
                      avatarUrl: lobby.activeBattle!.opponent_avatar_url,
                      level: lobby.activeBattle!.opponent_level,
                      battleId: lobby.activeBattle!.battle_id,
                    })}
                    className="rounded-2xl bg-gradient-to-r from-amber-300 to-orange-400 px-5 py-3 font-heading text-sm font-black text-slate-950 shadow-lg shadow-amber-500/10 transition hover:brightness-110"
                  >
                    Resume Battle →
                  </button>
                  {!confirmAbandon ? (
                    <button
                      type="button"
                      onClick={() => setConfirmAbandon(true)}
                      className="rounded-2xl border border-rose-400/30 bg-rose-400/[0.06] px-4 py-3 text-sm font-bold text-rose-200 transition hover:bg-rose-400/10"
                    >
                      Abandon Battle
                    </button>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-rose-400/25 bg-rose-400/[0.06] p-2">
                      <span className="px-2 text-xs font-bold text-rose-100">Cancel this battle?</span>
                      <button
                        type="button"
                        onClick={() => void abandonActiveBattle()}
                        disabled={abandoning}
                        className="rounded-xl bg-rose-400 px-3 py-2 text-xs font-black text-slate-950 disabled:opacity-50"
                      >
                        {abandoning ? 'Cancelling…' : 'Yes, abandon'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmAbandon(false)}
                        disabled={abandoning}
                        className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 disabled:opacity-50"
                      >
                        Keep battle
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <p className="mt-4 border-t border-slate-800/80 pt-3 text-[11px] leading-5 text-slate-500">
                Disconnecting does not decide the battle. It remains resumable until the server timer expires. Abandoning records it as cancelled; no Coins or account XP are transferred.
              </p>
            </section>
          )}

          <section className="rounded-3xl border border-slate-800 bg-slate-900/45 p-4 sm:p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <span className="text-[10px] font-black tracking-[0.18em] text-cyan-300">TARGET NETWORK</span>
                <h2 className="mt-1 font-heading text-xl font-black text-white">Choose a Commander</h2>
                <p className="mt-1 text-xs text-slate-400">Targets are ordered near your Commander level first.</p>
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search username"
                  className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400/50 sm:w-64"
                />
                <button type="button" onClick={() => void load(search)} disabled={loading} className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-bold text-slate-300 hover:border-cyan-400/40 hover:text-white disabled:opacity-50">↻</button>
              </div>
            </div>

            {error && <p role="alert" className="mt-4 rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</p>}
            {loading && !lobby && <p role="status" className="mt-5 text-center text-sm font-bold tracking-wider text-cyan-200">SCANNING COMMANDER NETWORK…</p>}

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {targets.map((target) => {
                const remaining = targetCooldown(target);
                const cooldown = remaining > 0;
                const minutes = Math.max(1, Math.ceil(remaining / 60_000));
                return (
                  <article key={target.user_id} className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/70 p-4 transition hover:border-cyan-400/30">
                    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/40 to-transparent" />
                    <div className="flex items-center gap-3">
                      <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full border border-cyan-400/25 bg-slate-900 text-lg font-black text-cyan-200">
                        {target.avatar_url ? <img src={target.avatar_url} alt="" className="h-full w-full object-cover" /> : target.username.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-heading text-base font-black text-white">{target.username}</h3>
                        <p className="text-xs text-slate-400">Commander Level {target.level}</p>
                      </div>
                      <span className="rounded-full border border-violet-300/20 bg-violet-300/10 px-2 py-1 text-[9px] font-black tracking-wider text-violet-200">ENROLLED</span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                        <span className="block text-[9px] font-black tracking-wider text-slate-500">FRONTLINE · {schoolLabel(target.guard_school)}</span>
                        <strong className="mt-1 block truncate text-slate-100">{target.guard_name}</strong>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                        <span className="block text-[9px] font-black tracking-wider text-slate-500">RANGED · {schoolLabel(target.archer_school)}</span>
                        <strong className="mt-1 block truncate text-slate-100">{target.archer_name}</strong>
                      </div>
                    </div>

                    {target.active_elixir && (
                      <div className="mt-2 rounded-xl border border-fuchsia-300/25 bg-fuchsia-400/[0.07] px-3 py-2">
                        <span className="block text-[9px] font-black tracking-[0.12em] text-fuchsia-300">ACTIVE COMBAT ELIXIR</span>
                        <strong className="mt-1 block text-xs text-fuchsia-50">⚗ {target.active_elixir.name} · +{target.active_elixir.boostRanks} {target.active_elixir.statKey === 'omni' ? 'ALL SKILLS' : target.active_elixir.statKey.toUpperCase()}</strong>
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={cooldown || Boolean(lobby?.activeBattle)}
                      onClick={() => onBattle({ userId: target.user_id, username: target.username, avatarUrl: target.avatar_url, level: target.level })}
                      className="mt-4 w-full rounded-xl border border-cyan-300/35 bg-cyan-300/10 px-4 py-2.5 font-heading text-xs font-black tracking-wider text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800/60 disabled:text-slate-500"
                    >
                      {lobby?.activeBattle ? 'BATTLE IN PROGRESS' : cooldown ? `COOLDOWN · ${minutes}M` : 'ATTACK COMMANDER'}
                    </button>
                  </article>
                );
              })}
            </div>

            {!loading && !targets.length && !error && (
              <p className="mt-5 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-6 text-center text-sm text-slate-400">No enrolled Commanders match this search yet.</p>
            )}
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900/45 p-4 sm:p-5">
            <div>
              <span className="text-[10px] font-black tracking-[0.18em] text-violet-300">BATTLE RECORD</span>
              <h2 className="mt-1 font-heading text-xl font-black text-white">Recent Commander battles</h2>
            </div>
            <div className="mt-4 space-y-2">
              {(lobby?.history ?? []).map((entry) => (
                <div key={entry.battle_id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/65 px-3 py-3">
                  <span className={`rounded-full border px-2 py-1 text-[9px] font-black tracking-wider ${resultClass(entry.result)}`}>{resultLabel(entry.result)}</span>
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-sm text-white">{entry.opponent_username}</strong>
                    <span className="text-[10px] text-slate-500">{entry.was_attacker ? 'You attacked' : 'Your defense was challenged'} · {new Date(entry.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
              {!lobby?.history.length && <p className="text-sm text-slate-500">Your first recorded Commander battle will appear here.</p>}
            </div>
          </section>
        </main>
      </div>
    </section>
  );
};

export default CommanderPvpLobby;
