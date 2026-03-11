import React from 'react';
import {
  RivalryActionType,
  RivalryDoctrine,
  RivalryLogEntry,
  RivalryRolePref,
  RivalryRpcResult,
  RivalryService,
  RivalryStructureCode,
  RivalryStructureState,
  RivalryWarStateResponse,
} from '../../services/rivalryService';
import RivalryPrepPanel from './RivalryPrepPanel';
import RivalryActionPanel from './RivalryActionPanel';
import RivalryLogsPanel from './RivalryLogsPanel';

interface RivalryWarDetailProps {
  warId: string;
  myUserId: string;
  myClanId?: string | null;
  myClanRole?: string | null;
  addToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  service: RivalryService;
}

const isPrivileged = (role?: string | null): boolean => ['leader', 'officer', 'moderator'].includes(role || '');

const fmtRemaining = (iso?: string | null): string => {
  if (!iso) return '—';
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return '—';
  if (ms <= 0) return 'ended';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
};

const phaseColor = (status: string): string => {
  if (status === 'pending_response') return 'text-amber-300 border-amber-400/40 bg-amber-900/20';
  if (status === 'prep') return 'text-cyan-300 border-cyan-400/40 bg-cyan-900/20';
  if (status === 'live') return 'text-red-300 border-red-400/40 bg-red-900/20';
  if (status === 'blackout') return 'text-fuchsia-200 border-fuchsia-400/40 bg-fuchsia-900/35';
  if (status === 'settled') return 'text-emerald-300 border-emerald-400/40 bg-emerald-900/20';
  return 'text-slate-300 border-slate-500/40 bg-slate-900/20';
};

const bandClass = (band: string): string => {
  if (band === 'healthy') return 'border-emerald-400/40 bg-emerald-900/20';
  if (band === 'strained') return 'border-amber-400/40 bg-amber-900/20';
  if (band === 'critical') return 'border-orange-400/40 bg-orange-900/25';
  if (band === 'down') return 'border-red-400/50 bg-red-900/30';
  return 'border-white/10 bg-black/20';
};

const normalizeActionFeedback = (actionType: RivalryActionType, result: RivalryRpcResult): string => {
  const grade = typeof result.result_grade === 'string' ? result.result_grade.toUpperCase() : 'OK';
  const damage = typeof result.damage === 'number' ? `DMG ${result.damage}` : null;
  const repair = typeof result.repair === 'number' ? `REP ${result.repair}` : null;
  const oe = typeof result.oe_after === 'number' ? `OE ${result.oe_after}` : null;
  const parts = [grade, damage, repair, oe].filter(Boolean);
  return `${actionType.toUpperCase()} • ${parts.join(' • ')}`;
};

const RivalryWarDetail: React.FC<RivalryWarDetailProps> = ({ warId, myUserId, myClanId, myClanRole, addToast, service }) => {
  const [state, setState] = React.useState<RivalryWarStateResponse | null>(null);
  const [loadingState, setLoadingState] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [logs, setLogs] = React.useState<RivalryLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = React.useState(false);
  const [hasMoreLogs, setHasMoreLogs] = React.useState(true);
  const [lastCursor, setLastCursor] = React.useState<string | null>(null);
  const [nowTick, setNowTick] = React.useState<number>(Date.now());

  const loadState = React.useCallback(async () => {
    setLoadingState(true);
    try {
      const next = await service.getWarState(warId);
      setState(next);
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Failed to load war state', 'error');
    } finally {
      setLoadingState(false);
    }
  }, [service, warId, addToast]);

  const loadLogs = React.useCallback(async (reset: boolean) => {
    setLoadingLogs(true);
    try {
      const before = reset ? null : lastCursor;
      const res = await service.getWarLogs(warId, 30, before);
      const next = res.logs || [];
      setLogs((prev) => (reset ? next : [...prev, ...next]));
      setHasMoreLogs(next.length >= 30);
      setLastCursor(next.length ? next[next.length - 1].created_at : (reset ? null : lastCursor));
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Failed to load logs', 'error');
    } finally {
      setLoadingLogs(false);
    }
  }, [service, warId, addToast, lastCursor]);

  React.useEffect(() => {
    void loadState();
    void loadLogs(true);
  }, [loadState, loadLogs]);

  const statusForRefresh = String(state?.war?.status || 'unknown');
  React.useEffect(() => {
    const refreshMs = statusForRefresh === 'live' || statusForRefresh === 'blackout' ? 9000 : 20000;
    const t = window.setInterval(() => {
      void loadState();
      setNowTick(Date.now());
    }, refreshMs);
    return () => window.clearInterval(t);
  }, [loadState, statusForRefresh]);

  const withBusy = async (op: () => Promise<RivalryRpcResult>, successText: string | ((result: RivalryRpcResult) => string)) => {
    setBusy(true);
    try {
      const result = await op();
      if (!result.success) {
        throw new Error(typeof result.error === 'string' ? result.error : 'Action failed');
      }
      const msg = typeof successText === 'function' ? successText(result) : successText;
      addToast(msg, 'success');
      setLastCursor(null);
      await Promise.all([loadState(), loadLogs(true)]);
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Rivalry action failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const war = state?.war || {};
  const status = String(war.status || 'unknown');
  const attackerClanId = (war.attacker_clan_id as string | undefined) || null;
  const defenderClanId = (war.defender_clan_id as string | undefined) || null;
  const isParticipant = state?.scope === 'participant';
  const derivedClanId = myClanId || (state?.rosters || []).find((r) => r.user_id === myUserId)?.clan_id || null;
  const enemyClanId = derivedClanId && attackerClanId && defenderClanId
    ? (derivedClanId === attackerClanId ? defenderClanId : attackerClanId)
    : null;

  const myRoster = (state?.rosters || []).find((r) => r.user_id === myUserId);
  const canManagePrep = Boolean(isParticipant && isPrivileged(myClanRole));

  const ownStructures = (state?.structures || []).filter((s) => s.owner_clan_id === derivedClanId);
  const enemyStructures = (state?.structures || []).filter((s) => s.owner_clan_id !== derivedClanId);
  const structureGroups: { title: string; items: RivalryStructureState[] }[] = isParticipant
    ? [
      { title: 'Your Clan Structures', items: ownStructures },
      { title: 'Enemy Structures', items: enemyStructures },
    ]
    : [{ title: 'War Structures', items: state?.structures || [] }];

  let timerLabel = 'Status';
  let timerValue = '—';
  if (status === 'pending_response') {
    timerLabel = 'Challenge expires in';
    timerValue = fmtRemaining((war.challenge_expires_at as string | null) || null);
  } else if (status === 'prep') {
    timerLabel = 'Prep ends in';
    timerValue = fmtRemaining((war.prep_ends_at as string | null) || null);
  } else if (status === 'live' || status === 'blackout') {
    timerLabel = 'War ends in';
    timerValue = fmtRemaining((war.live_ends_at as string | null) || null);
  }

  if (loadingState && !state) {
    return <div className="card-glass p-6 text-gray-300">Loading war state…</div>;
  }

  return (
    <div className="space-y-4" data-now={nowTick}>
      <div className="card-glass p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-xl text-white">War #{warId.slice(0, 8)}</h2>
          <span className={`rounded-full px-3 py-1 text-xs uppercase border ${phaseColor(status)}`}>{status}</span>
        </div>
        <div className="mt-2 text-sm text-gray-300">
          {attackerClanId?.slice(0, 8)} vs {defenderClanId?.slice(0, 8)}
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-white/10 bg-black/20 p-2 text-gray-300">{timerLabel}: <span className="text-white font-semibold">{timerValue}</span></div>
          <div className={`rounded-lg border p-2 ${status === 'blackout' ? 'border-fuchsia-500/40 bg-fuchsia-900/25 text-fuchsia-100' : 'border-white/10 bg-black/20 text-gray-300'}`}>
            {status === 'blackout' ? 'Blackout active: score visibility suppressed.' : 'Normal visibility window.'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-glass p-4">
          <h3 className="font-heading text-white mb-2">Score</h3>
          <div className="text-sm text-gray-300">Attacker: {state?.score?.attacker_visible ?? (state?.score?.blackout ? 'Hidden' : '—')}</div>
          <div className="text-sm text-gray-300">Defender: {state?.score?.defender_visible ?? (state?.score?.blackout ? 'Hidden' : '—')}</div>
          {state?.score?.blackout && <div className="text-xs text-fuchsia-300 mt-2">Blackout phase active.</div>}
          {isParticipant && myRoster && (
            <div className="mt-2 inline-flex rounded-full border border-cyan-400/40 bg-cyan-900/20 px-2 py-0.5 text-xs text-cyan-100">
              You: {myRoster.role_pref} • {myRoster.is_locked_in ? 'Roster locked' : 'Not locked'}
            </div>
          )}
        </div>

        <div className="card-glass p-4">
          <h3 className="font-heading text-white mb-2">Structures</h3>
          <div className="space-y-3">
            {structureGroups.map((group) => (
              <div key={group.title}>
                <p className="text-xs uppercase text-gray-400 mb-1">{group.title}</p>
                <div className="space-y-2">
                  {group.items.map((s) => {
                    const pct = Math.max(0, Math.min(100, Math.round((s.current_integrity / Math.max(1, s.max_integrity)) * 100)));
                    return (
                      <div key={`${s.owner_clan_id}-${s.structure_code}`} className={`rounded-lg border px-3 py-2 text-sm ${bandClass(s.state_band)}`}>
                        <div className="flex justify-between">
                          <span>{s.structure_code}</span>
                          <span className="uppercase text-xs">{s.state_band}</span>
                        </div>
                        <div className="mt-1 h-2 w-full rounded bg-black/40 overflow-hidden">
                          <div className="h-2 bg-cyan-400/80" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="text-xs text-gray-300 mt-1">{s.current_integrity}/{s.max_integrity} ({pct}%)</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {isParticipant && status === 'pending_response' && (
        <div className="card-glass p-4">
          <h3 className="font-heading text-white mb-2">Challenge Response</h3>
          <RivalryPrepPanel
            mode="pending_response"
            canManage={canManagePrep}
            busy={busy}
            onRespond={(response) => withBusy(() => service.respondWar(warId, response), `War ${response}ed`)}
            onSetDoctrine={() => Promise.resolve()}
            onUpdateRoster={() => Promise.resolve()}
            onLockRoster={() => Promise.resolve()}
          />
        </div>
      )}

      {isParticipant && status === 'prep' && (
        <div className="card-glass p-4">
          <h3 className="font-heading text-white mb-2">Prep Console</h3>
          <RivalryPrepPanel
            mode="prep"
            canManage={canManagePrep}
            busy={busy}
            onRespond={() => Promise.resolve()}
            onSetDoctrine={(doctrine: RivalryDoctrine) => void withBusy(() => service.setDoctrine(warId, doctrine), 'Doctrine updated')}
            onUpdateRoster={(memberUserId: string, role: RivalryRolePref, include: boolean) =>
              void withBusy(() => service.updateRosterMember(warId, memberUserId, role, include), include ? 'Roster updated' : 'Roster member removed')
            }
            onLockRoster={() => void withBusy(() => service.lockRoster(warId), 'Roster locked')}
          />
        </div>
      )}

      {status === 'live' || status === 'blackout' ? (
        <div className="card-glass p-4">
          <h3 className="font-heading text-white mb-2">Action Console</h3>
          <RivalryActionPanel
            isParticipant={Boolean(isParticipant)}
            isRostered={Boolean(myRoster?.is_locked_in)}
            status={status}
            enemyClanId={enemyClanId}
            ownClanId={derivedClanId || null}
            blackout={Boolean(state?.score?.blackout)}
            busy={busy}
            cooldownUntil={state?.member_state?.cooldown_until ?? null}
            onSubmit={(actionType: RivalryActionType, targetClanId: string, target: RivalryStructureCode) => {
              void withBusy(
                () => service.submitAction(warId, actionType, targetClanId, target),
(result) => normalizeActionFeedback(actionType, result)
              );
            }}
          />
        </div>
      ) : null}

      {status === 'settled' && (
        <div className="card-glass p-4 space-y-2">
          <p className="text-sm text-emerald-200">War settled. Claim your participation reward if eligible.</p>
          {isParticipant ? (
            <button
              onClick={() => void withBusy(() => service.claimReward(warId), 'Reward claim completed')}
              disabled={busy}
              className="rounded-lg px-4 py-2 bg-emerald-600/80 hover:bg-emerald-500 disabled:opacity-50"
            >
              Claim War Reward
            </button>
          ) : (
            <p className="text-sm text-gray-400">Public viewer mode: reward actions are hidden.</p>
          )}
        </div>
      )}

      {(status === 'expired' || status === 'declined' || status === 'canceled') && (
        <div className="card-glass p-4 text-sm text-gray-300">
          This war ended in <span className="font-semibold uppercase">{status}</span>. No further actions are available.
        </div>
      )}

      <RivalryLogsPanel logs={logs} loading={loadingLogs} hasMore={hasMoreLogs} onLoadMore={() => void loadLogs(false)} />
    </div>
  );
};

export default RivalryWarDetail;
