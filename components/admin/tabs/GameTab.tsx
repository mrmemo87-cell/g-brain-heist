import React from 'react';
import { useAdmin } from '../AdminContext';
import * as CompetitionService from '../../../services/competitionService';

const GameTab: React.FC = () => {
  const {
    addToast, announcementsLoading, deleteAnnouncement, existingAnnouncements, fetchAnnouncements, 
    isResettingAll, refreshAdminData, reportRpcError, setIsResettingAll, 
    setShowAnnouncementComposer, supabase,
  } = useAdmin();

  return (
    <div className="space-y-6">
      <div className="card-glass p-6 border-2 border-green-400/50">
        <h3 className="text-3xl font-heading font-bold text-green-300 mb-6">🎮 Game Management</h3>

        {/* Bulk Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <button onClick={async () => {
            try {
              const affected = await CompetitionService.refillAllAp();
              addToast(`⚡ Refilled AP for ${affected} players`, 'success');
              await refreshAdminData();
            } catch (error) { reportRpcError('Failed to refill AP:', error, 'Failed to refill AP'); }
          }} className="bg-green-500/20 hover:bg-green-500/30 border-2 border-green-400 text-white px-4 py-4 rounded-xl font-semibold transition-all hover:shadow-[0_0_20px_rgba(34,197,94,0.5)]">
            ⚡ Refill AP for All Players
          </button>
          <button onClick={async () => {
            if (!confirm('Grant coins to ALL players? Enter amount in the next prompt.')) return;
            const amount = prompt('Enter coin amount to grant to all players:');
            if (!amount) return;
            try {
              const { data, error } = await supabase.rpc('rpc_admin_grant_all', { p_xp_delta: 0, p_coins_delta: parseInt(amount) || 0 });
              if (error) {
                // Fallback: just notify
                addToast('Bulk grant RPC not available. Use per-user grants instead.', 'error');
                return;
              }
              addToast(`💰 Granted ${amount} coins to all players`, 'success');
            } catch (error) { addToast('Bulk grant not available', 'error'); }
          }} className="bg-yellow-500/20 hover:bg-yellow-500/30 border-2 border-yellow-400 text-white px-4 py-4 rounded-xl font-semibold transition-all hover:shadow-[0_0_20px_rgba(234,179,8,0.5)]">
            💰 Bulk Grant Coins
          </button>
          <button onClick={async () => {
            if (!confirm('Grant XP to ALL players? Enter amount in the next prompt.')) return;
            const amount = prompt('Enter XP amount to grant to all players:');
            if (!amount) return;
            try {
              const { data, error } = await supabase.rpc('rpc_admin_grant_all', { p_xp_delta: parseInt(amount) || 0, p_coins_delta: 0 });
              if (error) {
                addToast('Bulk grant RPC not available. Use per-user grants instead.', 'error');
                return;
              }
              addToast(`⚡ Granted ${amount} XP to all players`, 'success');
            } catch (error) { addToast('Bulk grant not available', 'error'); }
          }} className="bg-blue-500/20 hover:bg-blue-500/30 border-2 border-blue-400 text-white px-4 py-4 rounded-xl font-semibold transition-all hover:shadow-[0_0_20px_rgba(59,130,246,0.5)]">
            ⚡ Bulk Grant XP
          </button>
          <button onClick={async () => {
            if (!confirm('Reset PvP Champions leaderboard? This removes all PvP win records.')) return;
            try {
              const affected = await CompetitionService.resetPvpWinsLeaderboard();
              addToast(`🏆 Cleared ${affected} PvP win records`, 'success');
            } catch (error) { reportRpcError('Failed to reset PvP:', error, 'Failed to reset PvP'); }
          }} className="bg-purple-500/20 hover:bg-purple-500/30 border-2 border-purple-400 text-white px-4 py-4 rounded-xl font-semibold transition-all hover:shadow-[0_0_20px_rgba(168,85,247,0.5)]">
            🏆 Reset PvP Leaderboard
          </button>
        </div>

        {/* Announcement Management */}
        <div className="border-t border-green-400/30 pt-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-xl font-heading font-bold text-green-200">📢 Announcements</h4>
            <div className="flex gap-2">
              <button onClick={() => setShowAnnouncementComposer(true)} className="bg-green-500/20 hover:bg-green-500/30 border border-green-400 text-white text-sm px-4 py-2 rounded-lg">
                ➕ New Announcement
              </button>
              <button onClick={fetchAnnouncements} disabled={announcementsLoading} className="bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400 text-white text-sm px-4 py-2 rounded-lg">
                {announcementsLoading ? '⏳' : '🔄'} Load
              </button>
            </div>
          </div>
          {existingAnnouncements.length > 0 ? (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {existingAnnouncements.map(a => (
                <div key={a.id} className="flex items-start justify-between bg-black/30 border border-green-400/20 rounded-lg p-3">
                  <div className="flex-1">
                    <p className="text-sm text-white">{a.text || a.message || a.content || JSON.stringify(a).substring(0, 100)}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {a.created_at && new Date(a.created_at).toLocaleString()}
                      {a.expires_at && ` • Expires: ${new Date(a.expires_at).toLocaleString()}`}
                    </p>
                  </div>
                  <button onClick={() => deleteAnnouncement(a.id)} className="text-red-400 hover:text-red-300 text-sm ml-2">🗑️</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Click "Load" to fetch existing announcements.</p>
          )}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="card-glass p-6 border-2 border-red-500/50">
        <h4 className="text-xl font-heading font-bold text-red-400 mb-4">⚠️ Danger Zone</h4>
        <button onClick={async () => {
          if (!confirm('⚠️ DANGER: Reset ALL player progress (XP, level, coins, inventory, etc.)? This CANNOT be undone!')) return;
          if (!confirm('Are you ABSOLUTELY sure? Type "RESET" in the next prompt to confirm.')) return;
          const typed = prompt('Type RESET to confirm:');
          if (typed !== 'RESET') { addToast('Cancelled — text did not match', 'info'); return; }
          try {
            setIsResettingAll(true);
            const affected = await CompetitionService.resetAllPlayerProgress();
            addToast(`🧨 Reset progress for ${affected} players`, 'success');
            await refreshAdminData();
          } catch (error) { reportRpcError('Failed to reset:', error, 'Failed to reset'); }
          finally { setIsResettingAll(false); }
        }} disabled={isResettingAll} className={`w-full border-2 border-red-500 text-white font-bold px-4 py-4 rounded-xl transition-all ${isResettingAll ? 'bg-red-600/20 cursor-not-allowed' : 'bg-red-600/30 hover:bg-red-600/50 hover:shadow-[0_0_30px_rgba(239,68,68,0.6)]'}`}>
          {isResettingAll ? '⏳ Resetting...' : '🧨 Reset ALL Player Progress'}
        </button>
      </div>
    </div>
  );
};

export default GameTab;
