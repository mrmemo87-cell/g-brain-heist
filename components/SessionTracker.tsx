import React, { useState, useEffect } from 'react';
import { SessionStatus } from '../types';
import { ClockIcon, MultiplierIcon } from './icons';

interface SessionTrackerProps {
  sessionStatus: SessionStatus;
}

const SessionTracker: React.FC<SessionTrackerProps> = ({ sessionStatus }) => {
  const [remaining, setRemaining] = useState(sessionStatus.remaining_seconds);

  useEffect(() => {
    if (sessionStatus.active) {
      const interval = setInterval(() => {
        setRemaining(prev => (prev > 0 ? prev - 1 : 0));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [sessionStatus.active]);

  const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  if (sessionStatus.today_used && !sessionStatus.active) {
    return (
        <div className="card-glass p-4 flex flex-col items-center text-center">
            <h3 className="font-heading text-lg text-gray-400 mb-2">Session Used</h3>
            <p className="text-sm text-gray-500">Daily session bonus claimed. Come back tomorrow!</p>
        </div>
    );
  }

  return (
    <div className="card-glass glow-success p-4" style={{ borderColor: 'rgba(22, 226, 161, 0.3)' }}>
      <h3 className="font-heading text-lg mb-3 text-center" style={{ color: 'var(--success-teal)' }}>Daily Session Bonus</h3>
      <div className="flex justify-around items-center">
        <div className="flex flex-col items-center">
          <div className="w-8 h-8 mb-1" style={{ color: 'var(--success-teal)' }}><ClockIcon /></div>
          <span className="text-2xl font-mono font-bold">{formatTime(remaining)}</span>
          <span className="text-xs" style={{ color: 'var(--mist-400)' }}>Time Left</span>
        </div>
        <div className="h-12 w-px bg-white/10"></div>
        <div className="flex flex-col items-center">
          <div className="w-8 h-8 mb-1" style={{ color: 'var(--success-teal)' }}><MultiplierIcon /></div>
          <span className="text-2xl font-mono font-bold">{sessionStatus.current_multiplier.toFixed(2)}x</span>
          <span className="text-xs" style={{ color: 'var(--mist-400)' }}>Multiplier</span>
        </div>
      </div>
    </div>
  );
};

export default SessionTracker;
