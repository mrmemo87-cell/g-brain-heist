import React from 'react';
import { RivalryClanOption, RivalryWarSummary } from '../../services/rivalryService';
import { RIVALRY_DECLARATION_REQUIREMENTS } from '../../services/rivalryRules';

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
  onTargetChange?: () => void;
  declareFeedback?: string | null;
}

const statusLabel: Record<string, string> = {
  pending_response: 'Challenge waiting for response',
  prep: 'Squad setup in progress',
  live: 'Live war in progress',
  blackout: 'Final blackout phase',
  settled: 'Results ready',
  declined: 'Challenge declined',
  expired: 'Challenge expired',
  canceled: 'Mission canceled',
};

const statusClass: Record<string, string> = {
  pending_response: 'text-amber-100 border-amber-400/40 bg-amber-900/30',
  prep: 'text-cyan-100 border-cyan-400/40 bg-cyan-900/25',
  live: 'text-red-100 border-red-400/50 bg-red-900/35 animate-pulse',
  blackout: 'text-fuchsia-100 border-fuchsia-300/50 bg-fuchsia-900/45',
  settled: 'text-emerald-200 border-emerald-400/40 bg-emerald-900/30',
};

const fmtWarTimer = (war: RivalryWarSummary): string => {
  const get = (time?: string | null) => {
    if (!time) return '';
    const ms = new Date(time).getTime() - Date.now();
    if (ms <= 0) return 'ending soon';
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m left`;
    return `${minutes}m left`;
  };
  if (war.status === 'prep') return `Prep: ${get(war.prep_ends_at)}`;
  if (war.status === 'live' || war.status === 'blackout') return `Battle: ${get(war.live_ends_at)}`;
  return `Opened ${new Date(war.created_at).toLocaleString()}`;
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
  onTargetChange,
  declareFeedback,
}) => {
  const [search, setSearch] = React.useState('');
  const [selectedTarget, setSelectedTarget] = React.useState<RivalryClanOption | null>(null);

  const filteredTargets = React.useMemo(() => clanTargets.filter((c) => c.id !== myClanId).slice(0, 30), [clanTargets, myClanId]);
  const incomingChallenge = wars.find((war) => war.status === 'pending_response' && war.defender_clan_id === myClanId);
  const activeWar = wars.find((war) => ['prep', 'live', 'blackout'].includes(war.status) && (war.attacker_clan_id === myClanId || war.defender_clan_id === myClanId));
  const historyWars = wars.filter((war) => ['settled', 'declined', 'expired', 'canceled'].includes(String(war.status)));

  const handleSelect = (target: RivalryClanOption) => {
    setSelectedTarget(target);
    setSearch(target.name);
    onTargetChange?.();
  };

  const WarCard = ({ war, cta }: { war: RivalryWarSummary; cta: string }) => (
    <button
      key={war.war_id}
      onClick={() => onOpenWar(war.war_id)}
      className="w-full text-left rounded-xl border border-white/15 bg-black/35 p-3 hover:bg-black/55 transition-all duration-200 hover:border-cyan-400/30"
    >
      <div className="flex justify-between items-center gap-2">
        <div className="font-semibold text-sm text-white">{war.attacker_clan_name || 'Attacker Clan'} <span className="text-red-300">⚔</span> {war.defender_clan_name || 'Defender Clan'}</div>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${statusClass[war.status] || 'text-gray-300 border-white/20 bg-white/10'}`}>
          {statusLabel[war.status] || 'Mission update'}
        </span>
      </div>
      <div className="mt-2 text-xs text-gray-300">{fmtWarTimer(war)}</div>
      <div className="mt-3 inline-flex rounded-md bg-cyan-500/20 border border-cyan-300/40 text-cyan-100 text-xs px-2 py-1">{cta}</div>
    </button>
  );

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card-glass p-4 border border-amber-400/20">
          <h3 className="font-heading text-lg text-amber-100">Incoming Challenge</h3>
          <p className="text-xs text-gray-300 mt-1">Respond fast to begin your mission setup.</p>
          <div className="mt-3">{incomingChallenge ? <WarCard war={incomingChallenge} cta="Open Mission" /> : <p className="text-sm text-gray-400">No incoming challenge right now.</p>}</div>
        </div>

        <div className="card-glass p-4 border border-red-400/20">
          <h3 className="font-heading text-lg text-red-100">Active War</h3>
          <p className="text-xs text-gray-300 mt-1">Jump back in and keep your clan on top.</p>
          <div className="mt-3">{activeWar ? <WarCard war={activeWar} cta="Open War" /> : <p className="text-sm text-gray-400">No active war for your clan.</p>}</div>
        </div>

        <div className="card-glass p-4 border border-cyan-400/20">
          <h3 className="font-heading text-lg text-cyan-100">Declare New War</h3>
          <p className="text-xs text-gray-300 mt-1">Search by clan name and send a challenge.</p>
          {!canDeclare ? <p className="text-xs text-amber-200 mt-1">Join a clan to declare rivalry wars.</p> : null}
          <div className="mt-3 space-y-2">
            <div className="flex gap-2">
              <input
                value={search}
                onChange={(e) => {
                  const v = e.target.value;
                  setSearch(v);
                  setSelectedTarget(null);
                  onSearchClanTargets(v);
                  onTargetChange?.();
                }}
                placeholder="Search clan name"
                disabled={!canDeclare}
                className="flex-1 rounded-lg bg-black/50 border border-white/15 px-3 py-2 text-sm text-white disabled:opacity-50"
              />
              <button onClick={onReloadClanTargets} disabled={!canDeclare} className="rounded-lg px-3 py-2 bg-white/10 hover:bg-white/20 text-xs disabled:opacity-50" type="button">Reload</button>
            </div>
            {selectedTarget ? (
              <div className="rounded-lg border border-emerald-400/40 bg-emerald-900/20 p-2 text-sm">
                <div className="text-emerald-100 font-semibold">Target: {selectedTarget.name}</div>
                <div className="text-xs text-emerald-200/80">Members: {selectedTarget.member_count ?? '—'} • Clan score: {selectedTarget.total_score ?? '—'}</div>
              </div>
            ) : null}
            <div className="rounded-lg border border-white/10 bg-black/30 p-2 max-h-44 overflow-auto">
              {clanTargetsLoading ? <p className="text-sm text-gray-400">Loading clan targets…</p> : null}
              {clanTargetsError ? <p className="text-sm text-red-300">{clanTargetsError}</p> : null}
              {!clanTargetsLoading && !clanTargetsError && filteredTargets.length === 0 ? <p className="text-sm text-gray-400">No clans match your search.</p> : null}
              <div className="space-y-1">
                {filteredTargets.map((target) => (
                  <button
                    key={target.id}
                    type="button"
                    onClick={() => handleSelect(target)}
                    disabled={!canDeclare}
                    className={`w-full text-left rounded px-2 py-1.5 text-sm border transition-all duration-200 ${selectedTarget?.id === target.id ? 'border-cyan-400/70 bg-cyan-900/35' : 'border-transparent hover:border-white/15 hover:bg-white/5'}`}
                  >
                    <div className="text-white font-medium">{target.name}</div>
                  </button>
                ))}
              </div>
            </div>
            <button
              disabled={!canDeclare || declaring || !selectedTarget?.id}
              onClick={() => selectedTarget?.id && onDeclare(selectedTarget.id)}
              className="w-full rounded-lg px-4 py-2 bg-red-600/85 hover:bg-red-500 disabled:opacity-50 text-white text-sm"
            >
              {declaring ? 'Sending challenge…' : selectedTarget ? `Declare war vs ${selectedTarget.name}` : 'Select a target clan'}
            </button>
            {declareFeedback ? <p className="text-xs text-amber-100">{declareFeedback}</p> : null}
          </div>
        </div>
      </div>

      <div className="card-glass p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-heading text-lg text-white">Public Wars & History</h3>
          <button onClick={onRefresh} className="text-xs px-3 py-1 rounded bg-white/10 hover:bg-white/20">Refresh</button>
        </div>
        {loading && <p className="text-sm text-gray-400">Loading wars…</p>}
        {error && <p className="text-sm text-red-300">{error}</p>}
        {!loading && !wars.length && <p className="text-sm text-gray-400">No wars found yet.</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {wars.slice(0, 12).map((war) => <WarCard key={war.war_id} war={war} cta={historyWars.includes(war) ? 'Open Recap' : 'Open War'} />)}
        </div>
      </div>

      <div className="rounded-xl border border-cyan-400/25 bg-cyan-950/20 p-3">
        <p className="text-xs uppercase tracking-wide text-cyan-200/90">War requirements</p>
        <ul className="mt-2 space-y-1 text-xs text-cyan-100/90 list-disc list-inside">
          {RIVALRY_DECLARATION_REQUIREMENTS.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default RivalryHub;
