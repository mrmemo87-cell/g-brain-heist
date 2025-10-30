import React, { useState, useEffect } from 'react';
import { ToastMessage } from '../types';

interface ToastProps extends ToastMessage {
  onDismiss: (id: number) => void;
}

const Toast: React.FC<ToastProps> = ({ id, message, type, onDismiss }) => {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onDismiss(id), 300);
    }, 4000); // 4 seconds visible

    return () => clearTimeout(timer);
  }, [id, onDismiss]);

  const baseClasses = "flex items-center p-3 rounded-xl shadow-lg transition-all duration-300";
  const typeClasses = {
    success: 'card-glass border-green-500/50 text-green-300 glow-success',
    error: 'card-glass border-red-500/50 text-red-300',
    info: 'card-glass border-blue-500/50 text-blue-300 glow-ion',
  };
  
  const animationClasses = exiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0';

  return (
    <div className={`${baseClasses} ${typeClasses[type]} ${animationClasses}`}>
      <p className="font-semibold text-sm">{message}</p>
    </div>
  );
};

export default Toast;