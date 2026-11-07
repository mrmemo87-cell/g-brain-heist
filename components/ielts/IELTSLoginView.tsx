import React, { useEffect, useRef, useState } from 'react';
import { GoogleIcon } from '../icons';
import * as IELTSAuthService from '../../services/ieltsAuthService';
import RememberedAccount, { RememberAccountPreference, useRememberedSignIn } from '../auth/RememberedAccount';
import { clearRememberAccountIntent, prepareRememberAccount } from '../../services/rememberedAccount';
import '../../src/styles/ielts.css';

// Learners who arrive from the Russian landing page or have a Russian/Kyrgyz/Kazakh phone see this screen in Russian.
const prefersRussian = (): boolean => {
  try {
    const saved = window.localStorage.getItem('bh_ielts_landing_lang');
    if (saved === 'ru') return true;
    if (saved === 'en') return false;
  } catch { /* storage blocked */ }
  return /^(ru|ky|kk)/i.test(navigator.language || '');
};

// Instagram, Facebook and other in-app browsers: Google blocks its sign-in inside them, so email comes first.
const isInAppBrowser = (): boolean => /Instagram|FBAN|FBAV|FB_IAB|Line\/|Telegram|TikTok|musical_ly|Bytedance/i.test(navigator.userAgent || '');

// Anonymous funnel step for the owner's growth report, using the landing page's visitor id. Never for members.
const trackStep = (path: string) => {
  try {
    if (window.localStorage.getItem('bh_site_member')) return;
    const visitorId = window.localStorage.getItem('bh_site_visitor_id');
    if (!visitorId) return;
    let utm: Record<string, string> = {};
    try { utm = JSON.parse(window.localStorage.getItem('bh_ielts_first_touch') || '{}'); } catch { utm = {}; }
    const clean: Record<string, string> = {};
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) if (typeof utm[key] === 'string') clean[key] = utm[key];
    const body = JSON.stringify({ visitorId, path, utm: clean, device: /mobi|iphone|android/i.test(navigator.userAgent) ? 'phone' : 'desktop', locale: (navigator.language || '').slice(0, 20) });
    if (navigator.sendBeacon) navigator.sendBeacon('/api/site-visit', new Blob([body], { type: 'application/json' }));
  } catch { /* analytics is optional */ }
};

interface IELTSLoginViewProps {
  onAuthenticated: () => void;
}

const IELTSLoginView: React.FC<IELTSLoginViewProps> = ({ onAuthenticated }) => {
  const remembered = useRememberedSignIn();
  const [ru] = useState(prefersRussian);
  const [inApp] = useState(isInAppBrowser);
  const tx = (en: string, russian: string) => (ru ? russian : en);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Learners from ads often have no Google account handy, and Google sign-in fails inside Instagram:
  // there, the email sign-up form opens straight away.
  const [showEmail, setShowEmail] = useState(() => isInAppBrowser() && !remembered.account);
  const [creating, setCreating] = useState(() => isInAppBrowser() && !remembered.account);
  const [fullName, setFullName] = useState('');
  const [checkInbox, setCheckInbox] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.body.classList.add('ielts-theme');
    document.title = ru ? 'Brains Heist IELTS | Вход' : 'IELTS Prep Hub | Sign in';
    trackStep('/ielts/signup');
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
      setError(tx('We couldn’t connect to Google. Please try again.', 'Не удалось подключиться к Google. Попробуйте ещё раз или войдите по email.'));
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
      setError(authError instanceof Error ? authError.message : tx('Unable to sign in. Please try again.', 'Не удалось войти. Попробуйте ещё раз.'));
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
    if (password.length < 8) { setError(tx('Use at least 8 characters for your password.', 'Пароль должен быть не короче 8 символов.')); return; }
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
      trackStep('/ielts/signup-created');
      if (requiresVerification) setCheckInbox(cleanEmail);
      else onAuthenticated();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : tx('Unable to create your account. Please try again.', 'Не удалось создать аккаунт. Попробуйте ещё раз.'));
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
          <h1 className="ielts-auth-title">{creating && showEmail ? tx('Create your free account.', 'Создайте бесплатный аккаунт') : remembered.account || showEmail ? tx('Welcome back.', 'С возвращением!') : tx('Your next IELTS step starts here.', 'Начните подготовку к IELTS бесплатно')}</h1>
          <p className="ielts-auth-subtitle">
            {creating && showEmail ? tx('Start with a free unit. No school or card needed.', 'Первый юнит — бесплатно. Без карты, за 1 минуту.') : remembered.account || showEmail ? tx('Sign in to return to your IELTS work.', 'Войдите, чтобы продолжить подготовку.') : tx('Sign in to practise, review feedback and continue your preparation.', 'Создайте аккаунт за минуту — первый юнит бесплатно, без карты.')}
          </p>
        </header>

        {error && <div role="alert" className="ielts-auth-alert ielts-auth-alert--error">{error}</div>}
        {checkInbox && (
          <div role="status" className="ielts-auth-alert ielts-auth-check">
            <b>{tx('Check your email', 'Проверьте почту')}</b>
            <span>{ru
              ? <>Мы отправили ссылку для подтверждения на <strong>{checkInbox}</strong>. Откройте её на этом телефоне — и курс начнётся. Письма нет? Проверьте папку «Спам».</>
              : <>We sent a confirmation link to <strong>{checkInbox}</strong>. Open it on this phone to start your course. No email? Check the spam folder.</>}</span>
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
            {inApp
              ? <p className="ielts-auth-fineprint">{tx('Google sign-in does not work inside Instagram. Create an account with email below, or open this page in your browser.', 'Вход через Google не работает внутри Instagram. Зарегистрируйтесь по email ниже или откройте страницу в браузере (⋯ → «Открыть в браузере»).')}</p>
              : <button type="button" data-auth-google className="ielts-auth-google" onClick={() => void handleGoogleSignIn()} disabled={busy}>
                <GoogleIcon className="h-5 w-5" />
                <span>{busy ? tx('Connecting…', 'Подключение…') : tx('Continue with Google', 'Продолжить с Google')}</span>
              </button>}
            <div className="ielts-auth-email-row">
              <button type="button" className="ielts-auth-email-toggle" disabled={busy}
                onClick={() => { setCreating(false); setShowEmail(value => !(value && !creating)); }} aria-expanded={showEmail && !creating} aria-controls="ielts-email-signin">
                {showEmail && !creating ? tx('Hide email sign-in', 'Скрыть вход по email') : tx('Sign in with email', 'Уже есть аккаунт? Войти')}
              </button>
              <button type="button" className="ielts-auth-email-toggle ielts-auth-create" disabled={busy}
                onClick={() => { setCreating(true); setShowEmail(true); setError(null); }} aria-expanded={creating} aria-controls="ielts-email-create">
                {tx('Create an account with email', 'Зарегистрироваться по email')}
              </button>
            </div>
          </>}
          <RememberAccountPreference checked={remembered.remember} onChange={remembered.setRemember} disabled={busy} />
          {showEmail && creating && !checkInbox && <form id="ielts-email-create" className="ielts-auth-form" onSubmit={handleCreateAccount}>
            <label className="ielts-auth-field">{tx('Your name', 'Ваше имя')}
              <input type="text" autoComplete="name" required maxLength={60} value={fullName} disabled={busy}
                placeholder={tx('First and last name', 'Имя и фамилия')} onChange={event => setFullName(event.target.value)} />
            </label>
            <label className="ielts-auth-field">{tx('Email address', 'Email')}
              <input type="email" autoComplete="email" required value={email} disabled={busy}
                onChange={event => setEmail(event.target.value)} />
            </label>
            <label className="ielts-auth-field">{tx('Password', 'Пароль')}
              <input type="password" autoComplete="new-password" required minLength={8} value={password} disabled={busy}
                placeholder={tx('At least 8 characters', 'Не меньше 8 символов')} onChange={event => setPassword(event.target.value)} />
            </label>
            <button className="ielts-auth-google" type="submit" disabled={busy}>{busy ? tx('Creating your account…', 'Создаём аккаунт…') : tx('Create account and start free', 'Начать бесплатно')}</button>
            <p className="ielts-auth-fineprint">{tx('Your first name and last initial may appear in weekly leagues.', 'Ваше имя и первая буква фамилии могут появляться в еженедельных лигах.')}</p>
          </form>}
          {showEmail && !creating && <form id="ielts-email-signin" className="ielts-auth-form" onSubmit={handleEmailSignIn}>
            <label className="ielts-auth-field">{tx('Email address', 'Email')}
              <input type="email" autoComplete="username" required value={email} disabled={busy}
                onChange={event => setEmail(event.target.value)} />
            </label>
            <label className="ielts-auth-field">{tx('Password', 'Пароль')}
              <input ref={passwordRef} type="password" autoComplete="current-password" required value={password} disabled={busy}
                onChange={event => setPassword(event.target.value)} />
            </label>
            <button className="ielts-auth-google" type="submit" disabled={busy}>{busy ? tx('Signing in…', 'Входим…') : tx('Sign in', 'Войти')}</button>
          </form>}
        </div>

        <footer className="ielts-auth-footer">
          <p>{tx('New here? Use Google or create an account with email. No school required, and the first unit is free.', 'Впервые здесь? Зарегистрируйтесь — школа не нужна, первый юнит бесплатно.')}</p>
          {!ru && <p>Teachers can request access through their academic coordinator.</p>}
        </footer>
      </div>
    </main>
  );
};

export default IELTSLoginView;
