import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import {
  claimGuardianInvitation,
  getGuardianChildProgress,
  getGuardianChildren,
  parentGoogleSignIn,
  parentSignIn,
  parentSignOut,
  parentSignUp,
  type GuardianChild,
  type GuardianChildProgress,
} from '../../services/guardianService';
import { SchoolBrand } from '../../src/components/SchoolBrand';
import { createSchoolBrand } from '../../src/lib/schoolBranding';
import './ParentPortal.css';

const fmtDate = (value?: string | null) => value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const focusCopy = (status: string) => status === 'persistent' ? 'Needs continued attention' : status === 'recurring' ? 'Recurring area for development' : 'New area for development';

const ParentPortal: React.FC = () => {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const inviteToken = params.get('invite') || '';
  const [sessionReady, setSessionReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [children, setChildren] = useState<GuardianChild[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [progress, setProgress] = useState<GuardianChildProgress | null>(null);
  const [days, setDays] = useState(90);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => { if (mounted) { setSignedIn(Boolean(data.session)); setSessionReady(true); } });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session)));
    return () => { mounted = false; data.subscription.unsubscribe(); };
  }, []);

  const loadChildren = async () => {
    setLoading(true); setError(null);
    try {
      const list = await getGuardianChildren(); setChildren(list);
      if (!selectedId && list.length) setSelectedId(list[0].student_id);
    } catch (err) { setError(err instanceof Error ? err.message : 'Children could not be loaded.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (signedIn) void loadChildren(); }, [signedIn]);

  useEffect(() => {
    if (!signedIn || !inviteToken || claiming) return;
    setClaiming(true); setError(null);
    void claimGuardianInvitation(inviteToken)
      .then(async (result) => {
        setMessage('Parent access confirmed. You can now follow this child’s academic progress.');
        if (result.student_id) setSelectedId(result.student_id);
        const url = new URL(window.location.href); url.searchParams.delete('invite'); window.history.replaceState(null, '', `${url.pathname}${url.search}`);
        await loadChildren();
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'This invitation could not be accepted.'))
      .finally(() => setClaiming(false));
  }, [signedIn, inviteToken]);

  useEffect(() => {
    if (!signedIn || !selectedId) { setProgress(null); return; }
    setLoading(true); setError(null);
    void getGuardianChildProgress(selectedId, days)
      .then(setProgress)
      .catch((err) => setError(err instanceof Error ? err.message : 'Progress could not be loaded.'))
      .finally(() => setLoading(false));
  }, [signedIn, selectedId, days]);

  const submitAuth = async (event: React.FormEvent) => {
    event.preventDefault(); setError(null); setMessage(null); setLoading(true);
    try {
      if (authMode === 'signin') await parentSignIn(email, password);
      else {
        const result = await parentSignUp(email, password, window.location.href);
        if (result.confirmationRequired) setMessage('Check your email to confirm the account, then return to this invitation link.');
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Authentication failed.'); }
    finally { setLoading(false); }
  };

  if (!sessionReady) return <main className="parent-portal"><div className="parent-loading">Preparing secure parent access…</div></main>;
  if (!signedIn) return <main className="parent-portal parent-auth-shell"><section className="parent-auth-card"><div className="parent-brand"><span>BH</span><div><strong>Brain Heist Parent</strong><small>Secure school progress access</small></div></div><h1>{inviteToken ? 'Connect to your child’s school progress' : 'Parent sign in'}</h1><p>{inviteToken ? 'Use the same email address the school invited. Your account will only show children the school has explicitly linked to you.' : 'Sign in to view children already linked to your verified parent or guardian account.'}</p>{error ? <div className="parent-alert is-error">{error}</div> : null}{message ? <div className="parent-alert">{message}</div> : null}<form onSubmit={submitAuth}><label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label><label>Password<input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></label><button type="submit" disabled={loading}>{loading ? 'Please wait…' : authMode === 'signin' ? 'Sign in' : 'Create parent account'}</button></form><button className="parent-google" type="button" onClick={() => void parentGoogleSignIn(window.location.href)}>Continue with Google</button><button className="parent-link" type="button" onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}>{authMode === 'signin' ? 'New parent? Create an account' : 'Already have an account? Sign in'}</button><small className="parent-security-note">The school invitation is email-bound, expires automatically, and can be revoked by the school.</small></section></main>;

  const currentChild = children.find((child) => child.student_id === selectedId);
  const summary = progress?.summary;
  const brand = createSchoolBrand({ schoolId: currentChild?.school_id, schoolName: currentChild?.school_name, schoolLogoUrl: currentChild?.school_logo_url });

  return <main className="parent-portal">
    <header className="parent-header"><div className="parent-school-identity"><SchoolBrand brand={brand} className="parent-school-brand" imageClassName="parent-school-logo" /><small>Parent Portal · My Children</small></div><div><select value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={30}>30 days</option><option value={90}>90 days</option><option value={180}>180 days</option><option value={365}>12 months</option></select><button onClick={() => void parentSignOut()}>Sign out</button></div></header>
    {error ? <div className="parent-alert is-error">{error}</div> : null}{message ? <div className="parent-alert">{message}</div> : null}
    <div className="parent-layout">
      <aside><h2>My Children</h2>{children.map((child) => <button className={child.student_id === selectedId ? 'active' : ''} key={child.relationship_id} onClick={() => setSelectedId(child.student_id)}><strong>{child.student_name}</strong><small>{child.relationship_label} · Class {child.class_name || '—'}</small></button>)}{!children.length && !loading ? <p>No children are linked yet. Use the secure invitation sent by the school.</p> : null}</aside>
      <section className="parent-content">
        {loading && !progress ? <div className="parent-loading">Loading academic progress…</div> : null}
        {progress ? <>
          <section className="parent-hero"><div><span>Your child’s progress</span><h1>{progress.child.name}</h1><p>Grade {progress.child.grade || '—'} · Class {progress.child.class_name || '—'} · Last {progress.period.days} days</p></div><div><small>Assignment average</small><strong>{summary?.assignment_average == null ? '—' : `${summary.assignment_average}%`}</strong><span>{summary?.completed_assignments || 0} completed assignments</span></div></section>
          <section className="parent-kpis"><article><span>Needs attention</span><strong>{(summary?.persistent_focus_count || 0) + (summary?.recurring_focus_count || 0)}</strong><small>Repeated areas for development</small></article><article><span>Improving</span><strong>{summary?.improving_count || 0}</strong><small>Areas moving positively</small></article><article><span>Resolved</span><strong>{summary?.resolved_count || 0}</strong><small>Previous needs now secure</small></article><article><span>Strengths</span><strong>{summary?.strength_count || 0}</strong><small>Current academic strengths</small></article><article><span>Overdue work</span><strong>{summary?.overdue_assignments || 0}</strong><small>Work past its due date</small></article></section>
          <section className="parent-panel"><div className="parent-panel-title"><div><span>Where support is needed</span><h2>Current focus areas</h2></div><p>Repeated evidence is prioritised. One isolated low result is not labelled as a persistent problem.</p></div>{progress.focus_areas.length ? <div className="parent-focus-grid">{progress.focus_areas.map((item) => <article key={`${item.subject}:${item.skill}`} className={`priority-${item.priority}`}><span>{item.subject}</span><h3>{item.skill}</h3><strong>{focusCopy(item.status)}</strong><p>Seen across {item.evidence_items} assessed activit{item.evidence_items === 1 ? 'y' : 'ies'} · first identified {fmtDate(item.first_observed_at)} · latest evidence {fmtDate(item.last_observed_at)}</p>{item.latest_evidence_percentage != null ? <small>Latest assessed result: {item.latest_evidence_percentage}%</small> : null}</article>)}</div> : <div className="parent-empty">No recurring or persistent areas for development are currently identified.</div>}</section>
          <section className="parent-panel"><div className="parent-panel-title"><div><span>Progress story</span><h2>Improving, resolved and strong</h2></div></div><div className="parent-three"><div><h3>Improving</h3>{progress.improving.map((x) => <p key={`${x.subject}:${x.skill}`}><strong>{x.skill}</strong><span>{x.subject} · updated {fmtDate(x.last_observed_at)}</span></p>)}</div><div><h3>Resolved</h3>{progress.resolved.map((x) => <p key={`${x.subject}:${x.skill}`}><strong>{x.skill}</strong><span>{x.subject} · latest evidence {fmtDate(x.last_observed_at)}</span></p>)}</div><div><h3>Strengths</h3>{progress.strengths.map((x) => <p key={`${x.subject}:${x.skill}`}><strong>{x.skill}</strong><span>{x.subject}</span></p>)}</div></div></section>
          <section className="parent-panel"><div className="parent-panel-title"><div><span>By subject</span><h2>Academic picture</h2></div></div><div className="parent-subject-grid">{progress.subjects.map((s) => <article key={s.subject}><h3>{s.subject}</h3><strong>{s.assignment_average == null ? 'No recent mark' : `${s.assignment_average}%`}</strong><p>{s.completed_assignments} completed · {s.persistent_focus_count} persistent · {s.improving_count} improving · {s.strength_count} strengths</p></article>)}</div></section>
          <section className="parent-panel"><div className="parent-panel-title"><div><span>Recent schoolwork</span><h2>Assignment results</h2></div></div><div className="parent-table-wrap"><table><thead><tr><th>Date</th><th>Subject</th><th>Assignment</th><th>Topic</th><th>Result</th></tr></thead><tbody>{progress.recent_assignments.map((a) => <tr key={`${a.assignment_id}:${a.completed_at}`}><td>{fmtDate(a.completed_at)}</td><td>{a.subject}</td><td>{a.title}</td><td>{a.topic}</td><td><strong>{a.accuracy}%</strong> <small>({a.correct}/{a.correct + a.incorrect})</small></td></tr>)}</tbody></table></div></section>
          <section className="parent-panel"><div className="parent-panel-title"><div><span>Progress over time</span><h2>Learning timeline</h2></div><p>This parent view shows assessed school evidence only. This view excludes internal staff notes — private staff records remain internal.</p></div><div className="parent-timeline">{progress.timeline.slice(0, 40).map((t) => <article key={t.id}><time>{fmtDate(t.observed_at)}</time><div><strong>{t.skill}</strong><span>{t.subject} · {t.observation_type === 'focus' ? 'area for development' : t.observation_type === 'strength' ? 'strength' : 'developing'}{t.evidence_percentage == null ? '' : ` · ${t.evidence_percentage}%`}</span></div></article>)}</div></section>
        </> : null}
      </section>
    </div>
  </main>;
};

export default ParentPortal;
