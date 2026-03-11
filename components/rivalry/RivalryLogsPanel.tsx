import React from 'react';
import { RivalryLogEntry } from '../../services/rivalryService';

interface RivalryLogsPanelProps {
  logs: RivalryLogEntry[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

const badgeClass = (actionType: string): string => {
  if (actionType === 'strike') return 'border-red-400/50 bg-red-900/30 text-red-100';
  if (actionType === 'sabotage') return 'border-purple-400/50 bg-purple-900/30 text-purple-100';
  if (actionType === 'repair') return 'border-emerald-400/50 bg-emerald-900/30 text-emerald-100';
  return 'border-white/20 bg-white/10 text-gray-100';
};

const gradeClass = (grade?: string | null): string => {
  if (!grade) return 'text-gray-300';
  const upper = grade.toUpperCase();
  if (upper === 'STRONG') return 'text-emerald-300';
  if (upper === 'WEAK') return 'text-amber-300';
  if (upper === 'MISS') return 'text-red-300';
  return 'text-cyan-300';
};

const RivalryLogsPanel: React.FC<RivalryLogsPanelProps> = ({ logs, loading, hasMore, onLoadMore }) => {
  return (
    <div className="card-glass p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-heading text-white">War Logs</h3>
        <span className="text-xs text-gray-400">{logs.length} entries</span>
      </div>
      <div className="space-y-2 max-h-72 overflow-auto pr-1">
        {logs.map((log) => (
          <div key={log.id} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm transition-colors hover:border-white/20">
            <div className="flex justify-between gap-2 items-center">
              <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${badgeClass(log.action_type)}`}>
                {log.action_type}
              </span>
              <span className="text-[11px] text-gray-500">{new Date(log.created_at).toLocaleString()}</span>
            </div>
            <div className="text-xs text-gray-300 mt-1">
              Target: <span className="text-gray-100">{log.target_structure_code}</span> • Grade: <span className={`font-semibold ${gradeClass(log.result_grade)}`}>{log.result_grade || '—'}</span>
              {typeof log.damage_amount === 'number' ? ` • DMG ${log.damage_amount}` : ''}
              {typeof log.repair_amount === 'number' ? ` • REP ${log.repair_amount}` : ''}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-center">
        <button disabled={!hasMore || loading} onClick={onLoadMore} className="rounded-lg px-3 py-1.5 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-xs transition-colors">
          {loading ? 'Loading…' : hasMore ? 'Load More' : 'No More Logs'}
        </button>
      </div>
    </div>
  );
};

export default RivalryLogsPanel;
