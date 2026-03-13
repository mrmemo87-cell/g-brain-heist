import React from 'react';
import { RivalryDoctrine, RivalryRolePref } from '../../services/rivalryService';

interface RivalryMemberOption {
  user_id: string;
  username: string;
}

interface RivalryPrepPanelProps {
  mode: 'pending_response' | 'prep';
  canManage: boolean;
  memberOptions: RivalryMemberOption[];
  membersLoading: boolean;
  onSetDoctrine: (doctrine: RivalryDoctrine) => void;
  onUpdateRoster: (memberUserId: string, role: RivalryRolePref, include: boolean) => void;
  onLockRoster: () => void;
  onRespond: (response: 'accept' | 'decline') => void;
  busy: boolean;
}

const RivalryPrepPanel: React.FC<RivalryPrepPanelProps> = ({ mode, canManage, memberOptions, membersLoading, onSetDoctrine, onUpdateRoster, onLockRoster, onRespond, busy }) => {
  const [memberId, setMemberId] = React.useState('');
  const [role, setRole] = React.useState<RivalryRolePref>('striker');

  const handleLockClick = () => {
    if (busy) return;
    if (!window.confirm('Lock the roster now? This cannot be undone for this war phase.')) return;
    onLockRoster();
  };

  if (!canManage) {
    return <div className="text-sm text-gray-400">Leadership controls are available to leader/officer/moderator only.</div>;
  }

  if (mode === 'pending_response') {
    return (
      <div className="space-y-3 rounded-xl border border-amber-400/30 bg-amber-900/20 p-3 animate-pulse-glow">
        <p className="text-sm text-amber-100">Incoming challenge detected. Respond to continue.</p>
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={() => onRespond('accept')} className="rounded-lg px-3 py-2 text-xs bg-emerald-600/85 hover:bg-emerald-500 disabled:opacity-50 text-white transition-colors">Accept War</button>
          <button disabled={busy} onClick={() => onRespond('decline')} className="rounded-lg px-3 py-2 text-xs bg-red-700/85 hover:bg-red-600 disabled:opacity-50 text-white transition-colors">Decline War</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm text-gray-300 mb-2 uppercase tracking-wide">Doctrine</div>
        <div className="grid grid-cols-3 gap-2">
          {(['breach', 'fortress', 'disruption'] as RivalryDoctrine[]).map((doc) => (
            <button key={doc} onClick={() => onSetDoctrine(doc)} disabled={busy} className="rounded-lg border border-cyan-400/20 bg-cyan-950/25 px-3 py-2 text-xs uppercase tracking-wide text-cyan-100 hover:bg-cyan-900/30 hover:border-cyan-300/50 disabled:opacity-50 transition-all">
              {doc}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-white/10 p-3 bg-black/30 space-y-2">
        <div className="text-sm text-gray-300">Roster Management</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
            className="flex-1 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-cyan-400/50 transition-colors"
          >
            <option value="">{membersLoading ? 'Loading members…' : 'Select participating member username'}</option>
            {memberOptions.map((member) => (
              <option key={member.user_id} value={member.user_id}>{member.username}</option>
            ))}
          </select>
          <select value={role} onChange={(e) => setRole(e.target.value as RivalryRolePref)} className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-cyan-400/50 transition-colors">
            <option value="striker">striker</option>
            <option value="saboteur">saboteur</option>
            <option value="engineer">engineer</option>
          </select>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button disabled={busy || !memberId.trim()} onClick={() => onUpdateRoster(memberId.trim(), role, true)} className="rounded-lg px-3 py-2 text-xs bg-cyan-600/80 hover:bg-cyan-500 disabled:opacity-50 transition-colors">Add/Update</button>
          <button disabled={busy || !memberId.trim()} onClick={() => onUpdateRoster(memberId.trim(), role, false)} className="rounded-lg px-3 py-2 text-xs bg-slate-600/80 hover:bg-slate-500 disabled:opacity-50 transition-colors">Remove</button>
          <button disabled={busy} onClick={handleLockClick} className="rounded-lg px-3 py-2 text-xs bg-amber-600/85 hover:bg-amber-500 disabled:opacity-50 text-amber-50 transition-all hover:shadow-[0_0_14px_rgba(245,158,11,0.35)]">Lock Roster</button>
        </div>
      </div>
    </div>
  );
};

export default RivalryPrepPanel;
