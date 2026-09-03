import React from 'react';
import { useAdmin } from '../AdminContext';

const DashboardTab: React.FC = () => {
  const {
    adminVisible, isResettingAll, playerUsers, refreshAdminData, resetAllProgress, resolveUserLabel,
    setShowAnnouncementComposer, stats, statsError, statsLoading,
  } = useAdmin();

  const metrics = [
    { key: 'totalUsers', label: 'Total users', detail: 'All registered platform accounts', accent: 'cyan' },
    { key: 'totalTeachers', label: 'Teachers', detail: 'Teacher accounts across the platform', accent: 'violet' },
    { key: 'bhMembers', label: 'Brains Heist members', detail: 'Core Brains Heist product accounts', accent: 'sky' },
    { key: 'ieltsUsers', label: 'IELTS users', detail: 'IELTS learner accounts', accent: 'amber' },
    { key: 'ieltsTeachers', label: 'IELTS teachers', detail: 'IELTS teaching accounts', accent: 'emerald' },
  ] as const;

  const accentClasses: Record<string, string> = {
    cyan: 'border-cyan-400/18 bg-cyan-400/[0.035] text-cyan-300',
    violet: 'border-violet-400/18 bg-violet-400/[0.035] text-violet-300',
    sky: 'border-sky-400/18 bg-sky-400/[0.035] text-sky-300',
    amber: 'border-amber-400/18 bg-amber-400/[0.035] text-amber-300',
    emerald: 'border-emerald-400/18 bg-emerald-400/[0.035] text-emerald-300',
  };

  const averageLevel = playerUsers.length > 0
    ? (playerUsers.reduce((sum: number, user: any) => sum + Number(user.level ?? 0), 0) / playerUsers.length).toFixed(1)
    : '0';
  const averageXp = playerUsers.length > 0
    ? Math.floor(playerUsers.reduce((sum: number, user: any) => sum + Number(user.xp ?? 0), 0) / playerUsers.length).toLocaleString()
    : '0';
  const richest = playerUsers.length > 0
    ? playerUsers.reduce((max: any, user: any) => Number(user.coins ?? 0) > Number(max.coins ?? 0) ? user : max, playerUsers[0])
    : null;
  const highestLevel = playerUsers.length > 0
    ? playerUsers.reduce((max: any, user: any) => Number(user.level ?? 0) > Number(max.level ?? 0) ? user : max, playerUsers[0])
    : null;

  return (
    <div className="space-y-4">
      {statsError && (
        <div className="flex flex-col gap-3 rounded-xl border border-rose-400/25 bg-rose-400/8 px-4 py-3 text-sm text-rose-200 sm:flex-row sm:items-center sm:justify-between">
          <span>{statsError}</span>
          <button type="button" onClick={() => void refreshAdminData()} className="text-xs font-bold underline decoration-rose-400/40 underline-offset-4">Retry</button>
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map((metric) => {
          const value = (stats as Record<string, number | null>)[metric.key];
          return (
            <article key={metric.key} className={`rounded-2xl border p-4 ${accentClasses[metric.accent]}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{metric.label}</p>
                  {statsLoading ? <div className="mt-3 h-8 w-24 animate-pulse rounded-lg bg-slate-800/70" /> : <p className="mt-2 text-2xl font-black tracking-tight text-slate-100">{value == null ? '—' : Number(value).toLocaleString()}</p>}
                </div>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-current/15 bg-current/[0.05] text-current">
                  <span className="h-2.5 w-2.5 rounded-full bg-current shadow-[0_0_14px_currentColor]" />
                </span>
              </div>
              <p className="mt-3 text-[11px] leading-4 text-slate-600">{metric.detail}</p>
            </article>
          );
        })}
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
        <section className="rounded-2xl border border-slate-800/90 bg-[#0a1626]/88 p-4 shadow-[0_24px_70px_rgba(2,8,23,0.18)] sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-white">Operations</h2>
              <p className="mt-1 text-xs text-slate-500">Common platform actions with destructive controls kept separate.</p>
            </div>
            <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-bold ${adminVisible ? 'border-emerald-400/20 bg-emerald-400/8 text-emerald-300' : 'border-slate-700 bg-slate-900/60 text-slate-400'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${adminVisible ? 'bg-emerald-400' : 'bg-slate-500'}`} />
              {adminVisible ? 'Admin visible to players' : 'Admin hidden from players'}
            </span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => void refreshAdminData()}
              className="group flex items-center gap-3 rounded-xl border border-cyan-400/18 bg-cyan-400/[0.045] p-4 text-left transition hover:border-cyan-400/30 hover:bg-cyan-400/[0.075]"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></svg>
              </span>
              <span><span className="block text-sm font-bold text-slate-100">Refresh core data</span><span className="mt-1 block text-xs text-slate-500">Reload dashboard metrics and the current user page.</span></span>
            </button>

            <button
              type="button"
              onClick={() => setShowAnnouncementComposer(true)}
              className="group flex items-center gap-3 rounded-xl border border-emerald-400/18 bg-emerald-400/[0.045] p-4 text-left transition hover:border-emerald-400/30 hover:bg-emerald-400/[0.075]"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 13V9l11-5v14z" /><path d="M15 8c3 0 5 1.7 5 4s-2 4-5 4" /><path d="M7 14l1.5 5h3" /></svg>
              </span>
              <span><span className="block text-sm font-bold text-slate-100">Send announcement</span><span className="mt-1 block text-xs text-slate-500">Open the governed audience-targeting composer.</span></span>
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800/90 bg-[#0a1626]/88 p-4 shadow-[0_24px_70px_rgba(2,8,23,0.18)] sm:p-5">
          <h2 className="text-base font-bold text-white">Loaded user sample</h2>
          <p className="mt-1 text-xs text-slate-500">Quick signals from the user page currently held in memory, not a full-platform aggregate.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3"><p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-600">Average level</p><p className="mt-1.5 text-lg font-black text-slate-200">{averageLevel}</p></div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3"><p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-600">Average XP</p><p className="mt-1.5 text-lg font-black text-slate-200">{averageXp}</p></div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3"><p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-600">Highest level</p><p className="mt-1.5 truncate text-sm font-bold text-slate-200">{highestLevel ? resolveUserLabel(highestLevel) : '—'}</p><p className="mt-0.5 text-[10px] text-slate-600">{highestLevel ? `Level ${Number(highestLevel.level ?? 0)}` : 'No loaded users'}</p></div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3"><p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-600">Most coins</p><p className="mt-1.5 truncate text-sm font-bold text-slate-200">{richest ? resolveUserLabel(richest) : '—'}</p><p className="mt-0.5 text-[10px] text-slate-600">{richest ? `${Number(richest.coins ?? 0).toLocaleString()} coins` : 'No loaded users'}</p></div>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-rose-500/18 bg-rose-950/[0.08] p-4 sm:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg border border-rose-400/18 bg-rose-400/8 text-rose-300">!</span><h2 className="text-sm font-bold text-rose-200">Danger zone</h2></div>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500">Resetting all progress is intentionally isolated from normal operational actions. The existing confirmation and backend safeguards still apply.</p>
          </div>
          <button
            type="button"
            onClick={resetAllProgress}
            disabled={isResettingAll}
            className="shrink-0 rounded-xl border border-rose-500/35 bg-rose-950/30 px-4 py-2.5 text-xs font-bold text-rose-300 transition hover:bg-rose-950/50 disabled:cursor-wait disabled:opacity-50"
          >
            {isResettingAll ? 'Resetting…' : 'Reset all progress'}
          </button>
        </div>
      </section>
    </div>
  );
};

export default DashboardTab;
