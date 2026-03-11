import React from 'react';
import { RivalryClanOption, RivalryWarSummary } from '../../services/rivalryService';

interface RivalryHubProps {
  wars: RivalryWarSummary[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenWar: (warId: string) => void;
  onDeclare: (targetClanId: string) => void;
  canDeclare: boolean;
  declaring: boolean;
  myClanId?: string | null;
  clanTargets: RivalryClanOption[];
  clanTargetsLoading: boolean;
  clanTargetsError: string | null;
  onSearchClanTargets: (search: string) => void;
  onReloadClanTargets: () => void;
  declareFeedback?: string | null;
}

const statusClass: Record<string, string> = {
  pending_response: 'text-amber-200 border-amber-400/40 bg-amber-900/30',
  prep: 'text-cyan-200 border-cyan-400/40 bg-cyan-900/25',
  live: 'text-red-100 border-red-400/50 bg-red-900/35 animate-pulse',
  blackout: 'text-fuchsia-100 border-fuchsia-300/50 bg-fuchsia-900/45 shadow-[0_0_16px_rgba(217,70,239,0.35)]',
  settled: 'text-emerald-200 border-emerald-400/40 bg-emerald-900/30',
  declined: 'text-slate-200 border-slate-400/40 bg-slate-900/35',
  expired: 'text-slate-300 border-slate-500/40 bg-slate-900/30',
  canceled: 'text-slate-300 border-slate-500/40 bg-slate-900/30',
};

const RivalryHub: React.FC<RivalryHubProps> = ({
  wars,
  loading,
  error,
  onRefresh,
  onOpenWar,
  onDeclare,
  canDeclare,
  declaring,
  myClanId,
  clanTargets,
  clanTargetsLoading,
  clanTargetsError,
  onSearchClanTargets,
  onReloadClanTargets,
  declareFeedback,
}) => {
  const [search, setSearch] = React.useState('');
  const [selectedTarget, setSelectedTarget] = React.useState<RivalryClanOption | null>(null);

  const filteredTargets = React.useMemo(() => {
    return clanTargets.filter((c) => c.id !== myClanId).slice(0, 30);
  }, [clanTargets, myClanId]);

  const handleSelect = (target: RivalryClanOption) => {
    setSelectedTarget(target);
    setSearch(target.name);
  };

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="card-glass p-4 border border-cyan-400/20">
        <h3 className="font-heading text-lg text-cyan-100 drop-shadow-[0_0_8px_rgba(34,211,238,0.35)]">Declare Rivalry</h3>
        <p className="text-sm text-gray-300 mt-1">Search and select a clan target to send a challenge.</p>
        {!canDeclare ? <p className="text-xs text-amber-200 mt-1">Join a clan to declare rivalry wars.</p> : null}

        <div className="mt-3 rounded-xl border border-cyan-400/25 bg-cyan-950/30 p-3">
          <p className="text-xs uppercase tracking-wide text-cyan-200/90">Declaration Requirements</p>
          <ul className="mt-2 space-y-1 text-xs text-cyan-100/90 list-disc list-inside">
            <li>You must be in a clan and have Leader, Officer, or Moderator permissions.</li>
            <li>Both clans need at least 5 members to start a rivalry war.</li>
            <li>Your clan can declare up to 2 wars per rolling 24-hour window.</li>
            <li>Clans already in an active war cannot start another one.</li>
            <li>The same clan matchup has a cooldown before it can be declared again.</li>
          </ul>
        </div>

        {declareFeedback ? (
          <div className="mt-3 rounded-xl border border-amber-300/50 bg-amber-900/35 p-3 shadow-[0_0_12px_rgba(251,191,36,0.2)]">
            <p className="text-[11px] uppercase tracking-wide text-amber-200">Declaration blocked</p>
            <p className="mt-1 text-sm text-amber-100">{declareFeedback}</p>
          </div>
        ) : null}

        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <input
              value={search}
              onChange={(e) => {
                const v = e.target.value;
                setSearch(v);
                setSelectedTarget(null);
                onSearchClanTargets(v);
              }}
              placeholder="Search clan name"
              disabled={!canDeclare}
              className="flex-1 rounded-lg bg-black/50 border border-white/15 px-3 py-2 text-sm text-white disabled:opacity-50 focus:outline-none focus:border-cyan-400/60 transition-colors"
            />
            <button
              onClick={onReloadClanTargets}
              disabled={!canDeclare}
              className="rounded-lg px-3 py-2 bg-white/10 hover:bg-white/20 text-xs disabled:opacity-50 transition-colors"
              type="button"
            >
              Reload
            </button>
          </div>

          {selectedTarget ? (
            <div className="rounded-lg border border-emerald-400/40 bg-emerald-900/20 p-2 text-sm flex items-center justify-between gap-2">
              <div>
                <div className="text-emerald-100 font-semibold">Target Locked: {selectedTarget.name}</div>
                <div className="text-xs text-emerald-200/80">{selectedTarget.id.slice(0, 8)}… • Members: {selectedTarget.member_count ?? '—'} • Score: {selectedTarget.total_score ?? '—'}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedTarget(null);
                  setSearch('');
                  onSearchClanTargets('');
                }}
                className="text-xs px-2 py-1 rounded bg-black/30 hover:bg-black/50 transition-colors"
              >
                Clear
              </button>
            </div>
          ) : null}

          <div className="rounded-lg border border-white/10 bg-black/30 p-2 max-h-48 overflow-auto">
            {clanTargetsLoading ? <p className="text-sm text-gray-400">Loading clan targets…</p> : null}
            {clanTargetsError ? <p className="text-sm text-red-300">{clanTargetsError}</p> : null}
            {!clanTargetsLoading && !clanTargetsError && filteredTargets.length === 0 ? (
              <p className="text-sm text-gray-400">No clans match your search.</p>
            ) : null}
            <div className="space-y-1">
              {filteredTargets.map((target) => (
                <button
                  key={target.id}
                  type="button"
                  onClick={() => handleSelect(target)}
                  disabled={!canDeclare}
                  className={`w-full text-left rounded px-2 py-1.5 text-sm border transition-all duration-200 ${selectedTarget?.id === target.id ? 'border-cyan-400/70 bg-cyan-900/35 shadow-[0_0_10px_rgba(34,211,238,0.2)]' : 'border-transparent hover:border-white/15 hover:bg-white/5'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-white font-medium">{target.name}</span>
                    <span className="text-xs text-gray-400">{target.id.slice(0, 8)}…</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <button
            disabled={!canDeclare || declaring || !selectedTarget?.id}
            onClick={() => selectedTarget?.id && onDeclare(selectedTarget.id)}
            className="w-full rounded-lg px-4 py-2 bg-red-600/85 hover:bg-red-500 disabled:opacity-50 text-white text-sm transition-all duration-200 hover:shadow-[0_0_16px_rgba(239,68,68,0.35)]"
          >
            {declaring ? 'Sending…' : selectedTarget ? `Declare vs ${selectedTarget.name}` : 'Select target to declare'}
          </button>
        </div>
      </div>

      <div className="card-glass p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-heading text-lg text-white">Public Wars</h3>
          <button onClick={onRefresh} className="text-xs px-3 py-1 rounded bg-white/10 hover:bg-white/20 transition-colors">Refresh</button>
        </div>
        {loading && <p className="text-sm text-gray-400">Loading wars…</p>}
        {error && <p className="text-sm text-red-300">{error}</p>}
        {!loading && !wars.length && <p className="text-sm text-gray-400">No wars found yet.</p>}
        <div className="space-y-2">
          {wars.map((war) => (
            <button
              key={war.war_id}
              onClick={() => onOpenWar(war.war_id)}
              className="w-full text-left rounded-xl border border-white/10 bg-black/35 p-3 hover:bg-black/55 transition-all duration-200 hover:border-cyan-400/30"
            >
              <div className="flex justify-between items-center gap-2">
                <div className="font-semibold text-sm text-white">
                  {war.attacker_clan_name || war.attacker_clan_id.slice(0, 8)} <span className="text-red-300">⚔</span> {war.defender_clan_name || war.defender_clan_id.slice(0, 8)}
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${statusClass[war.status] || 'text-gray-300 border-white/20 bg-white/10'}`}>{war.status}</span>
              </div>
              <div className="mt-1 text-xs text-gray-400">Created: {new Date(war.created_at).toLocaleString()}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RivalryHub;
