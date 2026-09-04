import React, { useEffect, useMemo, useState } from 'react';
import {
  fetchSuperadminUserIntelligence,
  type IntelligenceWarning,
  type SuperadminUserIntelligence,
} from '../../../services/superadminUserIntelligenceService';

type IntelligenceTab = 'overview' | 'activity' | 'access';

interface UserIntelligencePanelProps {
  userId: string;
}

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
};

const formatNumber = (value?: number | null) => Number(value ?? 0).toLocaleString();

const DataRow: React.FC<{ label: string; value: React.ReactNode; mono?: boolean; title?: string }> = ({ label, value, mono, title }) => (
  <div className="flex items-start justify-between gap-4 border-b border-slate-800/60 py-2.5 last:border-b-0">
    <span className="shrink-0 text-[11px] text-slate-500">{label}</span>
    <span className={`min-w-0 break-words text-right text-[11px] font-medium text-slate-200 ${mono ? 'font-mono text-[10px]' : ''}`} title={title}>
      {value ?? '—'}
    </span>
  </div>
);

const MetricCard: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode }> = ({ label, value, hint }) => (
  <div className="rounded-xl border border-slate-800 bg-slate-950/35 p-3">
    <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-600">{label}</p>
    <p className="mt-1.5 text-base font-black text-slate-100">{value}</p>
    {hint ? <p className="mt-1 text-[10px] leading-4 text-slate-500">{hint}</p> : null}
  </div>
);

const StatePill: React.FC<{ active: boolean; onLabel: string; offLabel: string; warning?: boolean }> = ({ active, onLabel, offLabel, warning }) => {
  const activeClass = warning
    ? 'border-amber-400/20 bg-amber-400/10 text-amber-200'
    : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200';
  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold ${active ? activeClass : 'border-slate-700 bg-slate-900/70 text-slate-500'}`}>
      {active ? onLabel : offLabel}
    </span>
  );
};

const warningClass = (warning: IntelligenceWarning) => {
  if (warning.severity === 'critical') return 'border-rose-400/25 bg-rose-400/[0.07] text-rose-100';
  if (warning.severity === 'warning') return 'border-amber-400/25 bg-amber-400/[0.07] text-amber-100';
  return 'border-cyan-400/20 bg-cyan-400/[0.055] text-cyan-100';
};

const UserIntelligencePanel: React.FC<UserIntelligencePanelProps> = ({ userId }) => {
  const [data, setData] = useState<SuperadminUserIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<IntelligenceTab>('overview');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setData(null);
    setTab('overview');

    void fetchSuperadminUserIntelligence(userId)
      .then((snapshot) => {
        if (active) setData(snapshot);
      })
      .catch((err: any) => {
        if (active) setError(err?.message || 'Unable to load user intelligence.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [userId, refreshKey]);

  const derived = useMemo(() => {
    if (!data) return null;
    const ieltsAttempts = Object.values(data.ielts.attempts).reduce((sum, value) => sum + Number(value || 0), 0);
    const questionAttempts = data.activity.question_attempts.total + data.activity.brains_heist_attempts.total;
    const correctAttempts = data.activity.question_attempts.correct + data.activity.brains_heist_attempts.correct;
    const accuracy = questionAttempts > 0 ? Math.round((correctAttempts / questionAttempts) * 100) : null;
    const hasFormalSchool = data.placement.school_memberships.some((membership) => membership.status === 'active');
    const hasProductActivity = questionAttempts
      + data.activity.assignments.assigned
      + data.activity.cambridge_quizzes.attempts
      + data.activity.quests.runs
      + data.activity.raids.participations
      + ieltsAttempts
      + data.writing_hub.assessments > 0;
    return { ieltsAttempts, questionAttempts, correctAttempts, accuracy, hasFormalSchool, hasProductActivity };
  }, [data]);

  return (
    <div className="rounded-xl border border-cyan-400/15 bg-gradient-to-b from-cyan-400/[0.045] to-slate-950/20">
      <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 px-3 py-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-300">Account intelligence</p>
            {!loading && !error && <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.1em] text-emerald-300">Live</span>}
          </div>
          <p className="mt-1 text-[10px] text-slate-600">Identity, integrity, usage and access signals</p>
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((value) => value + 1)}
          disabled={loading}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-slate-700 text-slate-500 transition hover:bg-slate-800 hover:text-cyan-200 disabled:opacity-40"
          aria-label="Refresh user intelligence"
          title="Refresh intelligence"
        >
          <svg className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></svg>
        </button>
      </div>

      {loading && (
        <div className="space-y-2 p-3">
          <div className="h-14 animate-pulse rounded-lg bg-slate-800/50" />
          <div className="grid grid-cols-3 gap-2"><div className="h-9 animate-pulse rounded-lg bg-slate-800/40" /><div className="h-9 animate-pulse rounded-lg bg-slate-800/40" /><div className="h-9 animate-pulse rounded-lg bg-slate-800/40" /></div>
          <div className="h-28 animate-pulse rounded-lg bg-slate-800/35" />
        </div>
      )}

      {!loading && error && (
        <div className="p-3">
          <div className="rounded-lg border border-rose-400/20 bg-rose-400/[0.06] p-3 text-[11px] leading-5 text-rose-200">
            <p className="font-bold">Intelligence unavailable</p>
            <p className="mt-1 text-rose-200/70">{error}</p>
          </div>
        </div>
      )}

      {!loading && data && derived && (
        <>
          <div className="p-3 pb-0">
            <div className="flex flex-wrap gap-1.5">
              <StatePill active={data.identity.email_verified} onLabel="Email verified" offLabel="Email unverified" />
              <StatePill active={!data.account.needs_setup} onLabel="Setup complete" offLabel="Setup incomplete" warning />
              <StatePill active={derived.hasFormalSchool} onLabel="School linked" offLabel="No school membership" warning />
              <StatePill active={derived.hasProductActivity} onLabel="Has activity" offLabel="No product activity" warning />
            </div>
          </div>

          {data.warnings.length > 0 && (
            <div className="space-y-2 p-3 pb-0">
              {data.warnings.map((warning) => (
                <div key={warning.code} className={`rounded-lg border px-3 py-2.5 ${warningClass(warning)}`}>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 text-sm">{warning.severity === 'warning' ? '⚠' : warning.severity === 'critical' ? '!' : 'ℹ'}</span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold">{warning.title}</p>
                      <p className="mt-0.5 text-[10px] leading-4 opacity-70">{warning.message}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mx-3 mt-3 grid grid-cols-3 rounded-lg border border-slate-800 bg-slate-950/45 p-1">
            {(['overview', 'activity', 'access'] as IntelligenceTab[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={`rounded-md px-2 py-1.5 text-[10px] font-bold capitalize transition ${tab === value ? 'bg-slate-800 text-cyan-200 shadow-sm' : 'text-slate-600 hover:text-slate-300'}`}
              >
                {value}
              </button>
            ))}
          </div>

          <div className="p-3">
            {tab === 'overview' && (
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/30 px-3">
                  <DataRow label="Name" value={data.identity.full_name || data.identity.auth_display_name || 'Not provided'} />
                  {data.identity.auth_display_name && data.identity.full_name !== data.identity.auth_display_name && <DataRow label="Google name" value={data.identity.auth_display_name} />}
                  <DataRow label="Joined" value={formatDateTime(data.identity.created_at)} />
                  <DataRow label="Last sign-in" value={formatDateTime(data.identity.last_sign_in_at)} />
                  <DataRow label="Account tier" value={String(data.account.account_tier || 'free').replace(/_/g, ' ')} />
                </div>

                <div>
                  <p className="mb-2 text-[9px] font-black uppercase tracking-[0.12em] text-slate-600">Placement integrity</p>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/30 px-3">
                    <DataRow label="Linked school" value={data.placement.linked_school_name || 'Unassigned'} />
                    <DataRow label="Profile school" value={data.placement.claimed_school_name || 'None'} />
                    <DataRow label="School memberships" value={formatNumber(data.placement.school_memberships.length)} />
                    <DataRow label="Class memberships" value={formatNumber(data.placement.class_memberships.length)} />
                    <DataRow label="Subject enrolments" value={formatNumber(data.placement.subject_enrolment_count)} />
                    <DataRow label="Guardian links" value={formatNumber(data.placement.guardian_relationship_count)} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <MetricCard label="AP" value={`${formatNumber(data.game.ap_now)}/${formatNumber(data.game.ap_max)}`} />
                  <MetricCard label="Attack" value={formatNumber(data.game.attack_power)} />
                  <MetricCard label="Defense" value={formatNumber(data.game.defense_power)} />
                  <MetricCard label="Streak" value={formatNumber(data.game.streak)} />
                  <MetricCard label="PvP wins" value={formatNumber(data.game.pvp_wins)} />
                  <MetricCard label="Achievement pts" value={formatNumber(data.game.achievement_points)} />
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/30 px-3">
                  <DataRow label="Tutorial" value={data.account.tutorial_completed ? 'Completed' : 'Not completed'} />
                  <DataRow label="Onboarding" value={data.onboarding?.core_completed_at ? 'Core completed' : data.onboarding?.current_step || 'No onboarding record'} />
                  <DataRow label="Profile lock" value={data.account.profile_locked ? 'Locked' : 'Unlocked'} />
                  <DataRow label="Brains Master" value={data.account.brains_master_until ? `Until ${formatDateTime(data.account.brains_master_until)}` : 'Not active'} />
                </div>
              </div>
            )}

            {tab === 'activity' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <MetricCard label="Question attempts" value={formatNumber(derived.questionAttempts)} hint={derived.accuracy === null ? 'No answers yet' : `${derived.accuracy}% correct`} />
                  <MetricCard label="Assignments" value={`${formatNumber(data.activity.assignments.completed)}/${formatNumber(data.activity.assignments.assigned)}`} hint={data.activity.assignments.average_accuracy === null ? 'No scored results' : `${data.activity.assignments.average_accuracy}% avg accuracy`} />
                  <MetricCard label="Cambridge" value={formatNumber(data.activity.cambridge_quizzes.attempts)} hint={data.activity.cambridge_quizzes.average_percentage === null ? 'No quiz scores' : `${data.activity.cambridge_quizzes.average_percentage}% average`} />
                  <MetricCard label="Quests" value={`${formatNumber(data.activity.quests.completed)}/${formatNumber(data.activity.quests.runs)}`} hint="completed / runs" />
                  <MetricCard label="IELTS attempts" value={formatNumber(derived.ieltsAttempts)} hint={data.ielts.profile?.tier ? `Tier: ${data.ielts.profile.tier}` : 'No IELTS profile'} />
                  <MetricCard label="Writing Hub" value={formatNumber(data.writing_hub.assessments)} hint={data.writing_hub.average_score === null ? 'No assessments' : `${data.writing_hub.average_score} avg score`} />
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/30 px-3">
                  <DataRow label="Clan" value={data.activity.clan ? `${data.activity.clan.name || 'Unnamed'} · ${data.activity.clan.role || 'member'}` : 'None'} />
                  <DataRow label="Raid participations" value={formatNumber(data.activity.raids.participations)} />
                  <DataRow label="Achievements unlocked" value={formatNumber(data.activity.achievements.unlocked)} />
                  <DataRow label="Shop purchases" value={formatNumber(data.activity.commerce.shop_purchases)} />
                  <DataRow label="Inventory items" value={formatNumber(data.activity.commerce.inventory_items)} />
                  <DataRow label="Notifications" value={`${formatNumber(data.activity.notifications.unread)} unread / ${formatNumber(data.activity.notifications.total)} total`} />
                  <DataRow label="Onboarding events" value={formatNumber(data.activity.onboarding_events.total)} />
                </div>

                <div>
                  <p className="mb-2 text-[9px] font-black uppercase tracking-[0.12em] text-slate-600">IELTS breakdown</p>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(data.ielts.attempts).map(([key, value]) => <MetricCard key={key} label={key.replace(/_/g, ' ')} value={formatNumber(value)} />)}
                  </div>
                </div>
              </div>
            )}

            {tab === 'access' && (
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/30 px-3">
                  <DataRow label="User ID" value={data.identity.user_id} mono title={data.identity.user_id} />
                  <DataRow label="Auth provider" value={data.identity.provider || data.identity.providers.join(', ') || 'Unknown'} />
                  <DataRow label="Email verified" value={data.identity.email_verified ? 'Yes' : 'No'} />
                  <DataRow label="Email confirmed" value={formatDateTime(data.identity.email_confirmed_at)} />
                  <DataRow label="SSO account" value={data.identity.is_sso_user ? 'Yes' : 'No'} />
                  <DataRow label="Anonymous" value={data.identity.is_anonymous ? 'Yes' : 'No'} />
                  <DataRow label="Admin roles" value={data.account.admin_roles.length ? data.account.admin_roles.map((role) => role.role).filter(Boolean).join(', ') : 'None'} />
                </div>

                <div>
                  <p className="mb-2 text-[9px] font-black uppercase tracking-[0.12em] text-slate-600">Latest authenticated session</p>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/30 px-3">
                    <DataRow label="AAL" value={data.identity.latest_session?.aal?.toUpperCase() || '—'} />
                    <DataRow label="Session created" value={formatDateTime(data.identity.latest_session?.created_at)} />
                    <DataRow label="Network" value={data.identity.latest_session?.ip || '—'} mono />
                    <DataRow label="User agent" value={data.identity.latest_session?.user_agent || '—'} title={data.identity.latest_session?.user_agent || undefined} />
                  </div>
                </div>

                <p className="rounded-lg border border-slate-800 bg-slate-950/25 px-3 py-2 text-[9px] leading-4 text-slate-600">
                  Session and network details are visible only through the protected superadmin intelligence endpoint and are loaded on demand for support and security review.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default UserIntelligencePanel;
