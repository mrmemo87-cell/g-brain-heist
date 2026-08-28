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
import ParentAcademicYearDashboard from './ParentAcademicYearDashboard';
import './ParentPortal.css';

// ParentAcademicYearDashboard preserves the ParentDashboardPremium experience while making academic year and subject scope authoritative.
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
      .catch((err) => setError(safeMessage(err, 'We could not open this current school-year progress view just now. Please try again.')))
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

  return <ParentAcademicYearDashboard
    children={children}
    selectedId={selectedId}
    progress={progress}
    days={days}
    loading={loading}
    error={error}
    message={message}
    onSelectChild={setSelectedId}
    onChangeDays={setDays}
    onRetry={() => void loadChildren()}
    onSignOut={() => void signOut()}
    onChooseWorkspace={onChooseWorkspace}
  />;
};

export default ParentPortal;
