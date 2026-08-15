import React, { useEffect, useState } from 'react';
import { ToastMessage } from '../types';

interface ToastProps extends ToastMessage {
  onDismiss: (id: number) => void;
  persistent?: boolean;
  actionLabel?: string;
  cancelLabel?: string;
  onCancel?: () => void;
}

const LOGO_SRC = '/logo.png';

const palette = {
  success: { accent: '#10b981', soft: '#ecfdf5', text: '#065f46', title: 'Success update' },
  error: { accent: '#e11d48', soft: '#fff1f2', text: '#9f1239', title: 'Action needed' },
  info: { accent: '#0284c7', soft: '#f0f9ff', text: '#075985', title: 'Heads up' },
  warning: { accent: '#d97706', soft: '#fffbeb', text: '#92400e', title: 'Confirm action' },
} as const;

const Toast: React.FC<ToastProps> = ({ id, message, type, retryAction, onDismiss, persistent = false, actionLabel, cancelLabel, onCancel }) => {
  const [exiting, setExiting] = useState(false);
  const theme = palette[type];

  useEffect(() => {
    if (persistent) return;
    const timer = window.setTimeout(() => {
      setExiting(true);
      window.setTimeout(() => onDismiss(id), 220);
    }, retryAction ? 8000 : 4000);
    return () => window.clearTimeout(timer);
  }, [id, onDismiss, persistent, retryAction]);

  const handleDismiss = () => {
    setExiting(true);
    window.setTimeout(() => onDismiss(id), 220);
  };

  const handlePrimaryAction = () => {
    retryAction?.();
    handleDismiss();
  };

  const handleCancel = () => {
    onCancel?.();
    handleDismiss();
  };

  const card = (
    <div
      role={persistent ? 'dialog' : 'status'}
      aria-live="polite"
      aria-modal={persistent || undefined}
      style={{
        width: 'min(92vw, 440px)',
        maxWidth: 440,
        overflow: 'hidden',
        border: `1px solid ${theme.accent}33`,
        borderRadius: 20,
        background: '#ffffff',
        color: '#172033',
        boxShadow: '0 24px 70px rgba(15,23,42,.28)',
        opacity: exiting ? 0 : 1,
        transform: exiting ? 'translateY(8px) scale(.985)' : 'translateY(0) scale(1)',
        transition: 'opacity .22s ease, transform .22s ease',
        pointerEvents: 'auto',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'linear-gradient(135deg,#11192f,#192846)', color: '#fff' }}>
        <img
          src={LOGO_SRC}
          alt="Brains Heist"
          style={{ display: 'block', width: 44, height: 44, maxWidth: 44, maxHeight: 44, flex: '0 0 44px', objectFit: 'contain', borderRadius: 11, padding: 4, background: 'rgba(255,255,255,.08)' }}
          loading="lazy"
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.15em', color: '#c9d6e8', marginBottom: 2 }}>Brains Heist</div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{theme.title}</div>
        </div>
        <span style={{ border: `1px solid ${theme.accent}66`, borderRadius: 999, background: `${theme.accent}22`, color: '#fff', padding: '5px 8px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em' }}>{type}</span>
      </div>

      <div style={{ padding: '16px' }}>
        <p style={{ margin: 0, whiteSpace: 'pre-line', overflowWrap: 'anywhere', fontSize: 14, lineHeight: 1.6, color: '#516075' }}>{message}</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
          {cancelLabel ? (
            <button type="button" onClick={handleCancel} style={{ minHeight: 40, border: '1px solid #d8e1ec', borderRadius: 10, background: '#fff', color: '#334155', padding: '8px 13px', font: '700 13px Inter,ui-sans-serif,system-ui', cursor: 'pointer' }}>
              {cancelLabel}
            </button>
          ) : null}
          <button type="button" onClick={retryAction ? handlePrimaryAction : handleDismiss} style={{ minHeight: 40, border: `1px solid ${theme.accent}`, borderRadius: 10, background: theme.accent, color: '#fff', padding: '8px 14px', font: '800 13px Inter,ui-sans-serif,system-ui', cursor: 'pointer' }}>
            {actionLabel || (retryAction ? 'Confirm' : 'OK')}
          </button>
        </div>
      </div>
    </div>
  );

  if (persistent) {
    return (
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 10060, display: 'grid', placeItems: 'center', padding: 16, background: 'rgba(15,23,42,.58)', backdropFilter: 'blur(5px)', pointerEvents: 'auto' }}
        onMouseDown={(event) => { if (event.target === event.currentTarget && !retryAction) handleDismiss(); }}
      >
        {card}
      </div>
    );
  }

  return <div style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 10060, pointerEvents: 'none' }}>{card}</div>;
};

export default Toast;
