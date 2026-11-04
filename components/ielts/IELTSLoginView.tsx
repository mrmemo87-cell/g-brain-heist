import React, { useEffect, useRef, useState } from 'react';
import { GoogleIcon } from '../icons';
import * as IELTSAuthService from '../../services/ieltsAuthService';
import RememberedAccount, { RememberAccountPreference, useRememberedSignIn } from '../auth/RememberedAccount';
import { clearRememberAccountIntent, prepareRememberAccount } from '../../services/rememberedAccount';
import '../../src/styles/ielts.css';

interface IELTSLoginViewProps {
  onAuthenticated: () => void;
}

const IELTSLoginView: React.FC<IELTSLoginViewProps> = ({ onAuthenticated }) => {
  const remembered = useRememberedSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showEmail, setShowEmail] = useState(false);
  // Learners from ads often have no Google account handy: let them create one with email.
  const [creating, setCreating] = useState(false);
  const [fullName, setFullName] = useState('');
  const [checkInbox, setCheckInbox] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.body.classList.add('ielts-theme');
    document.title = 'IELTS Prep Hub | Sign in';
    return () => { document.body.classList.remove('ielts-theme'); };
  }, []);

  const handleGoogleSignIn = async (loginHint?: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setBusy(true);
    try {
      const intent = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      // Route recovery is optional in browsers that block session storage.
      try {
        if (intent.startsWith('/ielts')) window.sessionStorage.setItem('ielts_auth_intent', intent);
      } catch { /* Google sign-in remains available. */ }
      prepareRememberAccount(remembered.remember, 'google');
      await IELTSAuthService.loginWithGoogle(loginHint);
    } catch {
      clearRememberAccountIntent();
      setError('We couldn’t connect to Google. Please try again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const handleEmailSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      prepareRememberAccount(remembered.remember, 'password');
      await IELTSAuthService.login(email.trim(), password);
      onAuthenticated();
    } catch (authError) {
      clearRememberAccountIntent();
      setError(authError instanceof Error ? authError.message : 'Unable to sign in. Please try again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const saveIntent = () => {
    try {
      const intent = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (intent.startsWith('/ielts')) window.sessionStorage.setItem('ielts_auth_intent', intent);
    } catch { /* optional */ }
  };

  const handleCreateAccount = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current) return;
    if (password.length < 8) { setError('Use at least 8 characters for your password.'); return; }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      saveIntent();
      const cleanEmail = email.trim().toLowerCase();
      const base = cleanEmail.split('@')[0]?.replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'learner';
      const { requiresVerification } = await IELTSAuthService.signup({
        email: cleanEmail, password, username: base, fullName: fullName.trim() || undefined,
      });
      if (requiresVerification) setCheckInbox(cleanEmail);
      else onAuthenticated();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Unable to create your account. Please try again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const resetForm = () => {
    setEmail(''); setPassword(''); setShowEmail(false); setError(null);
    window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-auth-google]')?.focus());
  };

  return (
    <main className="ielts-auth-wrapper">
      <div className="ielts-auth-panel">
        <header className="ielts-auth-header">
          <img src="/logo.png" alt="Brains Heist" className="ielts-auth-logo" />
          <div className="ielts-auth-badge">IELTS Prep Hub</div>
          <h1 className="ielts-auth-title">{creating && showEmail ? 'Create your free account.' : remembered.account || showEmail ? 'Welcome back.' : 'Your next IELTS step starts here.'}</h1>
          <p className="ielts-auth-subtitle">
            {creating && showEmail ? 'Start with a free unit. No school or card needed.' : remembered.account || showEmail ? 'Sign in to return to your IELTS work.' : 'Sign in to practise, review feedback and continue your preparation.'}
          </p>
        </header>

        {error && <div role="alert" className="ielts-auth-alert ielts-auth-alert--error">{error}</div>}
        {checkInbox && (
          <div role="status" className="ielts-auth-alert ielts-auth-check">
            <b>Check your email</b>
            <span>We sent a confirmation link to <strong>{checkInbox}</strong>. Open it on this phone to start your course. No email? Check the spam folder.</span>
          </div>
        )}

        <div>
          {remembered.account ? <RememberedAccount account={remembered.account} busy={busy}
            onContinue={() => {
              if (remembered.account?.provider === 'google') {
                void handleGoogleSignIn(remembered.account.email);
              } else if (remembered.account) {
                setEmail(remembered.account.email);
                setShowEmail(true);
                remembered.selectPassword();
                window.requestAnimationFrame(() => passwordRef.current?.focus());
              }
            }}
            onUseAnother={() => { remembered.chooseAnother(); resetForm(); }}
            onForget={() => { remembered.forget(); resetForm(); }}
          /> : <>
            <button type="button" data-auth-google className="ielts-auth-google" onClick={() => void handleGoogleSignIn()} disabled={busy}>
              <GoogleIcon className="h-5 w-5" />
              <span>{busy ? 'Connecting…' : 'Continue with Google'}</span>
            </button>
            <div className="ielts-auth-email-row">
              <button type="button" className="ielts-auth-email-toggle" disabled={busy}
                onClick={() => { setCreating(false); setShowEmail(value => !(value && !creating)); }} aria-expanded={showEmail && !creating} aria-controls="ielts-email-signin">
                {showEmail && !creating ? 'Hide email sign-in' : 'Sign in with email'}
              </button>
              <button type="button" className="ielts-auth-email-toggle ielts-auth-create" disabled={busy}
                onClick={() => { setCreating(true); setShowEmail(true); setError(null); }} aria-expanded={creating} aria-controls="ielts-email-create">
                Create an account with email
              </button>
            </div>
          </>}
          <RememberAccountPreference checked={remembered.remember} onChange={remembered.setRemember} disabled={busy} />
          {showEmail && creating && !checkInbox && <form id="ielts-email-create" className="ielts-auth-form" onSubmit={handleCreateAccount}>
            <label className="ielts-auth-field">Your name
              <input type="text" autoComplete="name" required maxLength={60} value={fullName} disabled={busy}
                placeholder="First and last name" onChange={event => setFullName(event.target.value)} />
            </label>
            <label className="ielts-auth-field">Email address
              <input type="email" autoComplete="email" required value={email} disabled={busy}
                onChange={event => setEmail(event.target.value)} />
            </label>
            <label className="ielts-auth-field">Password
              <input type="password" autoComplete="new-password" required minLength={8} value={password} disabled={busy}
                placeholder="At least 8 characters" onChange={event => setPassword(event.target.value)} />
            </label>
            <button className="ielts-auth-google" type="submit" disabled={busy}>{busy ? 'Creating your account…' : 'Create account and start free'}</button>
            <p className="ielts-auth-fineprint">Your first name and last initial may appear in weekly leagues.</p>
          </form>}
          {showEmail && !creating && <form id="ielts-email-signin" className="ielts-auth-form" onSubmit={handleEmailSignIn}>
            <label className="ielts-auth-field">Email address
              <input type="email" autoComplete="username" required value={email} disabled={busy}
                onChange={event => setEmail(event.target.value)} />
            </label>
            <label className="ielts-auth-field">Password
              <input ref={passwordRef} type="password" autoComplete="current-password" required value={password} disabled={busy}
                onChange={event => setPassword(event.target.value)} />
            </label>
            <button className="ielts-auth-google" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>}
        </div>

        <footer className="ielts-auth-footer">
          <p>New here? Use Google or create an account with email. No school required, and the first unit is free.</p>
          <p>Teachers can request access through their academic coordinator.</p>
        </footer>
      </div>
    </main>
  );
};

export default IELTSLoginView;
