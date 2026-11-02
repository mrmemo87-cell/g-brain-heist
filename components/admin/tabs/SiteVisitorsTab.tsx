import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../services/supabaseClient';

// Superadmin view of brainsheist.com itself (not the demo school):
//   1. accounts that signed up but never joined a school, by name and email;
//   2. anonymous visitors who looked around without signing in (counts, countries, sources, pages).

interface Unplaced {
  id: string; email: string | null; username: string | null; full_name: string | null; role: string | null;
  signed_up: string; last_sign_in: string | null;
}
interface RecentVisitor {
  visitor_id: string; first_seen: string; last_seen: string; pages: number; visits: number;
  country: string | null; city: string | null; device: string | null; source: string; paths: string[] | null;
}
export interface SiteReport {
  days: number;
  totals: { visitors: number; page_views: number; today: number; this_week: number; countries: number };
  daily: Array<{ day: string; visitors: number }>;
  countries: Array<{ country: string; visitors: number }>;
  sources: Array<{ source: string; visitors: number }>;
  pages: Array<{ path: string; views: number; visitors: number }>;
  recent: RecentVisitor[];
  unplaced: Unplaced[];
}

const REGION_NAMES = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
const countryName = (code: string | null): string => {
  if (!code) return 'Unknown';
  if (code.length !== 2) return code;
  try { return REGION_NAMES?.of(code.toUpperCase()) ?? code; } catch { return code; }
};
const flag = (code: string | null): string => {
  if (!code || code.length !== 2) return '🌐';
  return String.fromCodePoint(...code.toUpperCase().split('').map((c) => 0x1f1a5 + c.charCodeAt(0)));
};
const when = (iso: string | null) => (iso
  ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Bishkek', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  : 'Never');

// Personal email providers mark sign-ups that came from outside a partner school.
const PERSONAL_DOMAINS = /@(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|mail|yandex|proton|protonmail|aol)\./i;
export const isOutsider = (email: string | null): boolean => Boolean(email && PERSONAL_DOMAINS.test(email));

const SiteVisitorsTab: React.FC = () => {
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<SiteReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('rpc_site_visitor_report', { p_days: days });
    if (rpcError) setError(rpcError.message || 'Could not load site visitors.');
    else setReport(data as SiteReport);
    setLoading(false);
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  const unplaced = useMemo(() => {
    const list = report?.unplaced ?? [];
    return [...list.filter((u) => isOutsider(u.email)), ...list.filter((u) => !isOutsider(u.email))];
  }, [report]);
  const peak = Math.max(1, ...(report?.daily ?? []).map((d) => d.visitors));

  return (
    <div className="space-y-6">
      <div className="card-glass p-6 border-2 border-cyan-400/40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-2xl font-heading font-bold text-cyan-300">Site Visitors</h3>
            <p className="text-sm text-slate-400">New people on brainsheist.com: who signed up but never joined a school, and who looked around without signing in.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={days} onChange={(event) => setDays(Number(event.target.value))} aria-label="Period"
              className="bg-slate-900/70 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm">
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <button type="button" onClick={() => void load()} disabled={loading}
              className="bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60">
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {error ? <div className="card-glass p-4 border border-red-400/50 text-red-200 text-sm">{error}</div> : null}

      {report ? (
        <>
          <section className="card-glass p-6 border border-amber-400/40 space-y-4" aria-label="Signed up, no school">
            <div>
              <h4 className="text-lg font-bold text-amber-200">Signed up, no school <span className="text-slate-400 font-medium">({unplaced.length})</span></h4>
              <p className="text-xs text-slate-400">Accounts created in this period that are not in any school yet. Personal emails (outsiders) are listed first.</p>
            </div>
            {unplaced.length === 0 ? <p className="text-sm text-slate-500">Everyone who signed up in this period is in a school.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-slate-700">
                      <th className="py-2 pr-4">Person</th><th className="py-2 pr-4">Role</th><th className="py-2 pr-4">Signed up</th><th className="py-2 pr-4">Last sign-in</th><th className="py-2">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unplaced.map((u) => (
                      <tr key={u.id} className="border-b border-slate-800 align-top">
                        <td className="py-3 pr-4">
                          <div className="font-semibold text-white">{u.full_name || u.username || '—'}</div>
                          {u.email ? <a className="text-cyan-300 hover:underline" href={`mailto:${u.email}`}>{u.email}</a> : null}
                        </td>
                        <td className="py-3 pr-4 text-slate-200">{u.role || '—'}</td>
                        <td className="py-3 pr-4 text-slate-200 whitespace-nowrap">{when(u.signed_up)}</td>
                        <td className="py-3 pr-4 text-slate-200 whitespace-nowrap">{when(u.last_sign_in)}</td>
                        <td className="py-3 text-xs">
                          <span className={isOutsider(u.email) ? 'rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 font-semibold' : 'rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 font-semibold'}>
                            {isOutsider(u.email) ? 'Outsider' : 'School email'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3" aria-label="Anonymous visitor totals">
            {([
              ['Anonymous visitors', report.totals.visitors], ['Today', report.totals.today], ['This week', report.totals.this_week],
              ['Page views', report.totals.page_views], ['Countries', report.totals.countries],
            ] as Array<[string, number]>).map(([label, value]) => (
              <div key={label} className="card-glass p-4 rounded-xl border border-slate-600/50">
                <div className="text-3xl font-black text-white">{value}</div>
                <div className="text-xs uppercase tracking-wider text-slate-400 mt-1">{label}</div>
              </div>
            ))}
          </section>

          <section className="card-glass p-6 border border-cyan-400/30 space-y-5" aria-label="Anonymous visitors">
            <div>
              <h4 className="text-lg font-bold text-white">Looked around without signing in</h4>
              <p className="text-xs text-slate-400">Anonymous: no names are known until someone signs up or books. Browsers that have ever signed in are not counted.</p>
            </div>
            {report.totals.visitors === 0 ? <p className="text-sm text-slate-500">No anonymous visits recorded in this period yet. Tracking started on 2 Nov 2026.</p> : (
              <>
                <div>
                  <h5 className="text-sm font-bold text-cyan-300 mb-2">Visitors per day</h5>
                  <div className="flex items-end gap-1 h-24" role="img" aria-label="Visitors per day">
                    {report.daily.map((d) => (
                      <div key={d.day} className="flex-1 min-w-[6px] rounded-t bg-cyan-500" style={{ height: `${Math.max(4, (d.visitors / peak) * 100)}%` }} title={`${d.day}: ${d.visitors}`} />
                    ))}
                  </div>
                </div>
                <div className="grid md:grid-cols-3 gap-6">
                  {([
                    ['Came from', report.sources.map((s) => [s.source, s.visitors] as [string, number])],
                    ['Countries', report.countries.map((c) => [`${flag(c.country)} ${countryName(c.country)}`, c.visitors] as [string, number])],
                    ['Pages opened', report.pages.map((p) => [p.path, p.visitors] as [string, number])],
                  ] as Array<[string, Array<[string, number]>]>).map(([title, rows]) => (
                    <div key={title}>
                      <h5 className="text-sm font-bold text-cyan-300 mb-2">{title}</h5>
                      <ul className="space-y-1 text-sm">{rows.map(([label, n]) => (
                        <li key={label} className="flex justify-between gap-3 border-b border-slate-700/50 py-1"><span className="text-slate-200 truncate">{label}</span><span className="text-white font-semibold">{n}</span></li>
                      ))}</ul>
                    </div>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <h5 className="text-sm font-bold text-cyan-300 mb-2">Latest visitors</h5>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-slate-700">
                        <th className="py-2 pr-4">From</th><th className="py-2 pr-4">Came from</th><th className="py-2 pr-4">Last seen</th><th className="py-2 pr-4">Pages</th><th className="py-2">Looked at</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.recent.slice(0, 50).map((r) => (
                        <tr key={r.visitor_id} className="border-b border-slate-800 align-top">
                          <td className="py-2 pr-4 text-slate-200">{flag(r.country)} {countryName(r.country)}{r.city ? <span className="text-slate-400">, {r.city}</span> : null}{r.device ? <div className="text-xs text-slate-400">{r.device}</div> : null}</td>
                          <td className="py-2 pr-4 text-slate-200">{r.source}</td>
                          <td className="py-2 pr-4 text-slate-200 whitespace-nowrap">{when(r.last_seen)}{r.visits > 1 ? <div className="text-xs text-slate-400">{r.visits} visits</div> : null}</td>
                          <td className="py-2 pr-4 text-slate-200">{r.pages}</td>
                          <td className="py-2 text-xs text-slate-300">{(r.paths ?? []).slice(0, 4).join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
};

export default SiteVisitorsTab;
