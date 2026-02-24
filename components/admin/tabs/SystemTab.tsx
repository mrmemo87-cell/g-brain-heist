import React from 'react';
import { useAdmin } from '../AdminContext';
import * as CompetitionService from '../../../services/competitionService';

const SystemTab: React.FC = () => {
  const {
    addToast, featureToggles, isResettingAll, refreshAdminData, reportRpcError, setFeatureToggles, 
    setIsResettingAll, stats, supabase, users,
  } = useAdmin();

  return (
    <div className="space-y-6">
      {/* Feature Toggles */}
      <div className="card-glass p-6 border-2 border-cyan-400/50">
        <h3 className="text-2xl font-heading font-bold text-cyan-300 mb-4">🎛️ Feature Toggles</h3>
        <p className="text-sm text-gray-400 mb-4">Enable or disable features across the platform. Note: These are client-side toggles stored in the admin's session. For persistent server-side toggles, store them in a database table.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Object.entries(featureToggles).map(([key, enabled]) => (
            <button
              key={key}
              onClick={() => setFeatureToggles(prev => ({ ...prev, [key]: !prev[key] }))}
              className={`flex items-center justify-between p-3 rounded-lg border-2 transition-all ${
                enabled
                  ? 'border-green-400 bg-green-500/10 hover:bg-green-500/20'
                  : 'border-red-400/50 bg-red-500/10 hover:bg-red-500/20'
              }`}
            >
              <span className="text-sm font-semibold text-white capitalize">{key.replace(/_/g, ' ')}</span>
              <span className={`text-lg ${enabled ? '🟢' : '🔴'}`}>{enabled ? '✅' : '❌'}</span>
            </button>
          ))}
        </div>
      </div>

      {/* System Operations */}
      <div className="card-glass p-6 border-2 border-amber-400/50">
        <h3 className="text-2xl font-heading font-bold text-amber-300 mb-4">🔧 System Operations</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button onClick={async () => {
            try {
              const affected = await CompetitionService.refillAllAp();
              addToast(`⚡ Refilled AP for ${affected} players`, 'success');
              await refreshAdminData();
            } catch (error) { reportRpcError('Failed:', error, 'Failed'); }
          }} className="bg-green-500/20 hover:bg-green-500/30 border-2 border-green-400 text-white font-semibold px-4 py-4 rounded-xl transition-all hover:shadow-[0_0_20px_rgba(34,197,94,0.5)]">
            ⚡ Refill AP for All Players
          </button>
          <button onClick={async () => {
            try {
              if (!confirm('Reset PvP Champions leaderboard?')) return;
              const affected = await CompetitionService.resetPvpWinsLeaderboard();
              addToast(`🏆 Cleared ${affected} PvP win records`, 'success');
              await refreshAdminData();
            } catch (error) { reportRpcError('Failed:', error, 'Failed'); }
          }} className="bg-purple-500/20 hover:bg-purple-500/30 border-2 border-purple-400 text-white font-semibold px-4 py-4 rounded-xl transition-all hover:shadow-[0_0_20px_rgba(168,85,247,0.5)]">
            🏆 Reset PvP Champions Leaderboard
          </button>
          <button onClick={async () => {
            try {
              // Purge expired announcements
              const { error } = await supabase.from('announcements').delete().lt('expires_at', new Date().toISOString()).not('expires_at', 'is', null);
              if (error) throw error;
              addToast('🧹 Expired announcements purged', 'success');
            } catch (error) { reportRpcError('Failed:', error, 'Failed to purge'); }
          }} className="bg-cyan-500/20 hover:bg-cyan-500/30 border-2 border-cyan-400 text-white font-semibold px-4 py-4 rounded-xl transition-all hover:shadow-[0_0_20px_rgba(6,182,212,0.5)]">
            🧹 Purge Expired Announcements
          </button>
          <button onClick={async () => {
            try {
              // Clear all quiz scores for this school (via RPC — school-scoped)
              if (!confirm('Clear ALL Cambridge test scores for your school? Students will need to retake tests.')) return;
              const { data, error } = await supabase.rpc('admin_bulk_delete_quiz_scores');
              if (error) throw error;
              const result = typeof data === 'string' ? JSON.parse(data) : data;
              if (result && result.success === false) throw new Error(result.error || 'Failed');
              addToast(`🗑️ ${result.deleted ?? 'All'} quiz scores cleared`, 'success');
            } catch (error) { reportRpcError('Failed:', error, 'Failed to clear scores'); }
          }} className="bg-orange-500/20 hover:bg-orange-500/30 border-2 border-orange-400 text-white font-semibold px-4 py-4 rounded-xl transition-all hover:shadow-[0_0_20px_rgba(249,115,22,0.5)]">
            🗑️ Clear All Quiz Scores
          </button>
        </div>
      </div>

      {/* Database Info */}
      <div className="card-glass p-6 border-2 border-indigo-400/50">
        <h3 className="text-2xl font-heading font-bold text-indigo-300 mb-4">🗄️ Database Quick Stats</h3>
        <button onClick={async () => {
          try {
            const tables = ['users', 'clans', 'clan_members', 'questions', 'competition_attempts', 'quiz_scores', 'announcements', 'schools', 'school_members'];
            const counts: Record<string, number> = {};
            for (const table of tables) {
              const { count, error } = await supabase.from(table).select('id', { head: true, count: 'exact' });
              counts[table] = error ? -1 : (count ?? 0);
            }
            const statsDiv = document.getElementById('db-stats-output');
            if (statsDiv) {
              statsDiv.innerHTML = Object.entries(counts).map(([t, c]) => 
                `<div class="flex justify-between items-center bg-black/30 border border-indigo-400/20 rounded-lg px-4 py-2"><span class="text-sm text-white font-semibold">${t}</span><span class="text-sm font-mono ${c < 0 ? 'text-red-400' : 'text-indigo-300'}">${c < 0 ? 'ERROR' : c.toLocaleString()} rows</span></div>`
              ).join('');
            }
            addToast('📊 Database stats loaded', 'success');
          } catch (error) { reportRpcError('Failed:', error, 'Failed to load DB stats'); }
        }} className="bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400 text-white px-4 py-2 rounded-lg font-semibold mb-4">
          📊 Load Database Stats
        </button>
        <div id="db-stats-output" className="space-y-2"></div>
      </div>

      {/* Danger Zone */}
      <div className="card-glass p-6 border-2 border-red-500">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-4xl">☠️</span>
          <div>
            <h3 className="text-2xl font-heading font-bold text-red-400">Danger Zone</h3>
            <p className="text-sm text-red-300/70">These actions are destructive and cannot be undone.</p>
          </div>
        </div>
        <div className="space-y-3">
          <button onClick={async () => {
            if (!confirm('⚠️ CRITICAL: This will wipe EVERY player\'s XP, level, AP, PvP stats/champions, tasks, inventory, clans, and activity feed. This cannot be undone.')) return;
            const typed = prompt('Type "DESTROY ALL PROGRESS" to confirm:');
            if (typed !== 'DESTROY ALL PROGRESS') { addToast('Cancelled — confirmation text did not match', 'info'); return; }
            try {
              setIsResettingAll(true);
              const affected = await CompetitionService.resetAllPlayerProgress();
              addToast(`☠️ System reset applied to ${affected} accounts`, 'success');
              await refreshAdminData();
            } catch (error) { reportRpcError('Failed:', error, 'Failed system reset'); }
            finally { setIsResettingAll(false); }
          }} disabled={isResettingAll} className={`w-full border-2 border-red-500 text-white font-bold px-4 py-4 rounded-xl transition-all ${isResettingAll ? 'bg-red-700/30 cursor-not-allowed' : 'bg-red-600/40 hover:bg-red-600/60 hover:shadow-[0_0_30px_rgba(239,68,68,0.8)]'}`}>
            {isResettingAll ? '⏳ Resetting Everything...' : '☠️ NUCLEAR RESET — Wipe All Player Progress'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SystemTab;
