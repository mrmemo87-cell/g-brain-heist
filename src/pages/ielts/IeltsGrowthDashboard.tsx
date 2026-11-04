import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../../styles/ielts-course.css';
import { supabase } from '../../../services/supabaseClient';

/** Owner-only: which IELTS ad campaigns bring visitors, sign-ups, learners who clear Unit 1 and Prime buyers. */

type Row = { campaign: string; source: string | null; visitors: number; signups: number; started: number; cleared: number; paid: number };
type Report = {
  days: number;
  totals: { visitors: number; signups: number; started: number; cleared: number; paid: number; active_prime: number };
  campaigns: Row[];
  daily: { day: string; visitors: number; signups: number }[];
};

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((100 * a) / b)}%` : '–');
const STAGES: { key: keyof Report['totals']; label: string; hint: string }[] = [
  { key: 'visitors', label: 'Landing visitors', hint: 'People who opened /ielts-prep' },
  { key: 'signups', label: 'Signed up', hint: 'New IELTS learners without a school' },
  { key: 'started', label: 'Started a lesson', hint: 'Opened a course lesson' },
  { key: 'cleared', label: 'Cleared Unit 1 or V1', hint: 'Finished a free lesson' },
  { key: 'paid', label: 'Bought Prime', hint: 'New Prime subscriptions' },
];

const IeltsGrowthDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    supabase.rpc('rpc_ielts_growth_report', { p_days: days }).then(({ data, error: e }) => {
      if (!alive) return;
      if (e) setError(e.message.includes('not_authorized') ? 'This page is for the Brains Heist owner only.' : 'The report could not load.');
      else setReport(data as Report);
    });
    return () => { alive = false; };
  }, [days]);

  const maxDaily = useMemo(() => Math.max(1, ...(report?.daily ?? []).map((d) => Math.max(d.visitors, d.signups))), [report]);
  const top = report?.totals.visitors || report?.totals.signups || 1;

  return (
    <div className="ic-page">
      <main className="ic-main gd">
        <header className="gd-head">
          <button type="button" className="ic-link" onClick={() => navigate('/ielts/course')}>← IELTS</button>
          <h1>IELTS growth</h1>
          <p className="ic-muted">From ad to payment, for learners without a school. Tag ad links like <code>/ielts-prep?utm_source=instagram&amp;utm_campaign=nov</code>.</p>
          <div className="gd-range" role="group" aria-label="Period">
            {[7, 30, 90].map((d) => <button key={d} type="button" aria-pressed={days === d} className={days === d ? 'is-on' : ''} onClick={() => setDays(d)}>{d} days</button>)}
          </div>
        </header>

        {error && <div className="ic-notice ic-notice--error" role="alert"><b>{error}</b></div>}
        {!report && !error && <div className="ic-skeleton" style={{ height: 260 }} aria-busy="true" />}

        {report && (
          <>
            <section className="gd-funnel" aria-label="Funnel">
              {STAGES.map((s, i) => {
                const value = report.totals[s.key];
                const prev = i > 0 ? report.totals[STAGES[i - 1]!.key] : null;
                return (
                  <div key={s.key} className="gd-stage">
                    <div className="gd-stage-top"><b>{s.label}</b><span>{value}</span></div>
                    <div className="gd-bar"><span style={{ width: `${Math.max(3, (100 * value) / top)}%` }} /></div>
                    <small>{s.hint}{prev !== null ? ` · ${pct(value, prev)} of previous step` : ''}</small>
                  </div>
                );
              })}
              <p className="gd-note">Active Prime subscribers right now: <b>{report.totals.active_prime}</b></p>
            </section>

            <section className="ic-card">
              <h2>Daily</h2>
              <div className="gd-chart" role="img" aria-label="Daily landing visitors and sign-ups">
                {report.daily.map((d) => (
                  <div key={d.day} className="gd-col" title={`${d.day}: ${d.visitors} visitors, ${d.signups} sign-ups`}>
                    <span className="gd-v" style={{ height: `${(100 * d.visitors) / maxDaily}%` }} />
                    <span className="gd-s" style={{ height: `${(100 * d.signups) / maxDaily}%` }} />
                  </div>
                ))}
              </div>
              <p className="gd-legend"><span className="gd-key gd-key--v" /> visitors <span className="gd-key gd-key--s" /> sign-ups</p>
            </section>

            <section className="ic-card">
              <h2>By campaign</h2>
              {report.campaigns.length === 0 ? <p className="ic-muted">No data yet. Visits appear here as soon as people open the landing page.</p> : (
                <div className="gd-table-wrap">
                  <table className="gd-table">
                    <thead><tr><th>Campaign</th><th>Visitors</th><th>Sign-ups</th><th>Started</th><th>Cleared</th><th>Paid</th><th>Visit → paid</th></tr></thead>
                    <tbody>
                      {report.campaigns.map((c) => (
                        <tr key={c.campaign}>
                          <td><b>{c.campaign}</b>{c.source && c.source !== c.campaign ? <small> · {c.source}</small> : null}</td>
                          <td>{c.visitors}</td><td>{c.signups}</td><td>{c.started}</td><td>{c.cleared}</td><td><b>{c.paid}</b></td>
                          <td>{pct(c.paid, c.visitors || c.signups)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="gd-note">Sign-ups are matched to the first campaign a learner arrived with. Learners who never used a tagged link count as "(direct or unknown)".</p>
            </section>
          </>
        )}
      </main>
    </div>
  );
};

export default IeltsGrowthDashboard;
