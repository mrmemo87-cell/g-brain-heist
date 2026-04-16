import React from 'react';
import { useAdmin } from '../AdminContext';
import * as CompetitionService from '../../../services/competitionService';

const IGNORED_DETAIL_KEYS = new Set(['crest_url', 'description', 'name']);

const formatLabel = (key: string) => key.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());

const formatValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const formatMaybeDate = (value: unknown) => {
  if (typeof value !== 'string') return formatValue(value);
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
};

const ClansTab: React.FC = () => {
  const {
    addToast, clanEditDescription, clanEditName, clanList, clanMembers, clanMembersLoading,
    loadClanMembers, removeClanMember, reportRpcError, selectedClan, setClanEditDescription,
    setClanEditName, setClanList, setClanMembers, setSelectedClan, supabase,
    transferClanLeadership,
  } = useAdmin();

  return (
    <div className="space-y-6">
      <div className="card-glass p-6 border-2 border-blue-400/50">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-3xl font-heading font-bold text-blue-300">🛡️ Clan Management</h3>
          <button onClick={async () => {
            try {
              const { data, error } = await supabase.from('clans').select('*').order('name');
              if (error) throw error;
              setClanList(data || []);
              addToast(`Loaded ${data?.length ?? 0} clans`, 'success');
            } catch (error) { reportRpcError('Failed to load clans:', error, 'Failed to load clans'); }
          }} className="bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400 text-white px-4 py-2 rounded-lg font-semibold">
            🔄 Refresh Clans
          </button>
        </div>

        {clanList.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <p className="text-5xl mb-3">🛡️</p>
            <p>Click "Refresh Clans" to load all clans</p>
          </div>
        )}

        {clanList.length > 0 && (
          <div className="grid grid-cols-1 gap-4">
            {clanList.map(c => {
              const detailEntries = Object.entries(c || {}).filter(([key]) => !IGNORED_DETAIL_KEYS.has(key));

              return (
                <div key={c.id} className={`rounded-xl border-2 p-4 transition-all ${selectedClan?.id === c.id ? 'border-blue-400 bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.4)]' : 'border-gray-600 bg-black/30 hover:border-blue-400/50'}`}>
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex items-start gap-3">
                      {c.crest_url && <img src={c.crest_url} alt="" className="w-10 h-10 rounded-lg object-cover border border-blue-300/30" />}
                      <div>
                        <p className="font-bold text-white text-lg">{c.name}</p>
                        <p className="text-xs text-gray-400">{c.member_count ?? 0} members • Created {c.created_at ? new Date(c.created_at).toLocaleDateString() : 'N/A'}</p>
                        {c.description && <p className="text-xs text-gray-400 mt-1">{c.description}</p>}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => {
                        setSelectedClan(c);
                        setClanEditName(c.name || '');
                        setClanEditDescription(c.description || '');
                        loadClanMembers(c.id);
                      }} className="bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400 text-white text-xs px-3 py-1.5 rounded">
                        👁️ Manage
                      </button>
                      <button onClick={async () => {
                        if (!confirm(`Disband "${c.name}"? This permanently deletes the clan and all its data.`)) return;
                        try {
                          await CompetitionService.disbandClan(c.id);
                          addToast(`${c.name} disbanded`, 'success');
                          setClanList(prev => prev.filter(x => x.id !== c.id));
                          if (selectedClan?.id === c.id) setSelectedClan(null);
                        } catch (error) { reportRpcError('Failed to disband:', error, 'Failed to disband clan'); }
                      }} className="bg-red-500/20 hover:bg-red-500/30 border border-red-400 text-white text-xs px-3 py-1.5 rounded">
                        💣 Disband
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 rounded-lg border border-blue-400/20 bg-black/20 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-blue-200 mb-2">Full Clan Details</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 text-xs">
                      {detailEntries.map(([key, value]) => (
                        <div key={key} className="rounded border border-blue-400/15 bg-black/30 px-2 py-1.5">
                          <p className="text-[10px] uppercase tracking-wide text-gray-400">{formatLabel(key)}</p>
                          <p className="text-gray-100 break-all">{/(^|_)at$/i.test(key) ? formatMaybeDate(value) : formatValue(value)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected Clan Detail Panel */}
      {selectedClan && (
        <div className="card-glass p-6 border-2 border-blue-400/50">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-2xl font-heading font-bold text-blue-200">
              🛡️ {selectedClan.name} — Members
            </h4>
            <button onClick={() => { setSelectedClan(null); setClanMembers([]); }} className="text-gray-400 hover:text-white text-sm">✕ Close</button>
          </div>

          {/* Edit Clan Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Clan Name</label>
              <div className="flex gap-2">
                <input type="text" value={clanEditName} onChange={(e) => setClanEditName(e.target.value)} className="flex-1 bg-black/40 border border-blue-400/40 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-400" />
                <button onClick={async () => {
                  if (!clanEditName.trim()) return;
                  try {
                    const { error } = await supabase.from('clans').update({ name: clanEditName.trim() }).eq('id', selectedClan.id);
                    if (error) throw error;
                    addToast('Clan name updated', 'success');
                    setClanList(prev => prev.map(c => c.id === selectedClan.id ? { ...c, name: clanEditName.trim() } : c));
                    setSelectedClan((prev: any) => prev ? { ...prev, name: clanEditName.trim() } : prev);
                  } catch (error) { reportRpcError('Failed to update:', error, 'Failed'); }
                }} className="bg-blue-500/30 hover:bg-blue-500/50 border border-blue-400 text-white text-xs px-3 rounded">Save</button>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Description</label>
              <div className="flex gap-2">
                <input type="text" value={clanEditDescription} onChange={(e) => setClanEditDescription(e.target.value)} className="flex-1 bg-black/40 border border-blue-400/40 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-400" />
                <button onClick={async () => {
                  try {
                    const { error } = await supabase.from('clans').update({ description: clanEditDescription }).eq('id', selectedClan.id);
                    if (error) throw error;
                    addToast('Description updated', 'success');
                  } catch (error) { reportRpcError('Failed to update:', error, 'Failed'); }
                }} className="bg-blue-500/30 hover:bg-blue-500/50 border border-blue-400 text-white text-xs px-3 rounded">Save</button>
              </div>
            </div>
          </div>

          {clanMembersLoading ? (
            <div className="text-center py-6">
              <div className="inline-block animate-spin h-6 w-6 border-2 border-blue-400 border-t-transparent rounded-full"></div>
              <p className="text-sm text-gray-400 mt-2">Loading members...</p>
            </div>
          ) : clanMembers.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No members found.</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {clanMembers.map(m => {
                const memberInfo = m.users || {};
                return (
                  <div key={m.user_id} className="flex items-center justify-between bg-black/30 border border-blue-400/20 rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gray-700 overflow-hidden flex items-center justify-center">
                        {memberInfo.avatar_url ? <img src={memberInfo.avatar_url} className="w-full h-full object-cover" /> : <span>👤</span>}
                      </div>
                      <div>
                        <p className="font-semibold text-white">{memberInfo.username || memberInfo.email || m.user_id}</p>
                        <div className="flex gap-2 text-xs text-gray-400">
                          <span className={`px-1.5 py-0.5 rounded ${m.role === 'leader' ? 'bg-yellow-600/30 text-yellow-300' : 'bg-gray-600/30 text-gray-400'}`}>
                            {m.role === 'leader' ? '👑 Leader' : m.role || 'Member'}
                          </span>
                          {memberInfo.level && <span>Lvl {memberInfo.level}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {m.role !== 'leader' && (
                        <button onClick={() => transferClanLeadership(selectedClan.id, m.user_id, memberInfo.username || 'this member')} className="bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-400 text-white text-xs px-2.5 py-1 rounded">
                          👑 Make Leader
                        </button>
                      )}
                      <button onClick={() => removeClanMember(selectedClan.id, m.user_id, memberInfo.username || 'member')} className="bg-red-500/20 hover:bg-red-500/30 border border-red-400 text-white text-xs px-2.5 py-1 rounded">
                        ❌ Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ClansTab;
