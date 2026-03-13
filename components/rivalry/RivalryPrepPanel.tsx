import React from 'react';
import { RivalryDoctrine, RivalryRolePref } from '../../services/rivalryService';
import { doctrineAssetMap, rivalryAssets } from './rivalryAssets';
import RivalryImage from './RivalryImage';

interface RivalryMemberOption {
  user_id: string;
  username: string;
}

interface RosterMember {
  user_id: string;
  username: string;
  role_pref: RivalryRolePref;
  is_locked_in: boolean;
}

interface RivalryPrepPanelProps {
  mode: 'pending_response' | 'prep';
  canManage: boolean;
  memberOptions: RivalryMemberOption[];
  membersLoading: boolean;
  rosterMembers: RosterMember[];
  selectedDoctrine?: RivalryDoctrine | null;
  missionSummary: string;
  nextStepSummary: string;
  timerLabel: string;
  timerValue: string;
  myClanName: string;
  enemyClanName: string;
  onSetDoctrine: (doctrine: RivalryDoctrine) => void;
  onUpdateRoster: (memberUserId: string, role: RivalryRolePref, include: boolean) => Promise<void>;
  onLockRoster: () => void;
  onRespond: (response: 'accept' | 'decline') => void;
  busy: boolean;
}

const DOCTRINE_META: Record<RivalryDoctrine, { title: string; plus: string; minus: string; best: string; icon: string }> = {
  breach: { title: 'Breach', plus: 'More strike damage', minus: 'Less repair power', best: 'Best for aggressive clans', icon: '💥' },
  fortress: { title: 'Fortress', plus: 'Better defense and repair', minus: 'Lower sabotage pressure', best: 'Best for safe teams', icon: '🛡️' },
  disruption: { title: 'Disruption', plus: 'Stronger sabotage control', minus: 'Slightly less direct damage', best: 'Best for control play', icon: '🕸️' },
};

const RivalryPrepPanel: React.FC<RivalryPrepPanelProps> = ({
  mode,
  canManage,
  memberOptions,
  membersLoading,
  rosterMembers,
  selectedDoctrine,
  missionSummary,
  nextStepSummary,
  timerLabel,
  timerValue,
  myClanName,
  enemyClanName,
  onSetDoctrine,
  onUpdateRoster,
  onLockRoster,
  onRespond,
  busy,
}) => {
  const [selectedSlot, setSelectedSlot] = React.useState<number | null>(null);
  const [memberId, setMemberId] = React.useState('');
  const [role, setRole] = React.useState<RivalryRolePref>('striker');
  const minRequired = 5;
  const readyCount = rosterMembers.length;
  const needCount = Math.max(0, minRequired - readyCount);

  const slots = Array.from({ length: Math.max(minRequired, rosterMembers.length) }, (_, idx) => rosterMembers[idx] || null);
  const selectedMember = selectedSlot !== null ? slots[selectedSlot] : null;

  const handleSelectSlot = (idx: number) => {
    setSelectedSlot(idx);
    const slotMember = slots[idx];
    if (slotMember) {
      setMemberId(slotMember.user_id);
      setRole(slotMember.role_pref);
      return;
    }
    setMemberId('');
  };

  const handleFillSlot = async () => {
    if (selectedSlot === null || !memberId) return;
    await onUpdateRoster(memberId, role, true);
    setSelectedSlot(null);
    setMemberId('');
  };

  const handleRemoveFromSlot = async () => {
    if (selectedSlot === null) return;
    const selectedMemberId = slots[selectedSlot]?.user_id || memberId;
    if (!selectedMemberId) return;
    await onUpdateRoster(selectedMemberId, role, false);
    setSelectedSlot(null);
    setMemberId('');
  };

  const handleLockClick = () => {
    if (busy) return;
    if (!selectedDoctrine) return;
    if (!window.confirm('Lock in your squad now? This step cannot be undone during this war.')) return;
    onLockRoster();
  };

  if (!canManage) {
    return <div className="text-sm text-gray-300">Leadership controls are available to leader/officer/moderator only.</div>;
  }

  if (mode === 'pending_response') {
    return (
      <div className="space-y-3 rounded-xl border border-amber-400/30 bg-amber-900/20 p-3">
        <p className="text-sm text-amber-100">Incoming challenge from <span className="font-semibold">{enemyClanName}</span>. Accept to start squad setup.</p>
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={() => onRespond('accept')} className="rounded-lg px-3 py-2 text-xs bg-emerald-600/85 hover:bg-emerald-500 disabled:opacity-50 text-white">Accept Mission</button>
          <button disabled={busy} onClick={() => onRespond('decline')} className="rounded-lg px-3 py-2 text-xs bg-red-700/85 hover:bg-red-600 disabled:opacity-50 text-white">Decline Challenge</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-cyan-400/30 bg-cyan-950/30 p-3">
        <p className="text-xs uppercase tracking-wide text-cyan-200">Mission Summary</p>
        <p className="mt-1 text-sm text-white">{myClanName} vs {enemyClanName}</p>
        <p className="text-sm text-gray-200 mt-1">{missionSummary}</p>
        <p className="text-xs text-cyan-100 mt-2">{timerLabel}: <span className="font-semibold">{timerValue}</span></p>
        <p className="text-xs text-cyan-100">Next: {nextStepSummary}</p>
      </div>

      <div className="rounded-xl border border-white/15 bg-black/30 p-3 relative overflow-hidden">
        <RivalryImage src={rivalryAssets.backgrounds.prep} alt="squad atmosphere" className="absolute inset-0 h-full w-full object-cover opacity-15" lowPriority />
        <div className="absolute inset-0 bg-black/60" />
        <div className="relative">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-heading text-white">Squad Builder</h4>
          <span className="text-xs text-cyan-200">{readyCount} / {minRequired} squad ready</span>
        </div>
        <p className="text-xs text-gray-300 mb-3">{needCount > 0 ? `Need ${needCount} more members before lock-in.` : 'Squad requirement met. You can lock in.'}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {slots.map((member, idx) => (
            <button key={member?.user_id || `slot-${idx}`} type="button" onClick={() => handleSelectSlot(idx)} className={`rounded-lg border p-2 text-left transition-all duration-300 ${selectedSlot === idx ? 'border-cyan-400/60 bg-cyan-900/35 shadow-[0_0_20px_rgba(34,211,238,0.25)]' : 'border-white/10 bg-black/40 hover:border-cyan-300/40'}`}>
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-cyan-500/40 to-fuchsia-500/30 border border-white/20 flex items-center justify-center text-xs font-semibold">{member?.username?.slice(0, 1).toUpperCase() || '👤'}</div>
                <div>
                  <div className="text-sm text-white">{member?.username || 'Empty Slot'}</div>
                  <div className="text-[11px] text-gray-300">{member ? member.role_pref : 'Locked slot waiting for member'}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <select value={memberId} onChange={(e) => setMemberId(e.target.value)} className="flex-1 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm">
            <option value="">{membersLoading ? 'Loading members…' : 'Choose member username'}</option>
            {memberOptions.map((member) => (
              <option key={member.user_id} value={member.user_id}>{member.username}</option>
            ))}
          </select>
          <select value={role} onChange={(e) => setRole(e.target.value as RivalryRolePref)} className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm">
            <option value="striker">Striker</option>
            <option value="saboteur">Saboteur</option>
            <option value="engineer">Engineer</option>
          </select>
          <button disabled={busy || selectedSlot === null || !memberId} onClick={handleFillSlot} className="rounded-lg px-3 py-2 text-xs bg-cyan-600/80 hover:bg-cyan-500 disabled:opacity-50">Fill Slot</button>
          <button disabled={busy || selectedSlot === null || (!selectedMember && !memberId)} onClick={handleRemoveFromSlot} className="rounded-lg px-3 py-2 text-xs bg-slate-600/80 hover:bg-slate-500 disabled:opacity-50">Remove</button>
        </div>
        </div>
      </div>

      <div className="rounded-xl border border-fuchsia-400/25 bg-fuchsia-950/20 p-3">
        <h4 className="font-heading text-white mb-2">Pick Strategy</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {(Object.keys(DOCTRINE_META) as RivalryDoctrine[]).map((doc) => (
            <button key={doc} onClick={() => onSetDoctrine(doc)} disabled={busy} className={`rounded-lg border p-3 text-left relative overflow-hidden transition-all duration-300 ${selectedDoctrine === doc ? 'border-fuchsia-300/70 bg-fuchsia-900/35 shadow-[0_0_30px_rgba(217,70,239,0.25)] -translate-y-0.5' : 'border-white/15 bg-black/30 hover:border-fuchsia-300/35 hover:-translate-y-0.5'} disabled:opacity-50`}>
              <RivalryImage src={doctrineAssetMap[doc]} alt={DOCTRINE_META[doc].title} className="absolute inset-0 h-full w-full object-cover opacity-35" lowPriority />
              <div className="absolute inset-0 bg-black/60" />
              <div className="relative">
                <div className="text-xl">{DOCTRINE_META[doc].icon}</div>
                <p className="text-sm text-white font-semibold mt-1">{DOCTRINE_META[doc].title}</p>
                <p className="text-xs text-emerald-200 mt-1">+ {DOCTRINE_META[doc].plus}</p>
                <p className="text-xs text-amber-200">− {DOCTRINE_META[doc].minus}</p>
                <p className="text-xs text-gray-200 mt-1">{DOCTRINE_META[doc].best}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-amber-400/30 bg-amber-950/20 p-3">
        <h4 className="font-heading text-white">Lock-In Summary</h4>
        <p className="text-xs text-gray-200 mt-1">Squad selected: {readyCount} • Strategy: {selectedDoctrine ? DOCTRINE_META[selectedDoctrine].title : 'Not selected yet'}</p>
        <p className="text-xs text-gray-200">When both clans lock in, live war begins.</p>
        <button disabled={busy || readyCount < minRequired || !selectedDoctrine} onClick={handleLockClick} className="mt-3 rounded-lg px-4 py-2 bg-amber-500 hover:bg-amber-400 text-sm font-semibold text-slate-900 disabled:opacity-50">
          Lock In Squad
        </button>
      </div>
    </div>
  );
};

export default RivalryPrepPanel;
