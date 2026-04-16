import React, { useState, useEffect } from 'react';
import { ToastMessage } from '../types';

interface ToastProps extends ToastMessage {
  onDismiss: (id: number) => void;
}

const LOGO_SRC = '/logo.png';

const Toast: React.FC<ToastProps> = ({ id, message, type, retryAction, onDismiss }) => {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onDismiss(id), 300);
    }, retryAction ? 8000 : 4000); // Longer duration if there's a retry action

    return () => clearTimeout(timer);
  }, [id, onDismiss, retryAction]);

  const handleDismiss = () => {
    setExiting(true);
    setTimeout(() => onDismiss(id), 300);
  };

  const handleRetry = () => {
    if (retryAction) {
      retryAction();
      handleDismiss();
    }
  };

  const typeStyles = {
    success: {
      container: 'border-emerald-300 bg-emerald-900 text-emerald-50',
      badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40',
      title: 'Success update',
      action: 'Got it',
    },
    error: {
      container: 'border-rose-300 bg-rose-900 text-rose-50',
      badge: 'bg-rose-500/20 text-rose-300 border-rose-400/40',
      title: 'Action needed',
      action: retryAction ? 'Retry now' : 'Dismiss',
    },
    info: {
      container: 'border-sky-300 bg-sky-900 text-sky-50',
      badge: 'bg-sky-500/20 text-sky-300 border-sky-400/40',
      title: 'Heads up',
      action: 'Understood',
    },
    warning: {
      container: 'border-amber-300 bg-amber-900 text-amber-50',
      badge: 'bg-amber-500/20 text-amber-300 border-amber-400/40',
      title: 'Warning',
      action: 'Review',
    },
  } as const;

  const style = typeStyles[type];
  const animationClasses = exiting ? 'opacity-0 translate-x-4 scale-[0.98]' : 'opacity-100 translate-x-0 scale-100';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-auto w-[min(92vw,420px)] rounded-2xl border shadow-2xl ring-1 ring-white/20 transition-all duration-300 ${style.container} ${animationClasses}`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <img
            src={LOGO_SRC}
            alt="Brains Heist"
            className="h-11 w-11 rounded-xl border border-white/20 bg-black/30 p-1.5 shadow-md object-contain"
            loading="lazy"
          />

          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-white/70">Brains Heist</p>
                <h4 className="text-sm font-bold leading-tight">{style.title}</h4>
              </div>
              <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${style.badge}`}>
                {type}
              </span>
            </div>

            <p className="text-sm font-medium leading-relaxed text-white/95 break-words">{message}</p>

            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                onClick={retryAction && type === 'error' ? handleRetry : handleDismiss}
                className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
              >
                {style.action}
              </button>
              <button
                onClick={handleDismiss}
                className="rounded-lg px-2 py-1 text-xs font-bold text-white/80 transition hover:bg-white/10 hover:text-white"
                aria-label="Dismiss notification"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Toast;
