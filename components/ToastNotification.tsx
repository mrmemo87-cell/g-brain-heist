import React, { useState, useEffect } from 'react';
import { notificationService, Notification, NotificationService } from '../services/notificationService';

interface ToastContainerProps {
  maxToasts?: number;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ maxToasts = 3 }) => {
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

      // Auto-dismiss based on priority
      const dismissDelay = notification.priority === 'urgent' ? 10000 : 5000;
      setTimeout(() => {
        dismissToast(notification.id);
      }, dismissDelay);
    });

    return () => {
      unsubscribe();
    };
  }, [maxToasts]);

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <div className="fixed top-20 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast, index) => (
        <Toast 
          key={toast.id} 
          notification={toast} 
          onDismiss={() => dismissToast(toast.id)}
          index={index}
        />
      ))}
    </div>
  );
};

interface ToastProps {
  notification: Notification;
  onDismiss: () => void;
  index: number;
}

const Toast: React.FC<ToastProps> = ({ notification, onDismiss, index }) => {
  const [isExiting, setIsExiting] = useState(false);
  const style = NotificationService.getNotificationStyle(notification.type);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => {
      onDismiss();
    }, 300);
  };

  useEffect(() => {
    // Mark as read when toast appears
    notificationService.markAsRead(notification.id);
  }, [notification.id]);

  const getPriorityStyle = () => {
    switch (notification.priority) {
      case 'urgent':
        return 'border-red-500 shadow-red-500/50 animate-pulse';
      case 'high':
        return 'border-orange-500 shadow-orange-500/30';
      case 'medium':
        return 'border-purple-500 shadow-purple-500/20';
      default:
        return 'border-gray-500 shadow-gray-500/10';
    }
  };

  return (
    <div
      className={`
        w-96 bg-gray-900 border-2 rounded-lg shadow-2xl pointer-events-auto
        transform transition-all duration-300 ease-out
        ${getPriorityStyle()}
        ${isExiting ? 'translate-x-[420px] opacity-0' : 'translate-x-0 opacity-100'}
        ${index === 0 ? 'animate-slideIn' : ''}
      `}
      style={{
        marginTop: index > 0 ? '8px' : '0',
      }}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={`text-3xl flex-shrink-0 ${style.bgColor} p-2 rounded-lg`}>
            {style.emoji}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h3 className={`font-bold text-sm ${style.color}`}>
                {notification.title}
              </h3>
              <button
                onClick={handleDismiss}
                className="text-gray-500 hover:text-white transition-colors flex-shrink-0"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">
              {notification.message}
            </p>
            {notification.priority === 'urgent' && (
              <div className="mt-2 flex items-center gap-1 text-xs text-red-400">
                <span className="animate-ping inline-block w-2 h-2 bg-red-500 rounded-full"></span>
                <span className="font-semibold">URGENT</span>
              </div>
            )}
          </div>
        </div>

        {/* Progress bar for auto-dismiss */}
        <div className="mt-3 h-1 bg-gray-800 rounded-full overflow-hidden">
          <div 
            className={`h-full ${style.bgColor} animate-shrink`}
            style={{
              animationDuration: notification.priority === 'urgent' ? '10s' : '5s'
            }}
          />
        </div>
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
