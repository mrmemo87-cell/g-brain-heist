import React, { useState, useEffect } from 'react';
import { ToastMessage } from '../types';

interface ToastProps extends ToastMessage {
  onDismiss: (id: number) => void;
}

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

  const baseClasses = "flex items-center justify-between gap-3 p-3 rounded-xl shadow-lg transition-all duration-300 min-h-[60px]";
  const typeClasses = {
    success: 'card-glass border-green-500/50 text-green-300 glow-success',
    error: 'card-glass border-red-500/50 text-red-300',
    info: 'card-glass border-blue-500/50 text-blue-300 glow-ion',
  };
  
  const animationClasses = exiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0';

  return (
    <div className={`${baseClasses} ${typeClasses[type]} ${animationClasses}`}>
      <p className="font-semibold text-sm flex-1">{message}</p>
      <div className="flex gap-2">
        {retryAction && type === 'error' && (
          <button
            onClick={handleRetry}
            className="px-3 py-1 text-xs font-bold rounded bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 transition-all"
          >
            🔄 Retry
          </button>
        )}
        <button
          onClick={handleDismiss}
          className="px-2 py-1 text-xs font-bold rounded hover:bg-white/10 transition-all"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

export default Toast;