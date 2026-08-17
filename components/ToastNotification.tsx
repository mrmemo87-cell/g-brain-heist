import React, { useState, useEffect } from 'react';
import { notificationService, Notification, NotificationService } from '../services/notificationService';

interface ToastContainerProps {
  maxToasts?: number;
  onAction?: (notification: Notification) => void;
}

const LOGO_SRC = '/logo.png';

export const ToastContainer: React.FC<ToastContainerProps> = ({ maxToasts = 3, onAction }) => {
  const [toasts, setToasts] = useState<Notification[]>([]);

  useEffect(() => {
    // Subscribe to new notifications
    const unsubscribe = notificationService.subscribe((notification) => {
      // Add new toast to the top
      setToasts(prev => {
        const newToasts = [notification, ...prev];
        // Keep only max toasts
        return newToasts.slice(0, maxToasts);
      });

      // Executive decisions remain visible until the School Head opens or dismisses them.
      if (notification.type !== 'school_head_decision') {
        const dismissDelay = notification.priority === 'urgent' ? 10000 : 5000;
        window.setTimeout(() => {
          dismissToast(notification.id);
        }, dismissDelay);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [maxToasts]);

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <div className="fixed inset-0 z-[10001] flex flex-col items-center justify-center gap-2 px-4 pointer-events-none">
      {toasts.map((toast, index) => (
        <Toast 
          key={toast.id} 
          notification={toast} 
          onDismiss={() => dismissToast(toast.id)}
          onAction={onAction}
          index={index}
        />
      ))}
    </div>
  );
};

interface ToastProps {
  notification: Notification;
  onDismiss: () => void;
  onAction?: (notification: Notification) => void;
  index: number;
}

const Toast: React.FC<ToastProps> = ({ notification, onDismiss, onAction, index }) => {
  const [isExiting, setIsExiting] = useState(false);
  const style = NotificationService.getNotificationStyle(notification.type);

  const handleDismiss = () => {
    if (notification.type === 'school_head_decision') {
      void notificationService.markAsRead(notification.id);
    }
    setIsExiting(true);
    window.setTimeout(() => {
      onDismiss();
    }, 300);
  };

  const handlePrimaryAction = () => {
    if (notification.type === 'school_head_decision') {
      onAction?.(notification);
    }
    handleDismiss();
  };

  useEffect(() => {
    if (notification.type !== 'school_head_decision') {
      void notificationService.markAsRead(notification.id);
    }
  }, [notification.id, notification.type]);

  const getPriorityStyle = () => {
    switch (notification.priority) {
      case 'urgent':
        return 'border-red-500/70 shadow-red-500/40';
      case 'high':
        return 'border-orange-500/70 shadow-orange-500/30';
      case 'medium':
        return 'border-purple-500/70 shadow-purple-500/20';
      default:
        return 'border-gray-500/70 shadow-gray-500/10';
    }
  };

  const getActionLabel = () => {
    if (notification.type === 'school_head_decision') {
      return 'Open Decision Center';
    }
    if (notification.action?.label) {
      return notification.action.label;
    }
    if (notification.priority === 'urgent') {
      return 'Review now';
    }
    return 'Got it';
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={`
        w-[min(92vw,430px)] rounded-2xl border bg-slate-950/95 shadow-2xl backdrop-blur-md pointer-events-auto
        transform transition-all duration-300 ease-out
        ${getPriorityStyle()}
        ${isExiting ? 'translate-x-[460px] opacity-0 scale-[0.98]' : 'translate-x-0 opacity-100 scale-100'}
        ${index === 0 ? 'animate-slideIn' : ''}
      `}
      style={{
        marginTop: index > 0 ? '8px' : '0',
      }}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <img
            src={LOGO_SRC}
            alt="Brains Heist"
            className="h-11 w-11 rounded-xl border border-white/20 bg-black/30 p-1.5 shadow-md object-contain"
            loading="lazy"
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.18em] text-white/60">Brains Heist</p>
                <h3 className={`font-bold text-sm leading-tight ${style.color} break-words`}>
                  {notification.title}
                </h3>
              </div>
              <button
                onClick={handleDismiss}
                className="rounded-lg px-2 py-1 text-xs font-bold text-gray-400 transition hover:bg-white/10 hover:text-white flex-shrink-0"
                aria-label="Dismiss notification"
              >
                ✕
              </button>
            </div>

            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
              <span className={`text-base leading-none ${style.color}`}>{style.emoji}</span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-white/70">{notification.priority}</span>
            </div>

            <p className="text-sm text-gray-200 leading-relaxed break-words">
              {notification.message}
            </p>

            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                onClick={handlePrimaryAction}
                className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
              >
                {getActionLabel()}
              </button>
              {notification.priority === 'urgent' && (
                <div className="flex items-center gap-1 text-xs text-red-300">
                  <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="font-semibold">URGENT</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Progress bar for auto-dismiss */}
        {notification.type !== 'school_head_decision' && <div className="mt-3 h-1 bg-gray-800/80 rounded-full overflow-hidden">
          <div
            className={`h-full ${style.bgColor} animate-shrink`}
            style={{
              animationDuration: notification.priority === 'urgent' ? '10s' : '5s'
            }}
          />
        </div>}
      </div>
    </div>
  );
};

// Add these animations to your global CSS or Tailwind config
const styles = `
@keyframes slideIn {
  from {
    transform: translateX(420px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes shrink {
  from {
    width: 100%;
  }
  to {
    width: 0%;
  }
}

.animate-slideIn {
  animation: slideIn 0.3s ease-out;
}

.animate-shrink {
  animation: shrink linear;
}
`;

// Export styles for inclusion in main app
export const toastStyles = styles;
