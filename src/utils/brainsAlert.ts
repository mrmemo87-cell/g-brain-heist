/**
 * Brains Heist branded alert modal.
 * Drop-in replacement for window.alert() that shows logo.png instead of emoji.
 *
 * Usage:
 *   import { brainsAlert } from '../src/utils/brainsAlert';
 *   brainsAlert('Scores released successfully.');
 *   brainsAlert('Unable to save.', 'error');
 */

type AlertType = 'success' | 'error' | 'info';

const GLOW: Record<AlertType, string> = {
  success: '0 0 24px rgba(0,255,180,0.45)',
  error:   '0 0 24px rgba(255,60,60,0.45)',
  info:    '0 0 24px rgba(0,212,255,0.45)',
};

const BORDER: Record<AlertType, string> = {
  success: 'rgba(0,255,180,0.5)',
  error:   'rgba(255,60,60,0.5)',
  info:    'rgba(0,212,255,0.5)',
};

export function brainsAlert(message: string, type: AlertType = 'info'): void {
  // Backdrop
  const backdrop = document.createElement('div');
  Object.assign(backdrop.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '99999',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(6px)',
    opacity: '0',
    transition: 'opacity 0.2s ease',
  } as CSSStyleDeclaration);

  // Card
  const card = document.createElement('div');
  card.setAttribute('role', 'alertdialog');
  card.setAttribute('aria-modal', 'true');
  Object.assign(card.style, {
    background: 'linear-gradient(135deg, #0d1117 0%, #161b22 100%)',
    border: `1.5px solid ${BORDER[type]}`,
    borderRadius: '16px',
    boxShadow: GLOW[type],
    padding: '28px 32px 24px',
    maxWidth: '420px',
    width: '90vw',
    textAlign: 'center',
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    transform: 'scale(0.92)',
    transition: 'transform 0.2s ease',
  } as CSSStyleDeclaration);

  // Logo
  const logo = document.createElement('img');
  logo.src = '/logo.png';
  logo.alt = 'Brains Heist';
  Object.assign(logo.style, {
    width: '52px',
    height: '52px',
    objectFit: 'contain',
    marginBottom: '8px',
    filter: 'drop-shadow(0 0 14px rgba(0,212,255,0.5))',
  } as CSSStyleDeclaration);

  // Title
  const title = document.createElement('div');
  title.textContent = 'Brains Heist';
  Object.assign(title.style, {
    fontSize: '13px',
    fontWeight: '700',
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
    color: '#6ee7f0',
    marginBottom: '14px',
  } as CSSStyleDeclaration);

  // Message
  const msg = document.createElement('div');
  msg.style.whiteSpace = 'pre-wrap';
  msg.style.fontSize = '14.5px';
  msg.style.lineHeight = '1.55';
  msg.style.color = '#e6edf3';
  msg.style.marginBottom = '22px';
  msg.textContent = message;

  // Button
  const btn = document.createElement('button');
  btn.textContent = 'OK';
  Object.assign(btn.style, {
    padding: '8px 36px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '14px',
    color: '#0d1117',
    background: 'linear-gradient(135deg, #00d4ff, #00ffb4)',
    boxShadow: '0 0 12px rgba(0,212,255,0.35)',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  } as CSSStyleDeclaration);

  btn.addEventListener('mouseenter', () => {
    btn.style.transform = 'scale(1.04)';
    btn.style.boxShadow = '0 0 20px rgba(0,212,255,0.55)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.transform = 'scale(1)';
    btn.style.boxShadow = '0 0 12px rgba(0,212,255,0.35)';
  });

  // Dismiss logic
  let dismissed = false;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Enter') dismiss();
  };
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    document.removeEventListener('keydown', onKey);
    backdrop.style.opacity = '0';
    card.style.transform = 'scale(0.92)';
    setTimeout(() => backdrop.remove(), 200);
  };

  btn.addEventListener('click', dismiss);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) dismiss();
  });
  document.addEventListener('keydown', onKey);

  // Assemble
  card.appendChild(logo);
  card.appendChild(title);
  card.appendChild(msg);
  card.appendChild(btn);
  backdrop.appendChild(card);
  document.body.appendChild(backdrop);

  // Animate in
  requestAnimationFrame(() => {
    backdrop.style.opacity = '1';
    card.style.transform = 'scale(1)';
    btn.focus();
  });
}

interface BrainsConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export function brainsConfirm({
  title = 'Please confirm',
  message,
  confirmLabel = 'Continue',
  cancelLabel = 'Cancel',
  destructive = false,
}: BrainsConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.setAttribute('role', 'presentation');
    Object.assign(backdrop.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '99999',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      background: 'rgba(2, 8, 23, 0.72)',
      backdropFilter: 'blur(8px)',
      opacity: '0',
      transition: 'opacity 0.18s ease',
    } as CSSStyleDeclaration);

    const card = document.createElement('section');
    card.setAttribute('role', 'alertdialog');
    card.setAttribute('aria-modal', 'true');
    Object.assign(card.style, {
      width: 'min(440px, 100%)',
      border: `1.5px solid ${destructive ? 'rgba(255,60,60,0.55)' : 'rgba(0,212,255,0.5)'}`,
      borderRadius: '20px',
      background: 'linear-gradient(135deg, #0d1117 0%, #161b22 100%)',
      boxShadow: destructive ? '0 0 28px rgba(255,60,60,0.34)' : '0 0 28px rgba(0,212,255,0.34)',
      padding: '26px',
      color: '#f8fafc',
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      transform: 'translateY(10px) scale(0.98)',
      transition: 'transform 0.18s ease',
    } as CSSStyleDeclaration);

    const logo = document.createElement('img');
    logo.src = '/logo.png';
    logo.alt = '';
    Object.assign(logo.style, {
      display: 'block',
      width: '52px',
      height: '52px',
      objectFit: 'contain',
      margin: '0 auto 8px',
      filter: 'drop-shadow(0 0 14px rgba(0,212,255,0.5))',
    } as CSSStyleDeclaration);

    const brand = document.createElement('div');
    brand.textContent = 'Brains Heist';
    Object.assign(brand.style, {
      color: '#6ee7f0',
      fontSize: '12px',
      fontWeight: '800',
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      marginBottom: '14px',
      textAlign: 'center',
    } as CSSStyleDeclaration);

    const heading = document.createElement('h2');
    heading.textContent = title;
    Object.assign(heading.style, {
      margin: '0 0 10px',
      fontSize: '22px',
      lineHeight: '1.25',
      textAlign: 'center',
    } as CSSStyleDeclaration);

    const body = document.createElement('p');
    body.textContent = message;
    Object.assign(body.style, {
      margin: '0',
      color: '#dbe7f5',
      fontSize: '15px',
      lineHeight: '1.6',
      whiteSpace: 'pre-wrap',
      textAlign: 'center',
    } as CSSStyleDeclaration);

    const actions = document.createElement('div');
    Object.assign(actions.style, {
      display: 'flex',
      justifyContent: 'center',
      flexWrap: 'wrap',
      gap: '10px',
      marginTop: '24px',
    } as CSSStyleDeclaration);

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = cancelLabel;
    Object.assign(cancel.style, {
      border: '1px solid #475569',
      borderRadius: '10px',
      background: '#1e293b',
      color: '#e2e8f0',
      padding: '10px 18px',
      fontWeight: '700',
      cursor: 'pointer',
    } as CSSStyleDeclaration);

    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.textContent = confirmLabel;
    Object.assign(confirm.style, {
      border: 'none',
      borderRadius: '10px',
      background: destructive ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #00d4ff, #00ffb4)',
      color: destructive ? '#ffffff' : '#0d1117',
      padding: '10px 18px',
      fontWeight: '800',
      cursor: 'pointer',
      boxShadow: destructive ? '0 0 16px rgba(239,68,68,0.35)' : '0 0 16px rgba(0,212,255,0.35)',
    } as CSSStyleDeclaration);

    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKeyDown);
      backdrop.style.opacity = '0';
      card.style.transform = 'translateY(10px) scale(0.98)';
      window.setTimeout(() => backdrop.remove(), 180);
      resolve(value);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish(false);
      if (event.key === 'Enter') finish(true);
    };

    cancel.addEventListener('click', () => finish(false));
    confirm.addEventListener('click', () => finish(true));
    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop) finish(false);
    });
    document.addEventListener('keydown', onKeyDown);

    actions.append(cancel, confirm);
    card.append(logo, brand, heading, body, actions);
    backdrop.append(card);
    document.body.append(backdrop);
    window.requestAnimationFrame(() => {
      backdrop.style.opacity = '1';
      card.style.transform = 'translateY(0) scale(1)';
      cancel.focus();
    });
  });
}
