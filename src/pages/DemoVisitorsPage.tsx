import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import * as AuthService from '../../services/authService';
import './DemoVisitorsPage.css';

interface SectionCount { section: string; n: number }
interface VisitorEvent { type: string; label: string | null; path: string | null; at: string; meta?: Record<string, unknown>; session?: string }
interface Visitor {
  id: string; created_at: string; last_seen_at: string; full_name: string; email: string; school: string | null; role: string | null;
  country: string | null; city: string | null; class_size: string | null; interests: string[]; message: string | null;
  geo_country: string | null; geo_region: string | null; geo_city: string | null; geo_timezone: string | null; locale: string | null;
  referrer: string | null; utm: Record<string, string>; device: string | null; screen: string | null; visits: number;
  active_seconds: number; entered_as: string | null; events: number; sessions: number; sections: SectionCount[]; recent_events: VisitorEvent[];
}
interface Report {
  since: string;
  totals: { visitors: number; visits: number; countries: number; schools: number; avg_minutes: number; today: number; this_week: number };
  by_country: Array<{ country: string; visitors: number }>;
  by_day: Array<{ day: string; visitors: number }>;
  by_role: Array<{ role: string; visitors: number }>;
  top_sections: Array<{ section: string; visitors: number; views: number }>;
  interests: Array<{ interest: string; visitors: number }>;
  visitors: Visitor[];
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
const minutes = (seconds: number) => (seconds < 60 ? `${seconds}s` : `${Math.round(seconds / 60)} min`);
const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const AdminSignIn: React.FC<{ onSignedIn: () => void }> = ({ onSignedIn }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true); setError(null);
    try { await AuthService.login(email.trim(), password); onSignedIn(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Sign-in failed.'); }
    finally { setBusy(false); }
  };
  return (
    <div className="dv-page">
      <form className="dv-card dv-signin" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <p className="dv-eyebrow">Brains Heist · demo school</p>
        <h1>Platform administrator sign-in</h1>
        <p className="dv-muted">The visitor report is only available to the demo platform administrator.</p>
        <label><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></label>
        <label><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
        {error ? <div className="dv-error">{error}</div> : null}
        <button type="submit" className="is-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
};

const DemoVisitorsPage: React.FC = () => {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<Record<string, VisitorEvent[]>>({});

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => { if (!cancelled) setSignedIn(!!data.session); });
    return () => { cancelled = true; };
  }, []);

  const load = useCallback(async () => {
    if (!signedIn) return;
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('rpc_demo_visitor_report', { p_days: days });
    if (rpcError) { setError(rpcError.message.includes('administrator') ? 'This account is not a platform administrator. Sign out and use the demo ops account.' : rpcError.message); return; }
    setReport(data as Report);
  }, [days, signedIn]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => { void load(); }, 60000);
    return () => window.clearInterval(timer);
  }, [load]);

  if (signedIn === null) return <div className="dv-page"><p className="dv-muted">Loading…</p></div>;
  if (!signedIn) return <AdminSignIn onSignedIn={() => setSignedIn(true)} />;

  const openTimeline = async (id: string) => {
    if (open === id) { setOpen(null); return; }
    setOpen(id);
    if (timeline[id]) return;
    const { data } = await supabase.rpc('rpc_demo_visitor_timeline', { p_visitor_id: id });
    const events = ((data as { events?: VisitorEvent[] } | null)?.events ?? []).filter((event) => event.type !== 'heartbeat');
    setTimeline((current) => ({ ...current, [id]: events }));
  };

  const visitors = useMemo(() => {
    const list = report?.visitors ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((visitor) => [visitor.full_name, visitor.email, visitor.school, visitor.role, visitor.country, visitor.geo_city, countryName(visitor.geo_country)]
      .some((value) => (value ?? '').toLowerCase().includes(needle)));
  }, [report, query]);

  const exportCsv = () => {
    if (!report) return;
    const header = ['Name', 'Email', 'School', 'Role', 'Country (said)', 'Country (detected)', 'City (detected)', 'School size', 'Interests', 'Message', 'First visit', 'Last seen', 'Visits', 'Active minutes', 'Entered as', 'Device', 'Referrer', 'UTM'];
    const rows = report.visitors.map((v) => [v.full_name, v.email, v.school, v.role, v.country, countryName(v.geo_country), v.geo_city, v.class_size, v.interests.join('; '), v.message, v.created_at, v.last_seen_at, v.visits, Math.round(v.active_seconds / 60), v.entered_as, v.device, v.referrer, JSON.stringify(v.utm)]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = `brains-heist-demo-visitors-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
    URL.revokeObjectURL(url);
  };

  const maxDay = Math.max(1, ...(report?.by_day ?? []).map((row) => row.visitors));

  return (
    <div className="dv-page">
      <header className="dv-head">
        <div>
          <p className="dv-eyebrow">Brains Heist · demo school</p>
          <h1>Who tried the demo</h1>
          <p className="dv-muted">Every visitor who registered on the demo entrance, where they came from and what they looked at. Times are Bishkek.</p>
        </div>
        <div className="dv-actions">
          <select value={days} onChange={(event) => setDays(Number(event.target.value))} aria-label="Period">
            <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last year</option>
          </select>
          <button type="button" onClick={() => void load()}>Refresh</button>
          <button type="button" className="is-primary" onClick={exportCsv} disabled={!report}>Export CSV</button>
          <button type="button" onClick={() => { void AuthService.logout().then(() => { setSignedIn(false); setReport(null); }); }}>Sign out</button>
          <a href="/">Back to the app</a>
        </div>
      </header>

      {error ? <div className="dv-error">{error}</div> : null}
      {!report && !error ? <div className="dv-muted">Loading…</div> : null}

      {report ? (
        <>
          <section className="dv-tiles" aria-label="Totals">
            <div><b>{report.totals.visitors}</b><span>visitors</span></div>
            <div><b>{report.totals.today}</b><span>today</span></div>
            <div><b>{report.totals.this_week}</b><span>this week</span></div>
            <div><b>{report.totals.schools}</b><span>schools</span></div>
            <div><b>{report.totals.countries}</b><span>countries</span></div>
            <div><b>{report.totals.avg_minutes}</b><span>avg minutes inside</span></div>
          </section>

          <section className="dv-grid">
            <div className="dv-card">
              <h2>New visitors by day</h2>
              <div className="dv-bars" role="img" aria-label="Visitors per day">
                {report.by_day.length === 0 ? <p className="dv-muted">No visitors yet.</p> : report.by_day.map((row) => (
                  <div key={row.day} className="dv-bar" title={`${row.day}: ${row.visitors}`}>
                    <i style={{ height: `${Math.max(6, Math.round((row.visitors / maxDay) * 100))}%` }} />
                    <span>{row.day.slice(5)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="dv-card">
              <h2>Where from</h2>
              <ul className="dv-list">{report.by_country.map((row) => <li key={row.country}><span>{flag(row.country)} {countryName(row.country)}</span><b>{row.visitors}</b></li>)}</ul>
            </div>
            <div className="dv-card">
              <h2>What they opened most</h2>
              <ul className="dv-list">{report.top_sections.map((row) => <li key={row.section}><span>{row.section}</span><b>{row.visitors} <small>({row.views} views)</small></b></li>)}</ul>
            </div>
            <div className="dv-card">
              <h2>Roles and interests</h2>
              <ul className="dv-list">{report.by_role.map((row) => <li key={row.role}><span>{row.role}</span><b>{row.visitors}</b></li>)}</ul>
              <div className="dv-chips">{report.interests.map((row) => <span key={row.interest}>{row.interest} · {row.visitors}</span>)}</div>
            </div>
          </section>

          <section className="dv-card dv-table-card">
            <div className="dv-table-head">
              <h2>Visitors <small>({visitors.length})</small></h2>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, school, email, country…" aria-label="Search visitors" />
            </div>
            <div className="dv-table-scroll">
              <table className="dv-table">
                <thead><tr><th>Visitor</th><th>School</th><th>From</th><th>Interested in</th><th>Last seen</th><th>Inside</th><th>Looked at</th><th /></tr></thead>
                <tbody>
                  {visitors.map((visitor) => (
                    <React.Fragment key={visitor.id}>
                      <tr className={open === visitor.id ? 'is-open' : ''}>
                        <td><strong>{visitor.full_name}</strong><br /><a href={`mailto:${visitor.email}`}>{visitor.email}</a><br /><small>{visitor.role || '—'} · entered as {visitor.entered_as || 'teacher'} · {visitor.device || ''}</small></td>
                        <td>{visitor.school || <span className="dv-muted">—</span>}<br /><small>{visitor.class_size || ''}</small></td>
                        <td>{flag(visitor.geo_country)} {visitor.geo_city ? `${visitor.geo_city}, ` : ''}{countryName(visitor.geo_country)}<br /><small>said: {visitor.country || '—'}{visitor.geo_timezone ? ` · ${visitor.geo_timezone}` : ''}</small></td>
                        <td><div className="dv-chips dv-chips--small">{visitor.interests.map((item) => <span key={item}>{item}</span>)}</div>{visitor.message ? <small className="dv-message">“{visitor.message}”</small> : null}</td>
                        <td>{when(visitor.last_seen_at)}<br /><small>first {when(visitor.created_at)} · {visitor.visits} visit{visitor.visits === 1 ? '' : 's'}</small></td>
                        <td>{minutes(visitor.active_seconds)}<br /><small>{visitor.events} actions</small></td>
                        <td><div className="dv-chips dv-chips--small">{visitor.sections.map((row) => <span key={row.section}>{row.section} · {row.n}</span>)}</div></td>
                        <td><button type="button" onClick={() => void openTimeline(visitor.id)}>{open === visitor.id ? 'Hide' : 'Timeline'}</button></td>
                      </tr>
                      {open === visitor.id ? (
                        <tr className="dv-timeline-row"><td colSpan={8}>
                          <ol className="dv-timeline">
                            {(timeline[visitor.id] ?? visitor.recent_events).map((event, index) => (
                              <li key={`${event.at}-${index}`}><time>{when(event.at)}</time><b>{event.type}</b><span>{event.label || event.path || ''}</span></li>
                            ))}
                            {(timeline[visitor.id] ?? []).length === 0 && visitor.recent_events.length === 0 ? <li><span className="dv-muted">No actions recorded yet.</span></li> : null}
                          </ol>
                        </td></tr>
                      ) : null}
                    </React.Fragment>
                  ))}
                  {visitors.length === 0 ? <tr><td colSpan={8} className="dv-muted">Nobody matches.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
};

export default DemoVisitorsPage;
