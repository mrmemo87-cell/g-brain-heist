import React, { useEffect, useMemo, useState } from 'react';
import * as IELTSAuthService from '../../services/ieltsAuthService';
import '../../src/styles/ielts.css';

interface IELTSLoginViewProps {
  onAuthenticated: () => void;
}

type AuthMode = 'login' | 'signup';

const defaultUsernameFromEmail = (email: string): string => {
  return email.split('@')[0]?.replace(/[^a-z0-9]/gi, '')?.toLowerCase() ?? '';
};

const IELTSLoginView: React.FC<IELTSLoginViewProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add('ielts-theme');
    document.title = 'IELTS Prep Hub | Sign in';
    return () => {
      document.body.classList.remove('ielts-theme');
    };
  }, []);

  const isSignup = mode === 'signup';

  useEffect(() => {
    if (isSignup && email && !username) {
      setUsername(defaultUsernameFromEmail(email));
    }
  }, [email, isSignup, username]);

  const canSubmit = useMemo(() => {
    if (!email || !password) {
      return false;
    }
    if (isSignup) {
      return username.trim().length >= 3;
    }
    return true;
  }, [email, password, isSignup, username]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setInfo(null);

    try {
      if (mode === 'login') {
        await IELTSAuthService.login(email, password);
        onAuthenticated();
        return;
      }

      const outcome = await IELTSAuthService.signup({
        email,
        password,
        username: username.trim(),
        fullName: fullName.trim() || undefined,
      });

      if (outcome.requiresVerification) {
        setInfo('Check your email to confirm your account, then come back to sign in.');
        setMode('login');
      } else {
        onAuthenticated();
      }
    } catch (authError) {
      const message = authError instanceof Error ? authError.message : 'Authentication failed.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="ielts-auth-wrapper">
      <div className="ielts-auth-panel">
        <header className="ielts-auth-header">
          <div className="ielts-auth-badge">IELTS Prep Hub</div>
          <h1 className="ielts-auth-title">Focused IELTS preparation starts here.</h1>
          <p className="ielts-auth-subtitle">
            A calm, structured study environment for serious test takers and their mentors.
          </p>
        </header>

        <div className="ielts-auth-toggle">
          <button
            type="button"
            className={`ielts-auth-toggle__btn ${mode === 'login' ? 'ielts-auth-toggle__btn--active' : ''}`}
            onClick={() => setMode('login')}
            disabled={isSubmitting}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`ielts-auth-toggle__btn ${mode === 'signup' ? 'ielts-auth-toggle__btn--active' : ''}`}
            onClick={() => setMode('signup')}
            disabled={isSubmitting}
          >
            Create account
          </button>
        </div>

        <form className="ielts-auth-form" onSubmit={handleSubmit}>
          <label className="ielts-auth-field">
            <span>Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>

          <label className="ielts-auth-field">
            <span>Password</span>
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter a secure password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
            />
          </label>

          {isSignup && (
            <>
              <label className="ielts-auth-field">
                <span>Preferred display name</span>
                <input
                  type="text"
                  required
                  minLength={3}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="studyfocus"
                />
              </label>

              <label className="ielts-auth-field">
                <span>Full name (optional)</span>
                <input
                  type="text"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Your full name"
                  autoComplete="name"
                />
              </label>
            </>
          )}

          {error && <div className="ielts-auth-alert ielts-auth-alert--error">{error}</div>}
          {info && <div className="ielts-auth-alert ielts-auth-alert--info">{info}</div>}

          <button type="submit" className="ielts-primary-btn" disabled={!canSubmit || isSubmitting}>
            {isSubmitting ? 'Please wait…' : mode === 'login' ? 'Enter study hub' : 'Create account'}
          </button>
        </form>

        <footer className="ielts-auth-footer">
          <p>
            Teachers can request access through the academic coordinator. Student accounts are for IELTS preparation only –
            progress here stays separate from Brains Heist.
          </p>
        </footer>
      </div>
    </div>
  );
};

export default IELTSLoginView;
