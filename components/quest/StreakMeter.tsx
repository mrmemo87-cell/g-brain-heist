import React, { useRef, useEffect } from 'react';
import gsap from 'gsap';

interface StreakMeterProps {
  streak: number;
  maxDisplay?: number;
}

const THRESHOLDS = [
  { count: 6, label: 'CHEST BONUS', color: 'from-yellow-400 to-amber-500', textColor: 'text-yellow-200' },
  { count: 4, label: '×1.1 BONUS', color: 'from-fuchsia-500 to-purple-600', textColor: 'text-fuchsia-200' },
  { count: 2, label: 'ON FIRE', color: 'from-cyan-400 to-blue-500', textColor: 'text-cyan-200' },
];

const StreakMeter: React.FC<StreakMeterProps> = ({ streak, maxDisplay = 7 }) => {
  const barRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  const activeThreshold = THRESHOLDS.find(t => streak >= t.count) ?? null;
  const fillPercent = Math.min(100, (streak / maxDisplay) * 100);

  useEffect(() => {
    if (barRef.current) {
      gsap.to(barRef.current, {
        width: `${fillPercent}%`,
        duration: 0.5,
        ease: 'power2.out',
      });
    }
    if (labelRef.current && streak > 0) {
      gsap.fromTo(labelRef.current,
        { scale: 1.4, opacity: 0.5 },
        { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(2)' }
      );
    }
  }, [streak, fillPercent]);

  if (streak === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Streak</span>
      <div className="relative flex-1 h-3 rounded-full bg-slate-800 border border-slate-700 overflow-hidden min-w-[100px]">
        <div
          ref={barRef}
          className={`h-full rounded-full bg-gradient-to-r ${activeThreshold?.color ?? 'from-slate-500 to-slate-600'} transition-shadow`}
          style={{
            width: 0,
            boxShadow: activeThreshold ? `0 0 12px ${streak >= 6 ? 'rgba(250,204,21,0.5)' : streak >= 4 ? 'rgba(217,70,239,0.5)' : 'rgba(34,211,238,0.4)'}` : undefined,
          }}
        />
      </div>
      <span
        ref={labelRef}
        className={`text-xs font-bold tabular-nums ${activeThreshold?.textColor ?? 'text-slate-400'}`}
      >
        {streak}🔥 {activeThreshold?.label ?? ''}
      </span>
    </div>
  );
};

export default StreakMeter;
