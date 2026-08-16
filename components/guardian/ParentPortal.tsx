import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import {
  claimGuardianInvitation,
  getGuardianChildProgress,
  getGuardianChildren,
  getGuardianInvitationPreview,
  parentGoogleSignIn,
  parentSignIn,
  parentSignOut,
  parentSignUp,
  type GuardianChild,
  type GuardianChildProgress,
  type GuardianInvitationPreview,
} from '../../services/guardianService';
import { SchoolBrand } from '../../src/components/SchoolBrand';
import { createSchoolBrand, PRODUCT_LOGO_URL, PRODUCT_NAME } from '../../src/lib/schoolBranding';
import './ParentPortal.css';

const fmtDate = (value?: string | null) => value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const focusCopy = (status: string) => status === 'persistent' ? 'Needs continued attention' : status === 'recurring' ? 'Recurring area for development' : 'New area for development';
const safeMessage = (err: unknown, fallback: string) => err instanceof Error && err.message ? err.message : fallback;

const BrainsHeistMark = ({ compact = false }: { compact?: boolean }) => <span className={`parent-product-brand ${compact ? 'is-compact' : ''}`}><img src={PRODUCT_LOGO_URL} alt={`${PRODUCT_NAME} logo`} /><span><strong>{PRODUCT_NAME}</strong><small>Academic progress platform</small></span></span>;

interface ParentPortalProps {
  onChooseWorkspace?: () => void;
  onLogout?: () => void;
}

const ParentPortal: React.FC<ParentPortalProps> = ({ onChooseWorkspace, onLogout }) => {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const inviteToken = params.get('invite') || '';
  const [sessionReady, setSessionReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [sessionEmail, setSessionEmail] = useState('');
  const [preview, setPreview] = useState<GuardianInvitationPreview | null>(null);
  const [previewReady, setPreviewReady] = useState(!inviteToken);
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
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSignedIn(Boolean(data.session));
      setSessionEmail(data.session?.user?.email || '');
      setSessionReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
      setSessionEmail(session?.user?.email || '');
    });
    return () => { mounted = false; data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!inviteToken) { setPreviewReady(true); return; }
    if (!sessionReady) return;
    let mounted = true;
    setPreviewReady(false);
    void getGuardianInvitationPreview(inviteToken)
      .then((value) => { if (mounted) setPreview(value); })
      .catch(() => { if (mounted) setPreview({ valid: false, status: 'not_found' }); })
      .finally(() => { if (mounted) setPreviewReady(true); });
    return () => { mounted = false; };
  }, [inviteToken, sessionReady, signedIn]);

  const loadChildren = async () => {
    setLoading(true); setError(null);
    try {
      const list = await getGuardianChildren(); setChildren(list);
      if (!selectedId && list.length) setSelectedId(list[0].student_id);
    } catch (err) { setError(safeMessage(err, 'We could not open your family dashboard just now. Please try again.')); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    if (signedIn && (!inviteToken || preview?.email_matches_current_account !== false)) void loadChildren();
  }, [signedIn, inviteToken, preview?.email_matches_current_account]);

  useEffect(() => {
    if (!signedIn || !inviteToken || claiming || (preview && preview.status !== 'ready') || preview?.email_matches_current_account === false) return;
    setClaiming(true); setError(null);
    void claimGuardianInvitation(inviteToken)
      .then(async (result) => {
        setMessage('Access confirmed. Your child’s school progress is now connected to this account.');
        if (result.student_id) setSelectedId(result.student_id);
        const url = new URL(window.location.href); url.searchParams.delete('invite'); window.history.replaceState(null, '', `${url.pathname}${url.search}`);
        await loadChildren();
      })
      .catch((err) => setError(safeMessage(err, 'We could not confirm this invitation. Please ask the school to check your parent access.')))
      .finally(() => setClaiming(false));
  }, [signedIn, inviteToken, preview?.status, preview?.email_matches_current_account]);

  useEffect(() => {
    if (!signedIn || !selectedId) { setProgress(null); return; }
    setLoading(true); setError(null);
    void getGuardianChildProgress(selectedId, days)
      .then(setProgress)
      .catch((err) => setError(safeMessage(err, 'We could not open this progress view just now. Please try again.')))
      .finally(() => setLoading(false));
  }, [signedIn, selectedId, days]);

  const submitAuth = async (event: React.FormEvent) => {
    event.preventDefault(); setError(null); setMessage(null); setLoading(true);
    try {
      if (authMode === 'signin') await parentSignIn(email, password);
      else {
        const result = await parentSignUp(email, password, window.location.href);
        if (result.confirmationRequired) setMessage('Almost there — please confirm your email, then return to this invitation to finish connecting your child.');
      }
    } catch (err) { setError(safeMessage(err, 'We could not complete that sign-in step. Please try again.')); }
    finally { setLoading(false); }
  };

  const switchAccount = async () => {
    setLoading(true); setError(null); setMessage(null);
    try {
      await parentSignOut();
      setChildren([]); setSelectedId(null); setProgress(null); setEmail(''); setPassword('');
    } catch (err) {
      setError(safeMessage(err, 'We could not switch accounts just now. Please sign out and reopen this invitation.'));
    } finally { setLoading(false); }
  };

  const signOut = async () => {
    if (onLogout) {
      onLogout();
      return;
    }
    await parentSignOut();
  };

  const invitationBrand = createSchoolBrand({ schoolId: preview?.school?.id, schoolName: preview?.school?.name, schoolLogoUrl: preview?.school?.logo_url });
  const invitationUnavailable = inviteToken && previewReady && preview && preview.status !== 'ready';
  const accountMismatch = Boolean(signedIn && inviteToken && preview?.status === 'ready' && preview.email_matches_current_account === false);

  if (!sessionReady || !previewReady) return <main className="parent-portal parent-auth-shell"><section className="parent-premium-loader"><BrainsHeistMark /><div className="parent-loader-ring" /><strong>Preparing your secure school invitation</strong><small>This will only take a moment.</small></section></main>;

  if (accountMismatch) return <main className="parent-portal parent-auth-shell">
    <section className="parent-invite-layout">
      <div className="parent-invite-brand-panel">
        <div className="parent-co-brand">
          {preview?.school ? <SchoolBrand brand={invitationBrand} className="parent-invite-school" imageClassName="parent-invite-school-logo" /> : <span className="parent-invite-school"><span className="parent-invite-school-logo fallback">S</span><strong>Your school</strong></span>}
          <span className="parent-brand-divider" aria-hidden="true" />
          <BrainsHeistMark compact />
        </div>
        <span className="parent-invite-eyebrow">Secure parent access</span>
        <h1>This invitation belongs to another account</h1>
        <p>{preview?.school?.name || 'The school'} invited {preview?.invited_email_hint || 'a different email address'} to follow {preview?.student?.name || 'this student'}’s progress.</p>
        {preview?.student ? <div className="parent-invite-child"><span>Student</span><strong>{preview.student.name}</strong><small>{preview.student.grade ? `Grade ${preview.student.grade}` : ''}{preview.student.grade && preview.student.class_name ? ' · ' : ''}{preview.student.class_name ? `Class ${preview.student.class_name}` : ''}</small></div> : null}
        <div className="parent-trust-list"><span>✓ No child has been linked to the wrong account</span><span>✓ Your invitation remains active while you switch accounts</span><span>✓ Parent access stays bound to the invited email</span></div>
      </div>
      <section className="parent-auth-card premium">
        <div className="parent-auth-heading"><span>Account check</span><h2>Switch to the invited parent email</h2><p>This browser is currently signed in as <strong>{sessionEmail || 'another Brains Heist account'}</strong>, but the invitation was issued to <strong>{preview?.invited_email_hint || 'a different email address'}</strong>.</p></div>
        <div className="parent-alert is-error"><strong>Account doesn’t match the invitation</strong><span>For privacy, Brains Heist will never attach a student to a different signed-in account.</span></div>
        {error ? <div className="parent-alert is-error"><strong>We couldn’t switch accounts</strong><span>{error}</span></div> : null}
        <button className="parent-google" type="button" disabled={loading} onClick={() => void switchAccount()}>{loading ? 'Switching account…' : 'Switch account'}</button>
        <small className="parent-security-note">After switching, sign in or create the parent account using {preview?.invited_email_hint || 'the email address invited by the school'}. This invitation is still valid and has not been claimed.</small>
      </section>
    </section>
  </main>;

  if (!signedIn) return <main className="parent-portal parent-auth-shell">
    <section className="parent-invite-layout">
      <div className="parent-invite-brand-panel">
        <div className="parent-co-brand">
          {inviteToken && preview?.school ? <SchoolBrand brand={invitationBrand} className="parent-invite-school" imageClassName="parent-invite-school-logo" /> : <span className="parent-invite-school"><span className="parent-invite-school-logo fallback">S</span><strong>Your school</strong></span>}
          <span className="parent-brand-divider" aria-hidden="true" />
          <BrainsHeistMark compact />
        </div>
        <span className="parent-invite-eyebrow">Secure parent access</span>
        <h1>{invitationUnavailable ? 'This invitation needs attention' : inviteToken ? `You’ve been invited to follow ${preview?.student?.name || 'your child'}’s progress` : 'Your child’s progress, clearly explained'}</h1>
        {invitationUnavailable ? <p>{preview?.status === 'expired' ? 'This invitation has expired. Please ask the school to send you a fresh invitation.' : preview?.status === 'revoked' ? 'This invitation is no longer active. Please contact the school if you still need access.' : preview?.status === 'claimed' ? 'This invitation has already been used. Sign in with the parent account that accepted it.' : 'The invitation link could not be verified. Please ask the school to send you a new one.'}</p> : <p>{inviteToken ? `${preview?.school?.name || 'The school'} has securely invited you to view marks, subject progress, strengths and areas where support may be needed.` : 'A private, school-approved view of academic progress, powered securely by Brains Heist.'}</p>}
        {inviteToken && preview?.student ? <div className="parent-invite-child"><span>Student</span><strong>{preview.student.name}</strong><small>{preview.student.grade ? `Grade ${preview.student.grade}` : ''}{preview.student.grade && preview.student.class_name ? ' · ' : ''}{preview.student.class_name ? `Class ${preview.student.class_name}` : ''}</small></div> : null}
        <div className="parent-trust-list"><span>✓ Only children explicitly linked by the school</span><span>✓ School marks and progress in parent-friendly language</span><span>✓ Private teacher notes remain private</span></div>
      </div>

      <section className="parent-auth-card premium">
        <div className="parent-auth-heading"><span>{inviteToken ? 'Complete your access' : 'Parent portal'}</span><h2>{authMode === 'signin' ? 'Welcome back' : 'Create your parent account'}</h2><p>{inviteToken ? `Use ${preview?.invited_email_hint || 'the email address invited by the school'}.` : 'Sign in to see children already linked to your verified account.'}</p></div>
        {error ? <div className="parent-alert is-error"><strong>We couldn’t complete that step</strong><span>{error}</span></div> : null}
        {message ? <div className="parent-alert"><strong>Check your email</strong><span>{message}</span></div> : null}
        {!invitationUnavailable || preview?.status === 'claimed' ? <>
          <form onSubmit={submitAuth}><label>Email address<input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label><label>Password<input type="password" required minLength={6} autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} /></label><button type="submit" disabled={loading}>{loading ? 'Please wait…' : authMode === 'signin' ? 'Sign in securely' : 'Create secure account'}</button></form>
          <div className="parent-auth-separator"><span>or</span></div>
          <button className="parent-google" type="button" disabled={loading} onClick={() => void parentGoogleSignIn(window.location.href)}>Continue with Google</button>
          <button className="parent-link" type="button" onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}>{authMode === 'signin' ? 'New parent or guardian? Create an account' : 'Already have an account? Sign in'}</button>
        </> : <div className="parent-invite-help"><strong>Please contact {preview?.school?.name || 'the school'}</strong><p>Ask them to issue a new parent invitation. Your academic access remains protected until a valid school invitation is confirmed.</p></div>}
        <small className="parent-security-note">Protected by {preview?.school?.name || 'your school'} and {PRODUCT_NAME}. Invitation access is email-bound, time-limited and revocable by the school.</small>
      </section>
    </section>
  </main>;

  const currentChild = children.find((child) => child.student_id === selectedId);
  const summary = progress?.summary;
  const brand = createSchoolBrand({ schoolId: currentChild?.school_id, schoolName: currentChild?.school_name, schoolLogoUrl: currentChild?.school_logo_url });

  return <main className="parent-portal">
    <header className="parent-header"><div className="parent-school-identity"><div className="parent-dashboard-brand"><SchoolBrand brand={brand} className="parent-school-brand" imageClassName="parent-school-logo" /><span className="parent-brand-divider" /><BrainsHeistMark compact /></div><small>Parent Portal · My Children</small></div><div><select aria-label="Reporting period" value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={180}>Last 6 months</option><option value={365}>Last 12 months</option></select>{onChooseWorkspace ? <button type="button" onClick={onChooseWorkspace}>Switch dashboard</button> : null}<button type="button" onClick={() => void signOut()}>Sign out</button></div></header>
    {error ? <div className="parent-alert is-error"><strong>Something needs your attention</strong><span>{error}</span><button type="button" onClick={() => void loadChildren()}>Try again</button></div> : null}{message ? <div className="parent-alert"><strong>All set</strong><span>{message}</span></div> : null}
    <div className="parent-layout">
      <aside><h2>My Children</h2><p className="parent-aside-note">Choose a child to view their school-approved progress.</p>{children.map((child) => <button className={child.student_id === selectedId ? 'active' : ''} key={child.relationship_id} onClick={() => setSelectedId(child.student_id)}><strong>{child.student_name}</strong><small>{child.relationship_label} · {child.grade ? `Grade ${child.grade} · ` : ''}Class {child.class_name || '—'}</small></button>)}{!children.length && !loading ? <div className="parent-empty-card"><strong>No children are linked yet</strong><p>Open the secure invitation sent by the school, or ask the school to check your parent access.</p></div> : null}</aside>
      <section className="parent-content">
        {loading && !progress ? <div className="parent-loading-card"><div className="parent-loader-ring" /><strong>Preparing academic progress</strong><small>Bringing together the latest school evidence.</small></div> : null}
        {progress ? <>
          <section className="parent-hero"><div><span>Your child’s progress</span><h1>{progress.child.name}</h1><p>Grade {progress.child.grade || '—'} · Class {progress.child.class_name || '—'} · Last {progress.period.days} days</p></div><div><small>Assignment average</small><strong>{summary?.assignment_average == null ? '—' : `${summary.assignment_average}%`}</strong><span>{summary?.completed_assignments || 0} completed assignments</span></div></section>
          <section className="parent-kpis"><article><span>Needs attention</span><strong>{(summary?.persistent_focus_count || 0) + (summary?.recurring_focus_count || 0)}</strong><small>Repeated areas for development</small></article><article><span>Improving</span><strong>{summary?.improving_count || 0}</strong><small>Areas moving positively</small></article><article><span>Resolved</span><strong>{summary?.resolved_count || 0}</strong><small>Previous needs now secure</small></article><article><span>Strengths</span><strong>{summary?.strength_count || 0}</strong><small>Current academic strengths</small></article><article><span>Overdue work</span><strong>{summary?.overdue_assignments || 0}</strong><small>Work past its due date</small></article></section>
          <section className="parent-panel"><div className="parent-panel-title"><div><span>Where support is needed</span><h2>Current focus areas</h2></div><p>Repeated evidence is prioritised. One isolated low result is never labelled as a persistent problem.</p></div>{progress.focus_areas.length ? <div className="parent-focus-grid">{progress.focus_areas.map((item) => <article key={`${item.subject}:${item.skill}`} className={`priority-${item.priority}`}><span>{item.subject}</span><h3>{item.skill}</h3><strong>{focusCopy(item.status)}</strong><p>Seen across {item.evidence_items} assessed activit{item.evidence_items === 1 ? 'y' : 'ies'} · first identified {fmtDate(item.first_observed_at)} · latest evidence {fmtDate(item.last_observed_at)}</p>{item.latest_evidence_percentage != null ? <small>Latest assessed result: {item.latest_evidence_percentage}%</small> : null}</article>)}</div> : <div className="parent-empty">No recurring or persistent areas for development are currently identified.</div>}</section>
          <section className="parent-panel"><div className="parent-panel-title"><div><span>Progress story</span><h2>Improving, resolved and strong</h2></div></div><div className="parent-three"><div><h3>Improving</h3>{progress.improving.map((x) => <p key={`${x.subject}:${x.skill}`}><strong>{x.skill}</strong><span>{x.subject} · updated {fmtDate(x.last_observed_at)}</span></p>)}</div><div><h3>Resolved</h3>{progress.resolved.map((x) => <p key={`${x.subject}:${x.skill}`}><strong>{x.skill}</strong><span>{x.subject} · latest evidence {fmtDate(x.last_observed_at)}</span></p>)}</div><div><h3>Strengths</h3>{progress.strengths.map((x) => <p key={`${x.subject}:${x.skill}`}><strong>{x.skill}</strong><span>{x.subject}</span></p>)}</div></div></section>
          <section className="parent-panel"><div className="parent-panel-title"><div><span>By subject</span><h2>Academic picture</h2></div></div><div className="parent-subject-grid">{progress.subjects.map((s) => <article key={s.subject}><h3>{s.subject}</h3><strong>{s.assignment_average == null ? 'No recent mark' : `${s.assignment_average}%`}</strong><p>{s.completed_assignments} completed · {s.persistent_focus_count} persistent · {s.improving_count} improving · {s.strength_count} strengths</p></article>)}</div></section>
          <section className="parent-panel"><div className="parent-panel-title"><div><span>Recent schoolwork</span><h2>Assignment results</h2></div></div><div className="parent-table-wrap"><table><thead><tr><th>Date</th><th>Subject</th><th>Assignment</th><th>Topic</th><th>Result</th></tr></thead><tbody>{progress.recent_assignments.map((a) => <tr key={`${a.assignment_id}:${a.completed_at}`}><td>{fmtDate(a.completed_at)}</td><td>{a.subject}</td><td>{a.title}</td><td>{a.topic}</td><td><strong>{a.accuracy}%</strong> <small>({a.correct}/{a.correct + a.incorrect})</small></td></tr>)}</tbody></table></div></section>
          <section className="parent-panel"><div className="parent-panel-title"><div><span>Progress over time</span><h2>Learning timeline</h2></div><p>This parent view shows assessed school evidence only. Private staff records remain internal.</p></div><div className="parent-timeline">{progress.timeline.slice(0, 40).map((t) => <article key={t.id}><time>{fmtDate(t.observed_at)}</time><div><strong>{t.skill}</strong><span>{t.subject} · {t.observation_type === 'focus' ? 'area for development' : t.observation_type === 'strength' ? 'strength' : 'developing'}{t.evidence_percentage == null ? '' : ` · ${t.evidence_percentage}%`}</span></div></article>)}</div></section>
        </> : null}
      </section>
    </div>
  </main>;
};

export default ParentPortal;
