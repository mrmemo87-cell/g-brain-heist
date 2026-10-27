import React, { useEffect, useId, useState } from 'react';
import { forgetRememberedAccount, readRememberedAccount, REMEMBERED_ACCOUNT_KEY, type RememberedAccount as Account } from '../../services/rememberedAccount';
import './remembered-account.css';

export const useRememberedSignIn = () => {
  const [account, setAccount] = useState(readRememberedAccount);
  const [remember, setRemember] = useState(Boolean(account));
  const [passwordSelected, setPasswordSelected] = useState(false);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== null && event.key !== REMEMBERED_ACCOUNT_KEY) return;
      const saved = readRememberedAccount();
      setAccount(saved);
      setPasswordSelected(false);
      setRemember(Boolean(saved));
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  const chooseAnother = () => { setAccount(null); setPasswordSelected(false); setRemember(false); };
  const forget = () => { forgetRememberedAccount(); chooseAnother(); };
  const selectPassword = () => { setAccount(null); setPasswordSelected(true); };
  return { account, isReturning: Boolean(account) || passwordSelected, remember, setRemember, chooseAnother, forget, selectPassword };
};

export const RememberAccountPreference: React.FC<{
  checked: boolean; onChange: (value: boolean) => void; disabled?: boolean;
}> = ({ checked, onChange, disabled }) => {
  const id = useId();
  return <div className="remember-account-preference">
    <label><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)}
      disabled={disabled} aria-describedby={id} />Remember this account on this device</label>
    <p id={id}>Only use this on your own device. Private browsing may not keep this choice.</p>
  </div>;
};

const RememberedAccount: React.FC<{
  account: Account; busy: boolean; onContinue: () => void; onUseAnother: () => void; onForget: () => void;
}> = ({ account, busy, onContinue, onUseAnother, onForget }) => (
  <section className="remembered-account" aria-label="Remembered account">
    <div className="remembered-account__identity">
      <span className="remembered-account__avatar" aria-hidden="true">{account.name.slice(0, 1).toUpperCase()}</span>
      <div><strong>{account.name}</strong><span>{account.email}</span></div>
    </div>
    <button type="button" className="remembered-account__continue" onClick={onContinue} disabled={busy}>
      {busy ? 'Connecting…' : `Continue as ${account.name}`}
    </button>
    <p className="remembered-account__hint">{account.provider === 'google'
      ? 'Sign in securely with Google to continue.' : 'Enter your password to sign back in.'}</p>
    <div className="remembered-account__actions">
      <button type="button" onClick={onUseAnother} disabled={busy}>Use another account</button>
      <button type="button" onClick={onForget} disabled={busy}>Forget this account</button>
    </div>
  </section>
);
export default RememberedAccount;
