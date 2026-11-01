import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../services/supabaseClient';
import { isDemoMode } from '../../../services/demoMode';

// Superadmin view of demo.brainsheist.com visitors: who opened the demo, how far they got
// through the entry form, and who entered. On the main site the data comes through
// /api/demo-visitors (the demo lives in its own Supabase project); on the demo site itself
// it is read directly.

interface TimelineEvent { type: string; label: string | null; path: string | null; at: string; session?: string; meta?: Record<string, unknown> }

// What each recorded event means, in plain words. Heartbeats are timing pings, not actions.
const EVENT_TEXT: Record<string, { icon: string; text: string }> = {
  enter: { icon: '🚪', text: 'Entered the demo as' }, section: { icon: '📍', text: 'Opened' }, click: { icon: '👆', text: 'Clicked' },
  page: { icon: '📄', text: 'Page' }, workspace_open: { icon: '🗂️', text: 'Opened workspace' }, switch_persona: { icon: '🔁', text: 'Switched to' },
  hidden: { icon: '💤', text: 'Left the tab while on' }, visible: { icon: '👀', text: 'Came back to' }, signout: { icon: '👋', text: 'Signed out from' },
  exit: { icon: '👋', text: 'Closed the demo on' },
};

interface Visitor {
  id: string; created_at: string; last_seen_at: string; full_name: string; email: string; school: string | null; role: string | null;
  country: string | null; geo_country: string | null; geo_city: string | null; device: string | null; visits: number;
  active_seconds: number; entered_as: string | null; referrer: string | null; utm: Record<string, string> | null;
  sections: Array<{ section: string; n: number }>;
}
interface Report {
  totals: { visitors: number; visits: number; countries: number; schools: number; avg_minutes: number; today: number; this_week: number };
  visitors: Visitor[];
}
interface Unfinished {
  id: string; at: string; name: string | null; email: string; school: string | null; role: string | null;
  country: string | null; geo_country: string | null; device: string | null; step: number; source: string | null;
}
interface Funnel {
  funnel: { opened: number; gave_details: number; gave_school: number; entered: number; automated?: number };
  unfinished?: Unfinished[];
  sources: Array<{ source: string; opened: number; entered: number }>;
  countries: Array<{ country: string; opened: number; entered: number }>;
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
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Bishkek', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const duration = (seconds: number) => (seconds < 60 ? `${seconds}s` : `${Math.round(seconds / 60)} min`);
const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

const loadData = async (days: number): Promise<{ report: Report; funnel: Funnel | null }> => {
  if (isDemoMode()) {
    const [report, funnel] = await Promise.all([
      supabase.rpc('rpc_demo_visitor_report', { p_days: days }),
      supabase.rpc('rpc_demo_landing_funnel', { p_days: days }),
    ]);
    if (report.error) throw new Error(report.error.message);
    return { report: report.data as Report, funnel: funnel.error ? null : (funnel.data as Funnel) };
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Your session has expired. Sign in again.');
  const response = await fetch(`/api/demo-visitors?days=${days}`, { headers: { Authorization: `Bearer ${token}` } });
  const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; detail?: string; report?: Report; funnel?: Funnel | null } | null;
  if (!response.ok || !payload?.ok || !payload.report) {
    if (payload?.error === 'not_configured') throw new Error(`SETUP:${payload.detail || ''}`);
    throw new Error(payload?.error || `Could not load demo visitors (${response.status}).`);
  }
  return { report: payload.report, funnel: payload.funnel ?? null };
};

const loadTimeline = async (visitorId: string): Promise<TimelineEvent[]> => {
  if (isDemoMode()) {
    const { data, error } = await supabase.rpc('rpc_demo_visitor_timeline', { p_visitor_id: visitorId });
    if (error) throw new Error(error.message);
    return ((data as { events?: TimelineEvent[] } | null)?.events ?? []);
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Your session has expired. Sign in again.');
  const response = await fetch(`/api/demo-visitors?visitor=${encodeURIComponent(visitorId)}`, { headers: { Authorization: `Bearer ${token}` } });
  const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; timeline?: { events?: TimelineEvent[] } } | null;
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || `Could not load the timeline (${response.status}).`);
  return payload.timeline?.events ?? [];
};

const TimelineList: React.FC<{ events: TimelineEvent[] }> = ({ events }) => {
  const shown = events.filter((event) => event.type !== 'heartbeat');
  if (shown.length === 0) return <p className="text-sm text-slate-500">No activity recorded inside the demo.</p>;
  const sessions: string[] = [];
  shown.forEach((event) => { const key = event.session ?? 'visit'; if (!sessions.includes(key)) sessions.push(key); });
  return (
    <div className="space-y-4">
      {sessions.map((session, index) => {
        const items = shown.filter((event) => (event.session ?? 'visit') === session);
        return (
          <div key={session}>
            <div className="text-xs font-bold uppercase tracking-wider text-cyan-300 mb-2">Visit {index + 1} · {when(items[0].at)} · {items.length} actions</div>
            <ol className="space-y-1 border-l border-slate-700 pl-4">
              {items.map((event, i) => {
                const known = EVENT_TEXT[event.type] ?? { icon: '•', text: event.type };
                return (
                  <li key={`${event.at}-${i}`} className="text-sm text-slate-200 flex gap-3">
                    <span className="text-slate-500 tabular-nums whitespace-nowrap">{new Date(event.at).toLocaleTimeString('en-GB', { timeZone: 'Asia/Bishkek', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    <span aria-hidden="true">{known.icon}</span>
                    <span>{known.text} <strong className="text-white">{event.label || event.path || ''}</strong></span>
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}
    </div>
  );
};

const DemoVisitorsTab: React.FC = () => {
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<Report | null>(null);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [openTimeline, setOpenTimeline] = useState<string | null>(null);
  const [timelines, setTimelines] = useState<Record<string, TimelineEvent[] | 'loading' | { error: string }>>({});

  const toggleTimeline = useCallback(async (visitorId: string) => {
    if (openTimeline === visitorId) { setOpenTimeline(null); return; }
    setOpenTimeline(visitorId);
    if (Array.isArray(timelines[visitorId])) return;
    setTimelines((current) => ({ ...current, [visitorId]: 'loading' }));
    try {
      const events = await loadTimeline(visitorId);
      setTimelines((current) => ({ ...current, [visitorId]: events }));
    } catch (cause) {
      setTimelines((current) => ({ ...current, [visitorId]: { error: cause instanceof Error ? cause.message : 'Could not load the timeline.' } }));
    }
  }, [openTimeline, timelines]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadData(days);
      setReport(result.report);
      setFunnel(result.funnel);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load demo visitors.');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  const visitors = useMemo(() => {
    const list = report?.visitors ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((v) => [v.full_name, v.email, v.school, v.role, v.country, countryName(v.geo_country)].some((field) => (field || '').toLowerCase().includes(q)));
  }, [report, query]);

  const setupNeeded = error?.startsWith('SETUP:');
  const steps: Array<[string, number]> = funnel ? [
    ['Opened the demo page', funnel.funnel.opened],
    ['Gave name and email', funnel.funnel.gave_details],
    ['Gave their school', funnel.funnel.gave_school],
    ['Entered the demo', funnel.funnel.entered],
  ] : [];

  return (
    <div className="space-y-6">
      <div className="card-glass p-6 border-2 border-cyan-400/40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-2xl font-heading font-bold text-cyan-300">Demo Visitors</h3>
            <p className="text-sm text-slate-400">Who opened demo.brainsheist.com, how far they got through the entry form, and who went inside.</p>
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

      {setupNeeded ? (
        <div className="card-glass p-6 border border-amber-400/50 text-amber-100 space-y-2">
          <p className="font-bold">One setting is needed before demo visitors can show here.</p>
          <p className="text-sm">In Vercel, open the main Brains Heist project → Settings → Environment Variables, add <code className="text-amber-300">DEMO_SUPABASE_SERVICE_ROLE_KEY</code> with the
            service_role key of the <b>brains-heist-demo</b> Supabase project (Supabase → Project Settings → API keys), then redeploy.</p>
        </div>
      ) : error ? (
        <div className="card-glass p-4 border border-red-400/50 text-red-200 text-sm">{error}</div>
      ) : null}

      {report ? (
        <>
          <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3" aria-label="Totals">
            {([
              ['Visitors', report.totals.visitors], ['Today', report.totals.today], ['This week', report.totals.this_week],
              ['Schools', report.totals.schools], ['Countries', report.totals.countries], ['Avg minutes inside', report.totals.avg_minutes],
            ] as Array<[string, number]>).map(([label, value]) => (
              <div key={label} className="card-glass p-4 rounded-xl border border-slate-600/50">
                <div className="text-3xl font-black text-white">{value}</div>
                <div className="text-xs uppercase tracking-wider text-slate-400 mt-1">{label}</div>
              </div>
            ))}
          </section>

          {funnel ? (
            <section className="card-glass p-6 border border-cyan-400/30 space-y-5" aria-label="Entry form funnel">
              <div>
                <h4 className="text-lg font-bold text-white">Entry form funnel</h4>
                <p className="text-xs text-slate-400">Real people only: counted from their first tap, click or scroll on the demo page.
                  {funnel.funnel.automated ? ` ${funnel.funnel.automated} automated visit${funnel.funnel.automated === 1 ? '' : 's'} (page checks, link scanners, crawlers) hidden.` : ''}</p>
              </div>
              <div className="space-y-3">
                {steps.map(([label, n]) => (
                  <div key={label} className="grid grid-cols-[minmax(9rem,13rem)_1fr_5.5rem] items-center gap-3 text-sm">
                    <span className="text-slate-200">{label}</span>
                    <div className="h-3 rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-purple-500" style={{ width: `${Math.max(2, pct(n, funnel.funnel.opened))}%` }} />
                    </div>
                    <span className="text-right font-bold text-white">{n} <span className="text-slate-400 font-medium">{funnel.funnel.opened ? `${pct(n, funnel.funnel.opened)}%` : ''}</span></span>
                  </div>
                ))}
              </div>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h5 className="text-sm font-bold text-cyan-300 mb-2">Came from</h5>
                  {funnel.sources.length === 0 ? <p className="text-sm text-slate-500">No visits yet.</p> : (
                    <ul className="space-y-1 text-sm">{funnel.sources.map((row) => (
                      <li key={row.source} className="flex justify-between gap-3 border-b border-slate-700/50 py-1"><span className="text-slate-200 truncate">{row.source}</span><span className="text-white font-semibold whitespace-nowrap">{row.opened} <span className="text-slate-400 font-normal">→ {row.entered} entered</span></span></li>
                    ))}</ul>
                  )}
                </div>
                <div>
                  <h5 className="text-sm font-bold text-cyan-300 mb-2">Opened from</h5>
                  {funnel.countries.length === 0 ? <p className="text-sm text-slate-500">No visits yet.</p> : (
                    <ul className="space-y-1 text-sm">{funnel.countries.map((row) => (
                      <li key={row.country} className="flex justify-between gap-3 border-b border-slate-700/50 py-1"><span className="text-slate-200">{flag(row.country)} {countryName(row.country)}</span><span className="text-white font-semibold whitespace-nowrap">{row.opened} <span className="text-slate-400 font-normal">→ {row.entered} entered</span></span></li>
                    ))}</ul>
                  )}
                </div>
              </div>
            </section>
          ) : null}

          {funnel?.unfinished && funnel.unfinished.length > 0 ? (
            <section className="card-glass p-6 border border-amber-400/40 space-y-4" aria-label="Started but did not finish">
              <div>
                <h4 className="text-lg font-bold text-amber-200">Started but didn't finish <span className="text-slate-400 font-medium">({funnel.unfinished.length})</span></h4>
                <p className="text-xs text-slate-400">They gave their name and email, then left before entering the demo. Your warmest follow-ups.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-slate-700">
                      <th className="py-2 pr-4">Person</th><th className="py-2 pr-4">School</th><th className="py-2 pr-4">From</th><th className="py-2 pr-4">Stopped at</th><th className="py-2">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funnel.unfinished.map((u) => (
                      <tr key={u.id} className="border-b border-slate-800 align-top">
                        <td className="py-3 pr-4">
                          <div className="font-semibold text-white">{u.name || '—'}</div>
                          <a className="text-cyan-300 hover:underline" href={`mailto:${u.email}`}>{u.email}</a>
                          {u.role ? <div className="text-xs text-slate-400">{u.role}</div> : null}
                        </td>
                        <td className="py-3 pr-4 text-slate-200">{u.school || '—'}</td>
                        <td className="py-3 pr-4 text-slate-200">{flag(u.geo_country)} {countryName(u.geo_country)}
                          {u.country && u.country !== countryName(u.geo_country) ? <div className="text-xs text-slate-400">says: {u.country}</div> : null}
                          {u.source ? <div className="text-xs text-slate-400">via {u.source}</div> : null}
                        </td>
                        <td className="py-3 pr-4 text-slate-200">{u.step >= 3 ? 'Choosing teacher or student' : 'School details'}{u.device ? <div className="text-xs text-slate-400">{u.device}</div> : null}</td>
                        <td className="py-3 text-slate-200 whitespace-nowrap">{when(u.at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section className="card-glass p-6 border border-slate-600/50 space-y-4" aria-label="Visitors">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-lg font-bold text-white">Visitors who entered <span className="text-slate-400 font-medium">({visitors.length})</span></h4>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, school, email, country…" aria-label="Search visitors"
                className="bg-slate-900/70 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm w-full sm:w-72" />
            </div>
            {visitors.length === 0 ? <p className="text-sm text-slate-500">No visitors in this period yet.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-slate-700">
                      <th className="py-2 pr-4">Visitor</th><th className="py-2 pr-4">School</th><th className="py-2 pr-4">From</th>
                      <th className="py-2 pr-4">Last seen</th><th className="py-2 pr-4">Inside</th><th className="py-2 pr-4">Looked at</th><th className="py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {visitors.map((v) => (
                      <React.Fragment key={v.id}>
                      <tr className="border-b border-slate-800 align-top">
                        <td className="py-3 pr-4">
                          <div className="font-semibold text-white">{v.full_name}</div>
                          <a className="text-cyan-300 hover:underline" href={`mailto:${v.email}`}>{v.email}</a>
                          <div className="text-xs text-slate-400">{v.role || '—'} · entered as {v.entered_as || 'teacher'}{v.device ? ` · ${v.device}` : ''}</div>
                        </td>
                        <td className="py-3 pr-4 text-slate-200">{v.school || '—'}</td>
                        <td className="py-3 pr-4 text-slate-200">{flag(v.geo_country)} {countryName(v.geo_country)}{v.geo_city ? <span className="text-slate-400">, {v.geo_city}</span> : null}
                          {v.country && v.country !== countryName(v.geo_country) ? <div className="text-xs text-slate-400">says: {v.country}</div> : null}
                          {v.utm?.utm_source ? <div className="text-xs text-slate-400">via {v.utm.utm_source}</div> : null}
                        </td>
                        <td className="py-3 pr-4 text-slate-200 whitespace-nowrap">{when(v.last_seen_at)}{v.visits > 1 ? <div className="text-xs text-slate-400">{v.visits} visits</div> : null}</td>
                        <td className="py-3 pr-4 text-slate-200 whitespace-nowrap">{duration(v.active_seconds)}</td>
                        <td className="py-3 pr-4 text-slate-300 text-xs">{(v.sections ?? []).slice(0, 4).map((s) => s.section).join(', ') || '—'}</td>
                        <td className="py-3 text-right">
                          <button type="button" onClick={() => void toggleTimeline(v.id)} aria-expanded={openTimeline === v.id}
                            className="bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400 text-white px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap">
                            {openTimeline === v.id ? 'Hide timeline' : 'Timeline'}
                          </button>
                        </td>
                      </tr>
                      {openTimeline === v.id ? (
                        <tr className="border-b border-slate-800">
                          <td colSpan={7} className="py-4 px-2 bg-slate-900/40">
                            {(() => {
                              const data = timelines[v.id];
                              if (!data || data === 'loading') return <p className="text-sm text-slate-400">Loading timeline…</p>;
                              if (!Array.isArray(data)) return <p className="text-sm text-red-300">{data.error}</p>;
                              return <TimelineList events={data} />;
                            })()}
                          </td>
                        </tr>
                      ) : null}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
};

export default DemoVisitorsTab;
