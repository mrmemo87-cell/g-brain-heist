import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../services/supabaseClient';
import { type IeltsFunnelEventName } from '../../../services/ieltsFunnelAnalytics';

const FUNNEL_STEPS: Array<{ key: string; label: string; events: IeltsFunnelEventName[]; intent: string }> = [
  { key: 'landing', label: 'Landing views', events: ['landing_view'], intent: 'Visitors reached the IELTS public page.' },
  { key: 'start', label: 'Start clicks', events: ['start_free_assessment_click'], intent: 'Visitors clicked into the free assessment.' },
  { key: 'auth', label: 'Auth required', events: ['auth_required_for_diagnostic'], intent: 'Visitors were asked to sign in before continuing.' },
  { key: 'diagnostic_started', label: 'Diagnostic started', events: ['diagnostic_started'], intent: 'A diagnostic task actually began.' },
  { key: 'diagnostic_completed', label: 'Diagnostic completed', events: ['diagnostic_completed'], intent: 'A learner submitted the diagnostic.' },
  { key: 'result_viewed', label: 'Result viewed', events: ['result_viewed'], intent: 'A learner opened their result page.' },
  { key: 'upsell', label: 'Prime upsell clicks', events: ['prime_upsell_click'], intent: 'A learner clicked a Prime offer.' },
  { key: 'checkout', label: 'Checkout started/opened', events: ['checkout_started', 'checkout_opened'], intent: 'Checkout flow was opened or started.' },
  { key: 'activated', label: 'Subscription activated/completed', events: ['subscription_activated', 'checkout_completed'], intent: 'Payment or subscription activation completed.' },
];

type EventRow = {
  event_name: IeltsFunnelEventName;
  created_at: string;
  session_id: string | null;
  route: string | null;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  metadata: Record<string, unknown> | null;
};

type LoadState = 'idle' | 'loading' | 'resetting';

const since = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const dayKey = (date: Date) => date.toISOString().slice(0, 10);
const percentage = (value: number, total: number) => (total === 0 ? 0 : Math.round((value / total) * 1000) / 10);
const displayValue = (value: string | null | undefined) => value?.trim() || 'Direct / unset';

const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '1rem', padding: '1rem', boxShadow: '0 1px 3px rgba(15,23,42,0.06)' };
const muted: React.CSSProperties = { color: '#64748b', fontSize: '0.82rem' };

const IeltsFunnelAnalytics: React.FC = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<EventRow[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadRows = async () => {
    setState('loading');
    setError(null);
    const { data, error: loadError } = await supabase
      .from('ielts_funnel_events')
      .select('event_name, created_at, session_id, route, source, medium, campaign, metadata')
      .order('created_at', { ascending: false });
    if (loadError) setError(loadError.message);
    else setRows((data || []) as EventRow[]);
    setState('idle');
  };

  useEffect(() => { void loadRows(); }, []);

  const resetEvents = async () => {
    if (!window.confirm('Reset IELTS funnel analytics? This permanently deletes every tracked funnel test/event row.')) return;
    setState('resetting');
    setError(null);
    setNotice(null);
    const { error: resetError } = await supabase.from('ielts_funnel_events').delete().not('created_at', 'is', null);
    if (resetError) {
      setError(resetError.message);
      setState('idle');
      return;
    }
    setRows([]);
    setNotice('IELTS funnel events reset. New trials will start from a clean dashboard.');
    setState('idle');
  };

  const metrics = useMemo(() => {
    const count = (events: IeltsFunnelEventName[], start?: Date) => rows.filter((row) => events.includes(row.event_name) && (!start || new Date(row.created_at) >= start)).length;
    const last24 = since(1);
    const last7 = since(7);
    const dailyKeys = Array.from({ length: 7 }, (_, index) => dayKey(since(6 - index)));
    const total = rows.length;
    const uniqueSessions = new Set(rows.map((row) => row.session_id).filter(Boolean)).size;
    const first = rows.length ? rows[rows.length - 1].created_at : null;
    const latest = rows[0]?.created_at ?? null;
    const group = (getKey: (row: EventRow) => string) => Object.entries(rows.reduce<Record<string, number>>((acc, row) => {
      const key = getKey(row);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return {
      total,
      uniqueSessions,
      first,
      latest,
      stepRows: FUNNEL_STEPS.map((step, index) => {
        const all = count(step.events);
        const prev = index > 0 ? count(FUNNEL_STEPS[index - 1].events) : 0;
        return { ...step, last24: count(step.events, last24), last7: count(step.events, last7), all, share: percentage(all, total), conversion: index === 0 || prev === 0 ? null : percentage(all, prev) };
      }),
      daily: dailyKeys.map((date) => ({ date, count: rows.filter((row) => dayKey(new Date(row.created_at)) === date).length })),
      byEvent: group((row) => row.event_name),
      bySource: group((row) => displayValue(row.source)),
      byRoute: group((row) => displayValue(row.route)),
      byPlan: group((row) => displayValue(typeof row.metadata?.plan === 'string' ? row.metadata.plan : null)),
    };
  }, [rows]);

  const busy = state === 'loading' || state === 'resetting';

  return (
    <main style={{ minHeight: '100vh', background: '#f8fafc', color: '#0f172a', padding: '1.5rem', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <section style={{ maxWidth: 1180, margin: '0 auto' }}>
        <button type="button" onClick={() => navigate('/ielts')} style={{ border: 'none', background: 'transparent', color: '#2563eb', cursor: 'pointer', fontWeight: 800, marginBottom: '1rem' }}>← Back to IELTS Control Center</button>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#0891b2' }}>IELTS Analytics</p>
            <h1 style={{ margin: '0.25rem 0 0.5rem', fontSize: '2rem', fontWeight: 950 }}>Launch funnel</h1>
            <p style={{ margin: '0 0 1.25rem', color: '#64748b' }}>A clearer operational view of funnel health: step conversion, daily volume, events, traffic sources, routes, and offer plans. No names, emails, answers, essays, recordings, or feedback are shown.</p>
          </div>
          <button type="button" disabled={busy || rows.length === 0} onClick={resetEvents} style={{ border: '1px solid #fecaca', background: rows.length === 0 ? '#f8fafc' : '#fee2e2', color: rows.length === 0 ? '#94a3b8' : '#991b1b', borderRadius: '0.85rem', padding: '0.75rem 1rem', fontWeight: 900, cursor: busy || rows.length === 0 ? 'not-allowed' : 'pointer' }}>{state === 'resetting' ? 'Resetting…' : 'Reset test trials'}</button>
        </div>

        {state === 'loading' ? <p>Loading funnel analytics…</p> : null}
        {notice ? <div style={{ ...cardStyle, borderColor: '#bbf7d0', background: '#f0fdf4', color: '#166534', marginBottom: '1rem' }}>{notice}</div> : null}
        {error ? <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 12, padding: '1rem', color: '#991b1b', marginBottom: '1rem' }}>{error}</div> : null}

        {!busy && !error ? (
          <>
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={cardStyle}><div style={muted}>Total events</div><strong style={{ fontSize: '2rem' }}>{metrics.total}</strong></div>
              <div style={cardStyle}><div style={muted}>Unique sessions</div><strong style={{ fontSize: '2rem' }}>{metrics.uniqueSessions}</strong></div>
              <div style={cardStyle}><div style={muted}>First event</div><strong>{metrics.first ? new Date(metrics.first).toLocaleString() : '—'}</strong></div>
              <div style={cardStyle}><div style={muted}>Latest event</div><strong>{metrics.latest ? new Date(metrics.latest).toLocaleString() : '—'}</strong></div>
            </section>

            <div style={{ overflowX: 'auto', ...cardStyle, padding: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
                <thead><tr style={{ background: '#f1f5f9', color: '#475569', textAlign: 'left' }}><th style={{ padding: '0.8rem' }}>Step</th><th>What it means</th><th>Last 24h</th><th>Last 7d</th><th>All time</th><th>Share</th><th>Step conversion</th></tr></thead>
                <tbody>{metrics.stepRows.map((step, index) => (<tr key={step.key} style={{ borderTop: '1px solid #e2e8f0' }}><td style={{ padding: '0.8rem', fontWeight: 900 }}>{index + 1}. {step.label}</td><td style={muted}>{step.intent}</td><td>{step.last24}</td><td>{step.last7}</td><td>{step.all}</td><td>{step.share}%</td><td style={{ fontWeight: 900, color: step.conversion !== null && step.conversion < 50 ? '#b45309' : '#166534' }}>{step.conversion === null ? '—' : `${step.conversion}%`}</td></tr>))}</tbody>
              </table>
            </div>

            <section style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem' }}>
              {metrics.daily.map((day) => <div key={day.date} style={cardStyle}><div style={muted}>{day.date}</div><strong style={{ fontSize: '1.4rem' }}>{day.count}</strong><div style={{ height: 6, background: '#e0f2fe', borderRadius: 999, marginTop: '0.6rem' }}><div style={{ height: '100%', width: `${percentage(day.count, Math.max(...metrics.daily.map((d) => d.count), 1))}%`, background: '#0891b2', borderRadius: 999 }} /></div></div>)}
            </section>

            <section style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
              {[
                ['Event breakdown', metrics.byEvent], ['Traffic sources', metrics.bySource], ['Routes', metrics.byRoute], ['Plans clicked', metrics.byPlan],
              ].map(([title, items]) => <Breakdown key={title as string} title={title as string} items={items as [string, number][] } total={metrics.total} />)}
            </section>
          </>
        ) : null}
      </section>
    </main>
  );
};

const Breakdown: React.FC<{ title: string; items: [string, number][]; total: number }> = ({ title, items, total }) => (
  <div style={cardStyle}>
    <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>{title}</h2>
    {items.length === 0 ? <p style={muted}>No data yet.</p> : items.map(([label, count]) => (
      <div key={label} style={{ marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', fontSize: '0.85rem' }}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span><strong>{count}</strong></div>
        <div style={{ height: 6, background: '#e2e8f0', borderRadius: 999, marginTop: '0.35rem' }}><div style={{ width: `${percentage(count, total)}%`, height: '100%', borderRadius: 999, background: '#6366f1' }} /></div>
      </div>
    ))}
  </div>
);

export default IeltsFunnelAnalytics;
