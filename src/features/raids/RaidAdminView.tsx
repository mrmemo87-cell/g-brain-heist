import React, { useEffect, useState } from 'react';
import { Profile } from '../../../types';
import * as GameService from '../../../services/gameService';
import { RaidFinalizationResult, RaidParticipantState, RaidStatus } from './raidTypes';
import UserProfileModal from '../../../components/UserProfileModal';

interface RaidAdminViewProps {
  profile: Profile;
  onComplete: () => void;
  addToast?: (message: string, type?: 'info' | 'success' | 'error') => void;
}

const RaidAdminView: React.FC<RaidAdminViewProps> = ({ profile, onComplete, addToast }) => {
  const [raid, setRaid] = useState<RaidStatus | null>(null);
  const [bossId, setBossId] = useState('obsidian_sentinel');
  const [loading, setLoading] = useState(true);
  const [finalization, setFinalization] = useState<RaidFinalizationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  const loadRaid = async () => {
    setLoading(true);
    try {
      const current = await GameService.getActiveRaidStatus();
      setRaid(current);
    } catch (err) {
      console.error(err);
      addToast?.('Failed to fetch raid data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRaid();
  }, []);

  const handleSchedule = async () => {
    setBusy(true);
    try {
      const scheduled = await GameService.startRaidEncounter(bossId);
      setRaid(scheduled);
      addToast?.('Raid scheduled successfully', 'success');
    } catch (err) {
      console.error(err);
      addToast?.('Unable to schedule raid', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleFinalize = async () => {
    if (!raid) return;
    setBusy(true);
    try {
      const result = await GameService.finalizeRaidEncounter(raid.raidId, raid.participants);
      setFinalization(result);
      addToast?.('Raid finalized. Rewards queued.', 'success');
    } catch (err) {
      console.error(err);
      addToast?.('Failed to finalize raid', 'error');
    } finally {
      setBusy(false);
    }
  };

  const renderParticipant = (participant: RaidParticipantState) => (
    <li key={participant.userId} className="flex items-center justify-between text-sm text-slate-600">
      <span>{participant.username}</span>
      <span>{participant.damageDealt} dmg</span>
    </li>
  );

  return (
    <div className="space-y-6 bg-slate-50 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Raid Operations HQ</h2>
          <p className="text-sm text-slate-500">Coordinate live raids, energize competition, and track results in real time.</p>
          <p className="text-xs text-slate-400">
            Signed in as{' '}
            <button
              type="button"
              className="font-semibold text-slate-200 underline decoration-dotted underline-offset-4"
              onClick={() => setShowProfileModal(true)}
            >
              {profile.username}
            </button>
          </p>
        </div>
        <button className="rounded-md border border-slate-300 px-3 py-2 text-sm" onClick={onComplete}>
          Close
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold text-slate-500">Schedule the next assault</p>
        <div className="mt-3 flex flex-col gap-3 md:flex-row">
          <input
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={bossId}
            onChange={(event) => setBossId(event.target.value)}
            placeholder="Boss ID"
          />
          <button
            className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-40"
            onClick={handleSchedule}
            disabled={busy}
          >
            Launch Raid
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-500">Live raid telemetry</p>
          <button className="text-sm text-slate-500 underline" onClick={() => void loadRaid()}>
            Refresh
          </button>
        </div>
        {loading ? (
          <p className="mt-2 text-sm text-slate-500">Loading raid telemetry…</p>
        ) : raid ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-slate-600">Raid ID: {raid.raidId || 'pending assignment'}</p>
            <p className="text-sm text-slate-600">Status: {raid.status}</p>
            <div>
              <p className="text-sm font-semibold text-slate-500">Participants</p>
              {raid.participants.length === 0 ? (
                <p className="mt-1 text-sm text-slate-500">Roster is empty—prompt your class to get in the fight.</p>
              ) : (
                <ul className="mt-1 space-y-1">{raid.participants.map(renderParticipant)}</ul>
              )}
            </div>
            <button
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              onClick={handleFinalize}
              disabled={busy}
            >
              Finalize raid & allocate rewards
            </button>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">No raid is scheduled yet—queue one when your players are ready.</p>
        )}
      </div>

      {finalization && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="font-semibold text-emerald-700">Raid finalized—rewards in motion</p>
          {finalization.mvp && (
            <p className="text-sm text-emerald-700">MVP honors: {finalization.mvp.username}</p>
          )}
          <div className="mt-2">
            <p className="text-xs font-semibold uppercase text-emerald-700">Rewards</p>
            <ul className="mt-2 space-y-1 text-sm text-emerald-700">
              {finalization.rewards.map((reward) => (
                <li key={reward.userId}>
                  {reward.username}: {reward.totalXp} XP / {reward.totalCoins} coins {reward.isMvp && '(MVP bonus)'}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {showProfileModal && <UserProfileModal profile={profile} apValue={profile.ap_now} onClose={() => setShowProfileModal(false)} />}
    </div>
  );
};

export default RaidAdminView;
