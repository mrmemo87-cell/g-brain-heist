import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../services/supabaseClient';
import { IELTS_FUNNEL_EVENTS, type IeltsFunnelEventName } from '../../../services/ieltsFunnelAnalytics';

const FUNNEL_STEPS: Array<{ key: string; label: string; events: IeltsFunnelEventName[] }> = [
  { key: 'landing', label: 'Landing views', events: ['landing_view'] },
  { key: 'start', label: 'Start clicks', events: ['start_free_assessment_click'] },
  { key: 'auth', label: 'Auth required', events: ['auth_required_for_diagnostic'] },
  { key: 'diagnostic_started', label: 'Diagnostic started', events: ['diagnostic_started'] },
  { key: 'diagnostic_completed', label: 'Diagnostic completed', events: ['diagnostic_completed'] },
  { key: 'result_viewed', label: 'Result viewed', events: ['result_viewed'] },
  { key: 'upsell', label: 'Prime upsell clicks', events: ['prime_upsell_click'] },
  { key: 'checkout', label: 'Checkout started/opened', events: ['checkout_started', 'checkout_opened'] },
  { key: 'activated', label: 'Subscription activated/completed', events: ['subscription_activated', 'checkout_completed'] },
];

type EventRow = { event_name: IeltsFunnelEventName; created_at: string };

const since = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const dayKey = (date: Date) => date.toISOString().slice(0, 10);

const IeltsFunnelAnalytics: React.FC = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const { data, error: loadError } = await supabase
        .from('ielts_funnel_events')
        .select('event_name, created_at')
        .order('created_at', { ascending: false });
      if (!active) return;
      if (loadError) setError(loadError.message);
      else setRows((data || []) as EventRow[]);
      setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, []);

  const metrics = useMemo(() => {
    const count = (events: IeltsFunnelEventName[], start?: Date) => rows.filter((row) => events.includes(row.event_name) && (!start || new Date(row.created_at) >= start)).length;
    const last24 = since(1);
    const last7 = since(7);
    const dailyKeys = Array.from({ length: 7 }, (_, index) => dayKey(since(6 - index)));
    return {
      count,
      stepRows: FUNNEL_STEPS.map((step, index) => {
        const all = count(step.events);
        const prev = index > 0 ? count(FUNNEL_STEPS[index - 1].events) : 0;
        return { ...step, last24: count(step.events, last24), last7: count(step.events, last7), all, conversion: index === 0 || prev === 0 ? null : Math.round((all / prev) * 1000) / 10 };
      }),
      daily: dailyKeys.map((date) => ({ date, count: rows.filter((row) => dayKey(new Date(row.created_at)) === date).length })),
    };
  }, [rows]);

  return (
    <main style={{ minHeight: '100vh', background: '#f8fafc', color: '#0f172a', padding: '1.5rem', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <section style={{ maxWidth: 1080, margin: '0 auto' }}>
        <button type="button" onClick={() => navigate('/ielts')} style={{ border: 'none', background: 'transparent', color: '#2563eb', cursor: 'pointer', fontWeight: 800, marginBottom: '1rem' }}>← Back to IELTS Control Center</button>
        <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#0891b2' }}>IELTS Analytics</p>
        <h1 style={{ margin: '0.25rem 0 0.5rem', fontSize: '2rem', fontWeight: 950 }}>Launch funnel</h1>
        <p style={{ margin: '0 0 1.25rem', color: '#64748b' }}>Aggregated event counts only. No names, emails, answers, essays, recordings, or feedback are shown.</p>

        {loading ? <p>Loading funnel analytics…</p> : null}
        {error ? <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 12, padding: '1rem', color: '#991b1b' }}>{error}</div> : null}

        {!loading && !error ? (
          <>
            <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '1rem', boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                <thead><tr style={{ background: '#f1f5f9', color: '#475569', textAlign: 'left' }}><th style={{ padding: '0.8rem' }}>Step</th><th>Last 24h</th><th>Last 7d</th><th>All time</th><th>Step conversion</th></tr></thead>
                <tbody>
                  {metrics.stepRows.map((step, index) => (
                    <tr key={step.key} style={{ borderTop: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '0.8rem', fontWeight: 900 }}>{index + 1}. {step.label}</td>
                      <td>{step.last24}</td><td>{step.last7}</td><td>{step.all}</td><td>{step.conversion === null ? '—' : `${step.conversion}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <section style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem' }}>
              {metrics.daily.map((day) => <div key={day.date} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '0.9rem', padding: '0.85rem' }}><div style={{ color: '#64748b', fontSize: '0.8rem' }}>{day.date}</div><strong style={{ fontSize: '1.4rem' }}>{day.count}</strong></div>)}
            </section>
          </>
        ) : null}
      </section>
    </main>
  );
};

export default IeltsFunnelAnalytics;
