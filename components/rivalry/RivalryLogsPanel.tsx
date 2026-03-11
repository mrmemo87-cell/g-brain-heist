import React from 'react';
import { RivalryLogEntry } from '../../services/rivalryService';

interface RivalryLogsPanelProps {
  logs: RivalryLogEntry[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

const RivalryLogsPanel: React.FC<RivalryLogsPanelProps> = ({ logs, loading, hasMore, onLoadMore }) => {
  return (
    <div className="card-glass p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-heading text-white">War Logs</h3>
        <span className="text-xs text-gray-400">{logs.length} entries</span>
      </div>
      <div className="space-y-2 max-h-72 overflow-auto pr-1">
        {logs.map((log) => (
          <div key={log.id} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-gray-200 uppercase">{log.action_type}</span>
              <span className="text-xs text-gray-400">{new Date(log.created_at).toLocaleTimeString()}</span>
            </div>
            <div className="text-xs text-gray-400 mt-1">
              Target: {log.target_structure_code} • Grade: {log.result_grade}
              {typeof log.damage_amount === 'number' ? ` • DMG ${log.damage_amount}` : ''}
              {typeof log.repair_amount === 'number' ? ` • REP ${log.repair_amount}` : ''}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-center">
        <button disabled={!hasMore || loading} onClick={onLoadMore} className="rounded-lg px-3 py-1.5 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-xs">
          {loading ? 'Loading…' : hasMore ? 'Load More' : 'No More Logs'}
        </button>
      </div>
    </div>
  );
};

export default RivalryLogsPanel;
