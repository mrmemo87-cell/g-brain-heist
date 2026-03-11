import React from 'react';
import { RivalryWarSummary } from '../../services/rivalryService';

interface RivalryHubProps {
  wars: RivalryWarSummary[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenWar: (warId: string) => void;
  onDeclare: (targetClanId: string) => void;
  declaring: boolean;
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

const RivalryHub: React.FC<RivalryHubProps> = ({ wars, loading, error, onRefresh, onOpenWar, onDeclare, declaring }) => {
  const [targetClanId, setTargetClanId] = React.useState('');

  return (
    <div className="space-y-5">
      <div className="card-glass p-4">
        <h3 className="font-heading text-lg text-cyan-200">Declare Rivalry</h3>
        <p className="text-sm text-gray-400 mt-1">Enter target clan ID to send a challenge.</p>
        <div className="mt-3 flex gap-2">
          <input
            value={targetClanId}
            onChange={(e) => setTargetClanId(e.target.value)}
            placeholder="target clan UUID"
            className="flex-1 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white"
          />
          <button
            disabled={declaring || !targetClanId.trim()}
            onClick={() => onDeclare(targetClanId.trim())}
            className="rounded-lg px-4 py-2 bg-red-600/80 hover:bg-red-500 disabled:opacity-50 text-white text-sm"
          >
            {declaring ? 'Sending…' : 'Declare'}
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
