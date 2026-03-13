import React from 'react';
import { RivalryLogEntry } from '../../services/rivalryService';
import { RIVALRY_STRUCTURE_LABELS } from './rivalryLabels';

interface RivalryLogsPanelProps {
  logs: RivalryLogEntry[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  actorNamesById?: Record<string, string>;
  viewerClanId?: string | null;
}

const badgeClass = (actionType: string): string => {
  if (actionType === 'strike') return 'border-red-400/50 bg-red-900/30 text-red-100';
  if (actionType === 'sabotage') return 'border-purple-400/50 bg-purple-900/30 text-purple-100';
  if (actionType === 'repair') return 'border-emerald-400/50 bg-emerald-900/30 text-emerald-100';
  return 'border-white/20 bg-white/10 text-gray-100';
};

const structureLabel = (code: string): string => RIVALRY_STRUCTURE_LABELS[code as keyof typeof RIVALRY_STRUCTURE_LABELS] || 'Structure';

const renderEventLine = (log: RivalryLogEntry, actorNamesById: Record<string, string>, viewerClanId?: string | null): string => {
  const actorName = log.actor_user_id ? actorNamesById[log.actor_user_id] : null;
  const fallbackActor = !log.actor_clan_id
    ? 'an anonymous player'
    : (viewerClanId && log.actor_clan_id === viewerClanId ? 'a friendly player' : 'an opposing player');
  const actor = actorName || fallbackActor;
  if (log.action_type === 'strike') return `${actor} landed a ${log.result_grade?.toLowerCase() || 'solid'} strike on ${structureLabel(log.target_structure_code)}`;
  if (log.action_type === 'sabotage') return `${actor} sabotaged ${structureLabel(log.target_structure_code)}`;
  if (log.action_type === 'repair') return `${actor} repaired ${structureLabel(log.target_structure_code)}`;
  return `${actor} made a tactical move.`;
};

const RivalryLogsPanel: React.FC<RivalryLogsPanelProps> = ({ logs, loading, hasMore, onLoadMore, actorNamesById = {}, viewerClanId = null }) => {
  return (
    <div className="card-glass p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-heading text-white">Tactical Feed</h3>
        <span className="text-xs text-gray-400">{logs.length} events</span>
      </div>
      <div className="space-y-2 max-h-72 overflow-auto pr-1">
        {logs.map((log) => (
          <div key={log.id} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm hover:border-white/20 transition-all duration-300 animate-fade-in-up">
            <div className="flex justify-between gap-2 items-center">
              <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${badgeClass(log.action_type)}`}>{log.action_type}</span>
              <span className="text-[11px] text-gray-500">{new Date(log.created_at).toLocaleString()}</span>
            </div>
            <div className="text-sm text-gray-100 mt-1">{renderEventLine(log, actorNamesById, viewerClanId)}</div>
            <div className="text-xs text-gray-300 mt-1">
              {typeof log.damage_amount === 'number' ? `DMG ${log.damage_amount}` : ''}
              {typeof log.repair_amount === 'number' ? `${typeof log.damage_amount === 'number' ? ' • ' : ''}REP ${log.repair_amount}` : ''}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-center">
        <button disabled={!hasMore || loading} onClick={onLoadMore} className="rounded-lg px-3 py-1.5 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-xs">
          {loading ? 'Loading…' : hasMore ? 'Load More Events' : 'No More Events'}
        </button>
      </div>
    </div>
  );
};

export default RivalryLogsPanel;
