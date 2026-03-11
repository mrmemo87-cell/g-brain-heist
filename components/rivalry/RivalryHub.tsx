import React from 'react';
import { RivalryClanOption, RivalryWarSummary } from '../../services/rivalryService';

interface RivalryHubProps {
  wars: RivalryWarSummary[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenWar: (warId: string) => void;
  onDeclare: (targetClanId: string) => void;
  declaring: boolean;
  myClanId?: string | null;
  clanTargets: RivalryClanOption[];
  clanTargetsLoading: boolean;
  clanTargetsError: string | null;
  onSearchClanTargets: (search: string) => void;
  onReloadClanTargets: () => void;
}

const statusClass: Record<string, string> = {
  pending_response: 'text-amber-300',
  prep: 'text-cyan-300',
  live: 'text-red-300',
  blackout: 'text-fuchsia-300',
  settled: 'text-emerald-300',
  declined: 'text-slate-300',
  expired: 'text-slate-400',
  canceled: 'text-slate-400',
};

const RivalryHub: React.FC<RivalryHubProps> = ({
  wars,
  loading,
  error,
  onRefresh,
  onOpenWar,
  onDeclare,
  declaring,
  myClanId,
  clanTargets,
  clanTargetsLoading,
  clanTargetsError,
  onSearchClanTargets,
  onReloadClanTargets,
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
    <div className="space-y-5">
      <div className="card-glass p-4">
        <h3 className="font-heading text-lg text-cyan-200">Declare Rivalry</h3>
        <p className="text-sm text-gray-400 mt-1">Search and select a clan target to send a challenge.</p>

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
              className="flex-1 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white"
            />
            <button
              onClick={onReloadClanTargets}
              className="rounded-lg px-3 py-2 bg-white/10 hover:bg-white/20 text-xs"
              type="button"
            >
              Reload
            </button>
          </div>

          {selectedTarget ? (
            <div className="rounded-lg border border-emerald-400/40 bg-emerald-900/20 p-2 text-sm flex items-center justify-between gap-2">
              <div>
                <div className="text-emerald-100 font-semibold">Target: {selectedTarget.name}</div>
                <div className="text-xs text-emerald-200/80">{selectedTarget.id.slice(0, 8)}… • Members: {selectedTarget.member_count ?? '—'} • Score: {selectedTarget.total_score ?? '—'}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedTarget(null);
                  setSearch('');
                  onSearchClanTargets('');
                }}
                className="text-xs px-2 py-1 rounded bg-black/30 hover:bg-black/50"
              >
                Clear
              </button>
            </div>
          ) : null}

          <div className="rounded-lg border border-white/10 bg-black/20 p-2 max-h-48 overflow-auto">
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
                  className={`w-full text-left rounded px-2 py-1.5 text-sm border ${selectedTarget?.id === target.id ? 'border-cyan-400/60 bg-cyan-900/30' : 'border-transparent hover:border-white/10 hover:bg-white/5'}`}
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
            disabled={declaring || !selectedTarget?.id}
            onClick={() => selectedTarget?.id && onDeclare(selectedTarget.id)}
            className="w-full rounded-lg px-4 py-2 bg-red-600/80 hover:bg-red-500 disabled:opacity-50 text-white text-sm"
          >
            {declaring ? 'Sending…' : selectedTarget ? `Declare vs ${selectedTarget.name}` : 'Select target to declare'}
          </button>
        </div>
      </div>

      <div className="card-glass p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-heading text-lg text-white">Public Wars</h3>
          <button onClick={onRefresh} className="text-xs px-3 py-1 rounded bg-white/10 hover:bg-white/20">Refresh</button>
        </div>
        {loading && <p className="text-sm text-gray-400">Loading wars…</p>}
        {error && <p className="text-sm text-red-300">{error}</p>}
        {!loading && !wars.length && <p className="text-sm text-gray-400">No wars found yet.</p>}
        <div className="space-y-2">
          {wars.map((war) => (
            <button
              key={war.war_id}
              onClick={() => onOpenWar(war.war_id)}
              className="w-full text-left rounded-xl border border-white/10 bg-black/30 p-3 hover:bg-black/45"
            >
              <div className="flex justify-between">
                <div className="font-semibold text-sm text-white">
                  {war.attacker_clan_name || war.attacker_clan_id.slice(0, 8)} vs {war.defender_clan_name || war.defender_clan_id.slice(0, 8)}
                </div>
                <span className={`text-xs uppercase ${statusClass[war.status] || 'text-gray-300'}`}>{war.status}</span>
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
