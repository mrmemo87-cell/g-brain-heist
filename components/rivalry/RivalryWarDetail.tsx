import React from 'react';
import {
  RivalryActionType,
  RivalryClanMemberOption,
  RivalryDoctrine,
  RivalryLogEntry,
  RivalryRolePref,
  RivalryRpcResult,
  RivalryService,
  RivalryStructureCode,
  RivalryStructureState,
  RivalryWarStateResponse,
  subscribeToRivalryWarRealtime,
} from '../../services/rivalryService';
import RivalryPrepPanel from './RivalryPrepPanel';
import RivalryActionPanel from './RivalryActionPanel';
import RivalryLogsPanel from './RivalryLogsPanel';
import { RIVALRY_STRUCTURE_LABELS } from './rivalryLabels';

interface RivalryWarDetailProps {
  warId: string;
  myUserId: string;
  myClanId?: string | null;
  myClanRole?: string | null;
  addToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  service: RivalryService;
}

const isPrivileged = (role?: string | null): boolean => ['leader', 'officer', 'moderator'].includes(role || '');
type RivalryLogsCursor = { created_at: string; id: string } | null;

const fmtRemaining = (iso?: string | null): string => {
  if (!iso) return '—';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'ended';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
};

const normalizeActionFeedback = (actionType: RivalryActionType, result: RivalryRpcResult): string => {
  const grade = typeof result.result_grade === 'string' ? result.result_grade.toUpperCase() : 'SOLID';
  const damage = typeof result.damage === 'number' ? `DMG ${result.damage}` : null;
  const repair = typeof result.repair === 'number' ? `REP ${result.repair}` : null;
  const oe = typeof result.oe_after === 'number' ? `OE ${result.oe_after}` : null;
  return `${actionType.toUpperCase()} • ${[grade, damage, repair, oe].filter(Boolean).join(' • ')}`;
};

const phaseStep = (status: string): number => {
  if (status === 'pending_response') return 1;
  if (status === 'prep') return 2;
  if (status === 'lock_in' || status === 'locked') return 4;
  if (status === 'live') return 5;
  if (status === 'blackout') return 5;
  if (status === 'settled') return 6;
  return 6;
};

const phaseText = (status: string): string => {
  if (status === 'pending_response') return 'Challenge waiting for response';
  if (status === 'prep') return 'Squad setup phase';
  if (status === 'live') return 'Live war in progress';
  if (status === 'blackout') return 'Final phase: score hidden';
  if (status === 'settled') return 'Results are ready';
  if (status === 'declined') return 'Challenge declined';
  if (status === 'expired') return 'Challenge expired';
  if (status === 'canceled') return 'War canceled';
  return 'Mission status updated';
};

const RivalryWarDetail: React.FC<RivalryWarDetailProps> = ({ warId, myUserId, myClanId, myClanRole, addToast, service }) => {
  const [state, setState] = React.useState<RivalryWarStateResponse | null>(null);
  const [loadingState, setLoadingState] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [logs, setLogs] = React.useState<RivalryLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = React.useState(false);
  const [hasMoreLogs, setHasMoreLogs] = React.useState(true);
  const [, setLastCursor] = React.useState<RivalryLogsCursor>(null);
  const lastCursorRef = React.useRef<RivalryLogsCursor>(null);
  const [nowTick, setNowTick] = React.useState(Date.now());
  const [lastActionFeedback, setLastActionFeedback] = React.useState<string | null>(null);
  const [isLiveSyncConnected, setIsLiveSyncConnected] = React.useState(false);
  const [clanMemberOptions, setClanMemberOptions] = React.useState<RivalryClanMemberOption[]>([]);
  const [loadingClanMembers, setLoadingClanMembers] = React.useState(false);

  const updateLastCursor = React.useCallback((cursor: RivalryLogsCursor) => {
    lastCursorRef.current = cursor;
    setLastCursor(cursor);
  }, []);

  const loadState = React.useCallback(async () => {
    setLoadingState(true);
    try {
      setState(await service.getWarState(warId));
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Failed to load war state', 'error');
    } finally {
      setLoadingState(false);
    }
  }, [addToast, service, warId]);

  const loadLogs = React.useCallback(async (reset: boolean) => {
    setLoadingLogs(true);
    try {
      const before = reset ? null : lastCursorRef.current;
      const res = await service.getWarLogs(warId, 30, before);
      const next = res.logs || [];
      setLogs((prev) => (reset ? next : [...prev, ...next]));
      setHasMoreLogs(next.length >= 30);
      updateLastCursor(next.length ? { created_at: next[next.length - 1].created_at, id: next[next.length - 1].id } : (reset ? null : lastCursorRef.current));
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Failed to load logs', 'error');
    } finally {
      setLoadingLogs(false);
    }
  }, [addToast, service, updateLastCursor, warId]);

  React.useEffect(() => {
    void loadState();
    void loadLogs(true);
  }, [loadState, loadLogs]);

  const statusForRefresh = String(state?.war?.status || 'unknown');
  const realtimeEligible = statusForRefresh === 'live' || statusForRefresh === 'blackout' || statusForRefresh === 'prep';

  React.useEffect(() => {
    if (!realtimeEligible) return;
    const unsubscribe = subscribeToRivalryWarRealtime(
      warId,
      () => {
        void loadState();
        void loadLogs(true);
      },
      (status) => setIsLiveSyncConnected(status === 'SUBSCRIBED')
    );
    return unsubscribe;
  }, [loadLogs, loadState, realtimeEligible, warId]);

  React.useEffect(() => {
    const t = window.setInterval(() => {
      void loadState();
      setNowTick(Date.now());
    }, statusForRefresh === 'live' || statusForRefresh === 'blackout' ? 9000 : 18000);
    return () => window.clearInterval(t);
  }, [loadState, statusForRefresh]);

  const withBusy = async (op: () => Promise<RivalryRpcResult>, successText: string | ((result: RivalryRpcResult) => string)) => {
    setBusy(true);
    try {
      const result = await op();
      if (!result.success) throw new Error(typeof result.error === 'string' ? result.error : 'Action failed');
      const msg = typeof successText === 'function' ? successText(result) : successText;
      setLastActionFeedback(msg);
      addToast(msg, 'success');
      await Promise.all([loadState(), loadLogs(true)]);
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Rivalry action failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const war = state?.war || {};
  const status = String(war.status || 'unknown');
  const isParticipant = state?.scope === 'participant';
  const attackerClanId = (war.attacker_clan_id as string | undefined) || null;
  const defenderClanId = (war.defender_clan_id as string | undefined) || null;
  const attackerClanName = typeof war.attacker_clan_name === 'string' ? war.attacker_clan_name : 'Attacker Clan';
  const defenderClanName = typeof war.defender_clan_name === 'string' ? war.defender_clan_name : 'Defender Clan';
  const participantClanId = isParticipant
    ? (myClanId || (state?.rosters || []).find((r) => r.user_id === myUserId)?.clan_id || null)
    : null;
  const myClanName = participantClanId === attackerClanId ? attackerClanName : defenderClanName;
  const enemyClanName = participantClanId === attackerClanId ? defenderClanName : attackerClanName;
  const enemyClanId = participantClanId && attackerClanId && defenderClanId ? (participantClanId === attackerClanId ? defenderClanId : attackerClanId) : null;

  const myRoster = (state?.rosters || []).find((r) => r.user_id === myUserId);
  const canManagePrep = Boolean(isParticipant && isPrivileged(myClanRole));

  React.useEffect(() => {
    if (!participantClanId) {
      setClanMemberOptions([]);
      return;
    }
    setLoadingClanMembers(true);
    service.listClanMembers(participantClanId).then(setClanMemberOptions).catch(() => setClanMemberOptions([])).finally(() => setLoadingClanMembers(false));
  }, [participantClanId, service]);

  const actorNamesById = React.useMemo(() => {
    const map: Record<string, string> = {};
    clanMemberOptions.forEach((m) => { map[m.user_id] = m.username; });
    return map;
  }, [clanMemberOptions]);

  const ownStructures = isParticipant ? (state?.structures || []).filter((s) => s.owner_clan_id === participantClanId) : [];
  const enemyStructures = isParticipant ? (state?.structures || []).filter((s) => s.owner_clan_id !== participantClanId) : [];
  const rosterMembers = (state?.rosters || [])
    .filter((r) => r.clan_id === participantClanId)
    .map((r) => ({ user_id: r.user_id, username: actorNamesById[r.user_id] || 'Squad Member', role_pref: r.role_pref, is_locked_in: r.is_locked_in }));

  const selectedDoctrine = typeof war.attacker_doctrine === 'string' && participantClanId === attackerClanId
    ? war.attacker_doctrine as RivalryDoctrine
    : typeof war.defender_doctrine === 'string' && participantClanId === defenderClanId
      ? war.defender_doctrine as RivalryDoctrine
      : null;

  let timerLabel = 'Timer';
  let timerValue = '—';
  if (status === 'pending_response') {
    timerLabel = 'Challenge ends in';
    timerValue = fmtRemaining((war.challenge_expires_at as string | null) || null);
  } else if (status === 'prep') {
    timerLabel = 'Prep ends in';
    timerValue = fmtRemaining((war.prep_ends_at as string | null) || null);
  } else if (status === 'live' || status === 'blackout') {
    timerLabel = 'War ends in';
    timerValue = fmtRemaining((war.live_ends_at as string | null) || null);
  }

  if (loadingState && !state) return <div className="card-glass p-6 text-gray-300">Loading war state…</div>;

  return (
    <div className="space-y-4 animate-fade-in-up" data-now={nowTick}>
      <div className="card-glass p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-xl text-white">{attackerClanName} <span className="text-red-300">⚔</span> {defenderClanName}</h2>
          <span className="rounded-full px-3 py-1 text-xs border border-cyan-400/40 bg-cyan-900/20 text-cyan-100">{phaseText(status)}</span>
        </div>
        <div className="mt-2 text-xs text-gray-300">{timerLabel}: <span className="font-semibold text-white">{timerValue}</span> {realtimeEligible && isLiveSyncConnected ? '• Live sync on' : ''}</div>
        {lastActionFeedback ? <div className="mt-2 inline-flex rounded-md border border-cyan-400/40 bg-cyan-900/20 px-2 py-1 text-xs text-cyan-100">LAST ACTION • {lastActionFeedback}</div> : null}
      </div>

      <div className="card-glass p-4">
        <p className="text-xs uppercase tracking-wide text-gray-400 mb-2">Mission Progress</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          {['Challenge', 'Squad', 'Strategy', 'Lock In', 'Live War', 'Results'].map((step, idx) => {
            const i = idx + 1;
            const done = i < phaseStep(status);
            const active = i === phaseStep(status);
            return <div key={step} className={`rounded-lg px-2 py-2 text-xs text-center border ${active ? 'border-cyan-300/70 bg-cyan-900/30 text-cyan-100' : done ? 'border-emerald-400/40 bg-emerald-900/20 text-emerald-100' : 'border-white/10 bg-black/20 text-gray-400'}`}>{step}</div>;
          })}
        </div>
      </div>

      {!isParticipant ? <div className="card-glass p-4 text-sm text-gray-300">Public viewer mode. Participant controls are hidden.</div> : status === 'settled' ? <div className="card-glass p-4 text-sm text-emerald-100">Results are ready for your war.</div> : <div className="card-glass p-4 text-sm text-cyan-100">You are part of this war.</div>}

      {isParticipant && status === 'pending_response' ? (
        <div className="card-glass p-4">
          <RivalryPrepPanel
            mode="pending_response"
            canManage={canManagePrep}
            memberOptions={clanMemberOptions}
            membersLoading={loadingClanMembers}
            rosterMembers={rosterMembers}
            selectedDoctrine={selectedDoctrine}
            missionSummary="Respond to the challenge to unlock squad setup."
            nextStepSummary="Squad and strategy setup"
            timerLabel={timerLabel}
            timerValue={timerValue}
            myClanName={myClanName}
            enemyClanName={enemyClanName}
            busy={busy}
            onRespond={(response) => withBusy(() => service.respondWar(warId, response), response === 'accept' ? 'Challenge accepted' : 'Challenge declined')}
            onSetDoctrine={() => Promise.resolve()}
            onUpdateRoster={() => Promise.resolve()}
            onLockRoster={() => Promise.resolve()}
          />
        </div>
      ) : null}

      {isParticipant && status === 'prep' ? (
        <div className="card-glass p-4">
          <RivalryPrepPanel
            mode="prep"
            canManage={canManagePrep}
            memberOptions={clanMemberOptions}
            membersLoading={loadingClanMembers}
            rosterMembers={rosterMembers}
            selectedDoctrine={selectedDoctrine}
            missionSummary="Choose your squad and strategy before the timer ends."
            nextStepSummary="When both clans lock in, the war begins."
            timerLabel={timerLabel}
            timerValue={timerValue}
            myClanName={myClanName}
            enemyClanName={enemyClanName}
            busy={busy}
            onRespond={() => Promise.resolve()}
            onSetDoctrine={(doctrine) => void withBusy(() => service.setDoctrine(warId, doctrine), 'Strategy updated')}
            onUpdateRoster={(memberUserId: string, role: RivalryRolePref, include: boolean) => withBusy(() => service.updateRosterMember(warId, memberUserId, role, include), include ? 'Squad updated' : 'Member removed')}
            onLockRoster={() => void withBusy(() => service.lockRoster(warId), 'Your squad is locked')}
          />
        </div>
      ) : null}

      {isParticipant && (status === 'live' || status === 'blackout') && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 card-glass p-4 border border-red-500/25">
            <h3 className="font-heading text-white mb-2">Live Battle Board</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[{ title: 'Your Clan Structures', items: ownStructures, helper: 'Protect these to keep your side strong.' }, { title: 'Enemy Structures', items: enemyStructures, helper: 'Damaging these earns major points.' }].map((group) => (
                <div key={group.title} className="rounded-xl border border-white/10 bg-black/25 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-300">{group.title}</p>
                  <p className="text-[11px] text-gray-400 mb-2">{group.helper}</p>
                  <div className="space-y-2">
                    {group.items.map((s: RivalryStructureState) => {
                      const pct = Math.max(0, Math.min(100, Math.round((s.current_integrity / Math.max(1, s.max_integrity)) * 100)));
                      const stateLabel = s.state_band === 'down' ? 'Down' : s.state_band === 'critical' ? 'Critical' : s.state_band === 'strained' ? 'Strained' : 'Healthy';
                      return (
                        <div key={`${s.owner_clan_id}-${s.structure_code}`} className="rounded-lg border border-white/10 p-2">
                          <div className="flex justify-between text-sm"><span>{RIVALRY_STRUCTURE_LABELS[s.structure_code as RivalryStructureCode] || 'Structure'}</span><span className="text-xs text-gray-300">{stateLabel}</span></div>
                          <div className="mt-1 h-2.5 w-full rounded bg-black/50 overflow-hidden"><div className={`h-full transition-all duration-500 ${pct < 20 ? 'bg-red-500' : pct < 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} /></div>
                          <div className="text-xs text-gray-300 mt-1">{pct}% integrity</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="card-glass p-4 border border-cyan-400/20">
            <h3 className="font-heading text-white mb-2">Action Console</h3>
            <RivalryActionPanel
              isParticipant={Boolean(isParticipant)}
              isRostered={Boolean(myRoster?.is_locked_in)}
              status={status}
              enemyClanId={enemyClanId}
              ownClanId={participantClanId || null}
              blackout={Boolean(state?.score?.blackout)}
              busy={busy}
              cooldownUntil={state?.member_state?.cooldown_until ?? null}
              onSubmit={(actionType: RivalryActionType, targetClanId: string, target: RivalryStructureCode) => {
                void withBusy(() => service.submitAction(warId, actionType, targetClanId, target), (result) => normalizeActionFeedback(actionType, result));
              }}
            />
          </div>
        </div>
      )}

      {(status === 'live' || status === 'blackout') && !isParticipant ? (
        <div className="card-glass p-4 text-sm text-gray-300">Public viewer mode. Participant battle controls are hidden.</div>
      ) : null}

      {status === 'settled' && (
        <div className="card-glass p-4 space-y-2 border border-emerald-400/30">
          <h3 className="font-heading text-emerald-100">Results Recap</h3>
          <p className="text-sm text-gray-200">Winner: {war.winner_clan_id == null
            ? 'No winner declared'
            : war.winner_clan_id === attackerClanId
              ? attackerClanName
              : war.winner_clan_id === defenderClanId
                ? defenderClanName
                : 'Unknown winner'}</p>
          <p className="text-xs text-gray-300">Thanks for participating. Your actions helped your clan during the mission.</p>
          {isParticipant ? <button onClick={() => void withBusy(() => service.claimReward(warId), 'Reward claim completed')} disabled={busy} className="rounded-lg px-4 py-2 bg-emerald-600/85 hover:bg-emerald-500 disabled:opacity-50 text-white">Claim Reward</button> : <p className="text-sm text-gray-400">Public viewer mode: rewards are for participants only.</p>}
        </div>
      )}

      {(status === 'expired' || status === 'declined' || status === 'canceled') ? <div className="card-glass p-4 text-sm text-gray-300">This mission is closed: {phaseText(status)}.</div> : null}

      <RivalryLogsPanel logs={logs} loading={loadingLogs} hasMore={hasMoreLogs} onLoadMore={() => void loadLogs(false)} actorNamesById={actorNamesById} viewerClanId={participantClanId} />
    </div>
  );
};

export default RivalryWarDetail;
